// PayPal rail handler for PayPal payouts

import { BaseRailHandler } from './base-handler';
import { 
  Rail, 
  Payout, 
  WithdrawalMethod, 
  PayoutResult, 
  PayoutStatus, 
  PayoutQuote,
  Currency,
  PayoutError 
} from '../types';

interface PayPalBatchResponse {
  batch_header: {
    payout_batch_id: string;
    batch_status: string;
    time_created: string;
    time_completed?: string;
  };
  items: PayPalPayoutItem[];
}

interface PayPalPayoutItem {
  payout_item_id: string;
  transaction_id?: string;
  transaction_status: string;
  payout_item_fee?: {
    currency: string;
    value: string;
  };
  payout_batch_id: string;
  sender_batch_id: string;
  payout_item: {
    amount: {
      currency: string;
      value: string;
    };
    receiver: string;
    sender_item_id: string;
  };
  time_processed?: string;
  errors?: Array<{
    name: string;
    message: string;
  }>;
}

export class PayPalRailHandler extends BaseRailHandler {
  rail: Rail = 'paypal';
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    super();
    this.baseUrl = process.env.PAYPAL_API_URL || 'https://api.paypal.com';
    this.clientId = process.env.PAYPAL_CLIENT_ID!;
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET!;
    
    if (!this.clientId || !this.clientSecret) {
      throw new Error('PayPal credentials are not set');
    }
  }

  async createPayout(payout: Payout, method: WithdrawalMethod): Promise<PayoutResult> {
    try {
      this.validateMethod(method);

      if (!method.paypal_receiver) {
        throw new PayoutError(
          'PayPal receiver email is required',
          'PAYPAL_RECEIVER_MISSING',
          false
        );
      }

      const batch = await this.createPayoutBatch(payout, method);
      
      if (batch.items.length === 0) {
        throw new PayoutError(
          'PayPal payout batch creation failed',
          'PAYPAL_BATCH_CREATION_FAILED',
          true
        );
      }

      const item = batch.items[0];
      const estimatedArrival = this.calculateEstimatedArrival(30); // 30 minutes typical

      return {
        success: true,
        provider_reference: item.payout_item_id,
        estimated_arrival: estimatedArrival
      };

    } catch (error) {
      throw this.handleProviderError(error, 'payout creation');
    }
  }

  async getPayoutStatus(providerReference: string): Promise<PayoutStatus> {
    try {
      const response = await this.makePayPalRequest(
        'GET',
        `/v1/payments/payouts-item/${providerReference}`
      );
      
      const item = response as PayPalPayoutItem;
      return this.mapProviderStatus(item.transaction_status);
    } catch (error) {
      throw this.handleProviderError(error, 'status check');
    }
  }

  async getQuote(amount: number, currency: Currency, method: WithdrawalMethod): Promise<PayoutQuote> {
    try {
      this.validateMethod(method);

      const fees = this.calculateFees(amount, method.fee_structure);
      // PayPal typically charges 2% for payouts
      const paypalFee = Math.round(amount * 0.02);
      const totalProviderFee = Math.max(fees.providerFee, paypalFee);
      
      const netAmount = amount - fees.platformFee - totalProviderFee;
      const processingTime = this.formatProcessingTime(30, 24 * 60); // 30 min to 24 hours
      const estimatedArrival = this.calculateEstimatedArrival(30);

      return {
        rail: this.rail,
        method_id: method.id,
        amount,
        currency,
        platform_fee: fees.platformFee,
        provider_fee: totalProviderFee,
        net_amount: netAmount,
        processing_time: processingTime,
        estimated_arrival: estimatedArrival,
        supports_instant: true
      };
    } catch (error) {
      throw this.handleProviderError(error, 'quote generation');
    }
  }

  private async createPayoutBatch(
    payout: Payout, 
    method: WithdrawalMethod
  ): Promise<PayPalBatchResponse> {
    const batchId = `pactify_${payout.trace_id}`;
    const itemId = `item_${payout.id}`;

    const payoutData = {
      sender_batch_header: {
        sender_batch_id: batchId,
        email_subject: 'You have a payout!',
        email_message: 'You have received a payout from Pactify.'
      },
      items: [
        {
          recipient_type: 'EMAIL',
          amount: {
            value: (payout.net_amount / 100).toFixed(2), // Convert from minor units
            currency: payout.currency
          },
          note: payout.description || `Pactify payout ${payout.trace_id}`,
          sender_item_id: itemId,
          receiver: method.paypal_receiver,
          alternate_notification_method: {
            phone: {
              country_code: '1',
              national_number: '5551234567'
            }
          }
        }
      ]
    };

    const response = await this.makePayPalRequest('POST', '/v1/payments/payouts', payoutData);
    return response as PayPalBatchResponse;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
      throw new Error(`PayPal authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // 1 minute buffer

    return this.accessToken;
  }

  private async makePayPalRequest(
    method: string, 
    endpoint: string, 
    body?: any
  ): Promise<any> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `pactify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    const options: RequestInit = {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    };

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw {
        status: response.status,
        code: errorData?.name || 'api_error',
        message: errorData?.message || response.statusText,
        details: errorData
      };
    }

    return response.json();
  }

  protected mapProviderStatus(providerStatus: string): PayoutStatus {
    switch (providerStatus.toUpperCase()) {
      case 'PENDING':
      case 'PROCESSING':
        return 'processing';
      case 'SUCCESS':
        return 'paid';
      case 'FAILED':
        return 'failed';
      case 'CANCELED':
      case 'CANCELLED':
        return 'cancelled';
      case 'RETURNED':
      case 'REVERSED':
        return 'returned';
      case 'BLOCKED':
        return 'failed';
      default:
        console.warn(`Unknown PayPal payout status: ${providerStatus}`);
        return 'processing';
    }
  }

  protected handleProviderError(error: any, action: string): PayoutError {
    if (error.status && error.code) {
      const isRetryable = error.status >= 500 || 
                          error.status === 429 ||
                          error.code === 'RATE_LIMIT_ERROR';

      return new PayoutError(
        `PayPal ${action} failed: ${error.message}`,
        `PAYPAL_${error.code}`,
        isRetryable,
        error.status === 429 ? 60 : undefined
      );
    }

    return super.handleProviderError(error, action);
  }
}