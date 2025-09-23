// Wise rail handler for international transfers

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

interface WiseQuote {
  id: string;
  rate: number;
  fee: number;
  payOut: string;
}

interface WiseTransfer {
  id: string;
  user: number;
  targetAccount: number;
  sourceAccount: number;
  quote: number;
  status: string;
  reference: string;
  rate: number;
  created: string;
  business: number;
  transferRequest: number;
  details: {
    reference: string;
  };
  hasActiveIssues: boolean;
  sourceCurrency: string;
  sourceValue: number;
  targetCurrency: string;
  targetValue: number;
  customerTransactionId: string;
}

export class WiseRailHandler extends BaseRailHandler {
  rail: Rail = 'wise';
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    super();
    this.baseUrl = process.env.WISE_API_URL || 'https://api.transferwise.com';
    this.apiKey = process.env.WISE_API_KEY || '';
    
    // Only check for API key at runtime, not during build
    if (!this.apiKey && process.env.NODE_ENV !== 'production' && typeof window === 'undefined') {
      console.warn('WISE_API_KEY is not set - Wise payments will not function');
    }
  }

  async createPayout(payout: Payout, method: WithdrawalMethod): Promise<PayoutResult> {
    if (!this.apiKey) {
      throw new PayoutError(
        'WISE_API_KEY is not configured',
        'WISE_NOT_CONFIGURED',
        false
      );
    }
    
    try {
      this.validateMethod(method);

      if (!method.wise_recipient_id) {
        throw new PayoutError(
          'Wise recipient ID is required',
          'WISE_RECIPIENT_MISSING',
          false
        );
      }

      // Step 1: Create quote
      const quote = await this.createQuote(payout.amount, payout.currency, method.currency);

      // Step 2: Create transfer
      const transfer = await this.createTransfer(quote.id, method.wise_recipient_id, payout);

      // Step 3: Fund transfer (in production, this would transfer from your Wise business account)
      // For now, we'll assume the transfer is created successfully
      
      const estimatedArrival = this.calculateEstimatedArrival(2 * 60); // 2 hours typical

      return {
        success: true,
        provider_reference: transfer.id.toString(),
        estimated_arrival: estimatedArrival
      };

    } catch (error) {
      throw this.handleProviderError(error, 'payout creation');
    }
  }

  async getPayoutStatus(providerReference: string): Promise<PayoutStatus> {
    if (!this.apiKey) {
      throw new PayoutError('WISE_API_KEY is not configured', 'WISE_NOT_CONFIGURED', false);
    }
    
    try {
      const response = await this.makeWiseRequest(
        'GET',
        `/v1/transfers/${providerReference}`
      );
      
      const transfer = response as WiseTransfer;
      return this.mapProviderStatus(transfer.status);
    } catch (error) {
      throw this.handleProviderError(error, 'status check');
    }
  }

  async cancelPayout(providerReference: string): Promise<boolean> {
    if (!this.apiKey) {
      throw new PayoutError('WISE_API_KEY is not configured', 'WISE_NOT_CONFIGURED', false);
    }
    
    try {
      await this.makeWiseRequest(
        'PUT',
        `/v1/transfers/${providerReference}/cancel`
      );
      return true;
    } catch (error: any) {
      // Wise returns 422 if transfer cannot be cancelled
      if (error?.status === 422) {
        return false;
      }
      throw this.handleProviderError(error, 'payout cancellation');
    }
  }

  async getQuote(amount: number, currency: Currency, method: WithdrawalMethod): Promise<PayoutQuote> {
    if (!this.apiKey) {
      throw new PayoutError('WISE_API_KEY is not configured', 'WISE_NOT_CONFIGURED', false);
    }
    
    try {
      this.validateMethod(method);

      const quote = await this.createQuote(amount, currency, method.currency);
      const fees = this.calculateFees(amount, method.fee_structure);
      
      const netAmount = parseFloat(quote.payOut);
      const processingTime = this.formatProcessingTime(30, 2 * 60); // 30 min to 2 hours
      const estimatedArrival = this.calculateEstimatedArrival(2 * 60);

      return {
        rail: this.rail,
        method_id: method.id,
        amount,
        currency,
        platform_fee: fees.platformFee,
        provider_fee: Math.round(quote.fee * 100), // Convert to minor units
        fx_rate: quote.rate,
        net_amount: Math.round(netAmount * 100), // Convert to minor units
        processing_time: processingTime,
        estimated_arrival: estimatedArrival,
        supports_instant: true
      };
    } catch (error) {
      throw this.handleProviderError(error, 'quote generation');
    }
  }

  private async createQuote(
    amount: number, 
    sourceCurrency: Currency, 
    targetCurrency: Currency
  ): Promise<WiseQuote> {
    const response = await this.makeWiseRequest('POST', '/v2/quotes', {
      sourceCurrency,
      targetCurrency,
      sourceAmount: amount / 100, // Convert from minor units
      paymentMetadata: {
        transferNature: 'MOVING_MONEY_BETWEEN_OWN_ACCOUNTS'
      }
    });

    return response as WiseQuote;
  }

  private async createTransfer(
    quoteId: string, 
    recipientId: string, 
    payout: Payout
  ): Promise<WiseTransfer> {
    const response = await this.makeWiseRequest('POST', '/v1/transfers', {
      targetAccount: parseInt(recipientId),
      quote: quoteId,
      customerTransactionId: payout.trace_id,
      details: {
        reference: payout.description || `Pactify payout ${payout.trace_id}`,
        sourceOfFunds: 'business_income',
        transferPurpose: 'business_operations'
      }
    });

    return response as WiseTransfer;
  }

  private async makeWiseRequest(
    method: string, 
    endpoint: string, 
    body?: any
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Pactify/1.0'
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
        code: errorData?.error?.code || 'api_error',
        message: errorData?.error?.message || response.statusText,
        details: errorData
      };
    }

    return response.json();
  }

  protected mapProviderStatus(providerStatus: string): PayoutStatus {
    switch (providerStatus.toLowerCase()) {
      case 'incoming_payment_waiting':
      case 'processing':
        return 'processing';
      case 'funds_converted':
      case 'outgoing_payment_sent':
        return 'paid';
      case 'cancelled':
        return 'cancelled';
      case 'funds_refunded':
        return 'failed';
      case 'bounced_back':
      case 'charged_back':
        return 'returned';
      default:
        console.warn(`Unknown Wise transfer status: ${providerStatus}`);
        return 'processing';
    }
  }

  protected handleProviderError(error: any, action: string): PayoutError {
    if (error.status && error.code) {
      const isRetryable = error.status >= 500 || 
                          error.status === 429 ||
                          error.code === 'rate_limit_exceeded';

      return new PayoutError(
        `Wise ${action} failed: ${error.message}`,
        `WISE_${error.code.toUpperCase()}`,
        isRetryable,
        error.status === 429 ? 60 : undefined
      );
    }

    return super.handleProviderError(error, action);
  }
}