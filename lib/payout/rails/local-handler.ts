// Local bank transfer rail handler for domestic payouts

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

interface LocalBankAccount {
  account_holder_name: string;
  account_number: string;
  routing_number?: string; // US
  sort_code?: string; // UK
  iban?: string; // EU
  swift_code?: string;
  bank_name: string;
  bank_address?: string;
  country: string;
}

export class LocalRailHandler extends BaseRailHandler {
  rail: Rail = 'local';

  constructor() {
    super();
  }

  async createPayout(payout: Payout, method: WithdrawalMethod): Promise<PayoutResult> {
    try {
      this.validateMethod(method);

      // Local rails are typically processed through banking partners
      // This is a simulated implementation - in practice you'd integrate with:
      // - Banking APIs (Plaid, Yodlee, etc.)
      // - ACH processors (Dwolla, Stripe ACH, etc.)
      // - Wire transfer services
      // - Regional payment processors

      const bankAccount = this.extractBankAccountInfo(method);
      
      // Validate bank account details
      if (!this.isValidBankAccount(bankAccount, method.country)) {
        throw new PayoutError(
          'Invalid bank account details',
          'INVALID_BANK_ACCOUNT',
          false
        );
      }

      // Simulate local bank transfer processing
      // In reality, this would initiate an ACH transfer, wire transfer, or local payment
      const transferReference = this.generateTransferReference(payout);
      
      // Calculate estimated arrival based on country and transfer type
      const estimatedArrival = this.calculateLocalTransferTime(method.country, payout.amount);

      return {
        success: true,
        provider_reference: transferReference,
        estimated_arrival: estimatedArrival
      };

    } catch (error) {
      throw this.handleProviderError(error, 'payout creation');
    }
  }

  async getPayoutStatus(providerReference: string): Promise<PayoutStatus> {
    try {
      // In practice, you'd check with your banking partner or ACH processor
      // For simulation purposes, we'll assume processing status
      
      // Parse the reference to determine simulated status
      const parts = providerReference.split('-');
      const timestamp = parseInt(parts[2] || '0');
      const hoursSinceCreation = (Date.now() - timestamp) / (1000 * 60 * 60);

      // Simulate local transfer processing times
      if (hoursSinceCreation < 1) {
        return 'processing';
      } else if (hoursSinceCreation < 24) {
        return 'processing';
      } else if (hoursSinceCreation < 72) {
        return 'paid'; // Most local transfers complete within 1-3 days
      } else {
        // After 3 days, assume it completed
        return 'paid';
      }

    } catch (error) {
      throw this.handleProviderError(error, 'status check');
    }
  }

  async cancelPayout(providerReference: string): Promise<boolean> {
    try {
      // Parse reference to check if cancellation is possible
      const parts = providerReference.split('-');
      const timestamp = parseInt(parts[2] || '0');
      const hoursSinceCreation = (Date.now() - timestamp) / (1000 * 60 * 60);

      // Local transfers can typically be canceled within first few hours
      if (hoursSinceCreation > 4) {
        return false; // Too late to cancel
      }

      // In practice, you'd call your banking partner's cancellation API
      return true;

    } catch (error) {
      throw this.handleProviderError(error, 'payout cancellation');
    }
  }

  async getQuote(amount: number, currency: Currency, method: WithdrawalMethod): Promise<PayoutQuote> {
    try {
      this.validateMethod(method);

      const fees = this.calculateFees(amount, method.fee_structure);
      
      // Local transfers typically have lower fees but longer processing times
      const localFee = this.calculateLocalTransferFee(amount, method.country);
      const netAmount = amount - fees.platformFee - localFee;
      
      const processingTime = this.getLocalProcessingTime(method.country);
      const estimatedArrival = this.calculateLocalTransferTime(method.country, amount);

      return {
        rail: this.rail,
        method_id: method.id,
        amount,
        currency,
        platform_fee: fees.platformFee,
        provider_fee: localFee,
        net_amount: netAmount,
        processing_time: processingTime,
        estimated_arrival: estimatedArrival,
        supports_instant: false // Local transfers are rarely instant
      };

    } catch (error) {
      throw this.handleProviderError(error, 'quote generation');
    }
  }

  private extractBankAccountInfo(method: WithdrawalMethod): LocalBankAccount {
    const details = method.details as any;
    
    return {
      account_holder_name: details.account_holder_name || '',
      account_number: details.account_number || '',
      routing_number: details.routing_number,
      sort_code: details.sort_code,
      iban: details.iban,
      swift_code: details.swift_code,
      bank_name: details.bank_name || '',
      bank_address: details.bank_address,
      country: method.country
    };
  }

