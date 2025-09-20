// Payoneer rail handler for global contractor payouts

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

interface PayoneerPayout {
  payout_id: string;
  payee_id: string;
  amount: string;
  currency: string;
  description: string;
  client_reference_id: string;
  payout_method: string;
  status: string;
  created_time: string;
  last_updated_time: string;
}

interface PayoneerPayee {
  payee_id: string;
  payee_status: string;
  email: string;
  first_name: string;
  last_name: string;
}

export class PayoneerRailHandler extends BaseRailHandler {
  rail: Rail = 'payoneer';
  private baseUrl: string;
  private apiKey: string;
  private partnerId: string;

  constructor() {
    super();
    this.baseUrl = process.env.PAYONEER_API_URL || 'https://api.sandbox.payoneer.com';
    this.apiKey = process.env.PAYONEER_API_KEY!;
    this.partnerId = process.env.PAYONEER_PARTNER_ID!;
    
    if (!this.apiKey || !this.partnerId) {
      throw new Error('Payoneer credentials are not set');
    }
  }

  async createPayout(payout: Payout, method: WithdrawalMethod): Promise<PayoutResult> {
    try {
      this.validateMethod(method);

      if (!method.payoneer_payee_id) {
        throw new PayoutError(
          'Payoneer payee ID is required',
          'PAYONEER_PAYEE_MISSING',
          false
        );
      }

      // Create payout via Payoneer API
      const payoutData = {
        payee_id: method.payoneer_payee_id,
        amount: (payout.net_amount / 100).toFixed(2), // Convert from minor units
        currency: payout.currency,
        description: payout.description || `Pactify payout ${payout.trace_id}`,
        client_reference_id: payout.trace_id,
        payout_method: 'CARD' // Default to card payout
      };

      const response = await this.makePayoneerRequest(
        'POST',
        '/v4/payouts',
        payoutData
      );

      const payoneerPayout = response as PayoneerPayout;
      
      // Calculate estimated arrival (typically 1-2 hours for card, 2-7 days for bank)
      const estimatedArrival = this.calculateEstimatedArrival(2 * 60); // 2 hours

      return {
        success: true,
        provider_reference: payoneerPayout.payout_id,
        estimated_arrival: estimatedArrival
      };

    } catch (error) {
      throw this.handleProviderError(error, 'payout creation');
    }
  }

  async getPayoutStatus(providerReference: string): Promise<PayoutStatus> {
    try {
      const response = await this.makePayoneerRequest(
        'GET',
        `/v4/payouts/${providerReference}`
      );
      
      const payout = response as PayoneerPayout;
      return this.mapProviderStatus(payout.status);
    } catch (error) {
      throw this.handleProviderError(error, 'status check');
    }
  }

  async cancelPayout(providerReference: string): Promise<boolean> {
    try {
      await this.makePayoneerRequest(
        'POST',
        `/v4/payouts/${providerReference}/cancel`
      );
      return true;
    } catch (error) {
      // Payoneer may return specific error codes for non-cancelable payouts
      if (error.status === 400 && error.code === 'PAYOUT_NOT_CANCELABLE') {
        return false;
      }
      throw this.handleProviderError(error, 'payout cancellation');
    }
  }

  async getQuote(amount: number, currency: Currency, method: WithdrawalMethod): Promise<PayoutQuote> {
    try {
      this.validateMethod(method);

      const fees = this.calculateFees(amount, method.fee_structure);
      
      // Payoneer charges ~1-2% + fixed fee depending on payout method
      const payoneerFee = Math.max(fees.providerFee, Math.round(amount * 0.02));
      const netAmount = amount - fees.platformFee - payoneerFee;
      
      const processingTime = this.formatProcessingTime(60, 48 * 60); // 1 hour to 2 days
      const estimatedArrival = this.calculateEstimatedArrival(2 * 60); // 2 hours

      return {
        rail: this.rail,
        method_id: method.id,
        amount,
        currency,
        platform_fee: fees.platformFee,
        provider_fee: payoneerFee,
        net_amount: netAmount,
        processing_time: processingTime,
        estimated_arrival: estimatedArrival,
        supports_instant: true // Card payouts are typically instant
      };
    } catch (error) {
      throw this.handleProviderError(error, 'quote generation');
    }
  }

  /**
   * Get payee information from Payoneer
   */
  async getPayeeInfo(payeeId: string): Promise<PayoneerPayee | null> {
    try {
      const response = await this.makePayoneerRequest(
        'GET',
        `/v4/payees/${payeeId}`
      );
      
      return response as PayoneerPayee;
    } catch (error) {
      console.error('Error getting payee info:', error);
      return null;
    }
  }

  /**
   * Create a new payee in Payoneer (for onboarding)
   */
  async createPayee(email: string, firstName: string, lastName: string): Promise<string> {
    try {
      const payeeData = {
        email,
        first_name: firstName,
        last_name: lastName,
        payee_type: 'Individual'
      };

      const response = await this.makePayoneerRequest(
        'POST',
        '/v4/payees',
        payeeData
      );

      const payee = response as PayoneerPayee;
      return payee.payee_id;

    } catch (error) {
      throw this.handleProviderError(error, 'payee creation');
    }
  }

  private async makePayoneerRequest(
    method: string,
    endpoint: string,
    body?: any
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Partner-ID': this.partnerId
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
        code: errorData?.error_code || 'api_error',
        message: errorData?.message || response.statusText,
        details: errorData
      };
    }

    return response.json();
  }

  protected mapProviderStatus(providerStatus: string): PayoutStatus {
    switch (providerStatus.toUpperCase()) {
      case 'PENDING':
        return 'processing';
      case 'COMPLETED':
        return 'paid';
      case 'FAILED':
        return 'failed';
      case 'CANCELLED':
        return 'cancelled';
      case 'RETURNED':
        return 'returned';
      case 'PROCESSING':
        return 'processing';
      default:
        console.warn(`Unknown Payoneer payout status: ${providerStatus}`);
        return 'processing';
    }
  }

  protected handleProviderError(error: any, action: string): PayoutError {
    if (error.status && error.code) {
      const isRetryable = error.status >= 500 || 
                          error.status === 429 ||
                          error.code === 'RATE_LIMIT_EXCEEDED';

      return new PayoutError(
        `Payoneer ${action} failed: ${error.message}`,
        `PAYONEER_${error.code}`,
        isRetryable,
        error.status === 429 ? 60 : undefined
      );
    }

    return super.handleProviderError(error, action);
  }
}