  private isValidBankAccount(account: LocalBankAccount, country: string): boolean {
    // Basic validation based on country
    switch (country.toUpperCase()) {
      case 'US':
        return !!(account.account_number && account.routing_number && account.account_holder_name);
      
      case 'GB':
        return !!(account.account_number && account.sort_code && account.account_holder_name);
      
      case 'DE':
      case 'FR':
      case 'ES':
      case 'IT':
      case 'NL':
        return !!(account.iban && account.account_holder_name);
      
      default:
        // For other countries, require at least account number and holder name
        return !!(account.account_number && account.account_holder_name);
    }
  }

  private calculateLocalTransferFee(amount: number, country: string): number {
    // Fee structures vary by country and amount
    switch (country.toUpperCase()) {
      case 'US':
        // ACH transfers: typically $0-5
        return Math.min(500, Math.round(amount * 0.001)); // 0.1% capped at $5
      
      case 'GB':
        // Faster Payments: usually free for domestic
        return 0;
      
      case 'DE':
      case 'FR':
      case 'ES':
      case 'IT':
        // SEPA transfers: typically €0-2
        return Math.min(200, Math.round(amount * 0.002)); // 0.2% capped at €2
      
      default:
        // Conservative estimate for other countries
        return Math.min(1000, Math.round(amount * 0.005)); // 0.5% capped at $10
    }
  }

  private getLocalProcessingTime(country: string): string {
    switch (country.toUpperCase()) {
      case 'US':
        return '1-3 business days'; // ACH standard
      
      case 'GB':
        return '2 hours - 1 business day'; // Faster Payments
      
      case 'DE':
      case 'FR':
      case 'ES':
      case 'IT':
      case 'NL':
        return '1-2 business days'; // SEPA Instant or standard
      
      case 'AU':
        return '1-2 business days'; // NPP or standard transfer
      
      case 'CA':
        return '1-3 business days'; // Interac e-Transfer or EFT
      
      default:
        return '1-5 business days'; // Conservative estimate
    }
  }

  private calculateLocalTransferTime(country: string, amount: number): Date {
    let hoursToAdd: number;

    switch (country.toUpperCase()) {
      case 'US':
        hoursToAdd = amount > 2500000 ? 72 : 48; // 2-3 days for ACH
        break;
      
      case 'GB':
        hoursToAdd = 2; // Faster Payments are usually within 2 hours
        break;
      
      case 'DE':
      case 'FR':
      case 'ES':
      case 'IT':
      case 'NL':
        hoursToAdd = amount > 10000000 ? 48 : 24; // SEPA timing
        break;
      
      case 'AU':
        hoursToAdd = 24; // NPP is usually same day
        break;
      
      case 'CA':
        hoursToAdd = 48; // EFT typically 1-2 days
        break;
      
      default:
        hoursToAdd = 96; // 4 days conservative estimate
    }

    return new Date(Date.now() + hoursToAdd * 60 * 60 * 1000);
  }

  private generateTransferReference(payout: Payout): string {
    return `LOCAL-${payout.trace_id}-${Date.now()}`;
  }

  protected mapProviderStatus(providerStatus: string): PayoutStatus {
    // Since this is a simulated implementation, we don't have real provider statuses
    // In practice, you'd map actual status codes from your banking partner
    switch (providerStatus.toLowerCase()) {
      case 'pending':
      case 'processing':
        return 'processing';
      case 'completed':
      case 'settled':
        return 'paid';
      case 'failed':
      case 'rejected':
        return 'failed';
      case 'cancelled':
        return 'cancelled';
      case 'returned':
        return 'returned';
      default:
        return 'processing';
    }
  }

  protected handleProviderError(error: any, action: string): PayoutError {
    // Handle common local banking errors
    if (error.code) {
      const isRetryable = [
        'TEMPORARY_UNAVAILABLE',
        'RATE_LIMIT_EXCEEDED',
        'NETWORK_ERROR'
      ].includes(error.code);

      return new PayoutError(
        `Local transfer ${action} failed: ${error.message}`,
        `LOCAL_${error.code}`,
        isRetryable
      );
    }

    return super.handleProviderError(error, action);
  }

  /**
   * Get supported countries for local rail
   */
  static getSupportedCountries(): string[] {
    return [
      'US', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'PT',
      'AU', 'CA', 'CH', 'SE', 'DK', 'NO', 'FI', 'IE', 'LU'
    ];
  }

  /**
   * Check if local rail is available for a specific country
   */
  static isCountrySupported(country: string): boolean {
    return this.getSupportedCountries().includes(country.toUpperCase());
  }
}