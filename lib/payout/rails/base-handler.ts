// Base class for rail handlers

import { 
  RailHandler, 
  Rail, 
  Payout, 
  WithdrawalMethod, 
  PayoutResult, 
  PayoutStatus, 
  PayoutQuote,
  Currency,
  PayoutError 
} from '../types';

export abstract class BaseRailHandler implements RailHandler {
  abstract rail: Rail;

  /**
   * Create a payout using this rail's provider API
   */
  abstract createPayout(payout: Payout, method: WithdrawalMethod): Promise<PayoutResult>;

  /**
   * Check the status of an existing payout
   */
  abstract getPayoutStatus(providerReference: string): Promise<PayoutStatus>;

  /**
   * Cancel a payout (if supported)
   */
  async cancelPayout?(providerReference: string): Promise<boolean> {
    throw new PayoutError(
      `Cancellation not supported for ${this.rail}`,
      'CANCELLATION_NOT_SUPPORTED',
      false
    );
  }

  /**
   * Get a quote for a payout
   */
  abstract getQuote(amount: number, currency: Currency, method: WithdrawalMethod): Promise<PayoutQuote>;

  /**
   * Validate that the withdrawal method is compatible with this rail
   */
  protected validateMethod(method: WithdrawalMethod): void {
    if (method.rail !== this.rail) {
      throw new PayoutError(
        `Method rail ${method.rail} does not match handler rail ${this.rail}`,
        'RAIL_MISMATCH',
        false
      );
    }

    if (!method.is_active || !method.is_verified) {
      throw new PayoutError(
        'Withdrawal method is not active or verified',
        'METHOD_INACTIVE',
        false
      );
    }
  }

  /**
   * Calculate fees for a given amount
   */
  protected calculateFees(amount: number, feeStructure: any): { platformFee: number, providerFee: number } {
    const platformFeeRate = 0.005; // 0.5% platform fee
    const platformFee = Math.round(amount * platformFeeRate);

    const fixedFee = feeStructure.fixed || 0;
    const percentFee = Math.round(amount * (feeStructure.percent || 0));
    const providerFee = fixedFee + percentFee;

    return { platformFee, providerFee };
  }

  /**
   * Generate idempotency key for provider APIs
   */
  protected generateIdempotencyKey(payout: Payout): string {
    return `${this.rail}_${payout.trace_id}`;
  }

  /**
   * Map provider status to our PayoutStatus enum
   */
  protected abstract mapProviderStatus(providerStatus: string): PayoutStatus;

  /**
   * Handle provider API errors and convert to PayoutError
   */
  protected handleProviderError(error: any, action: string): PayoutError {
    console.error(`${this.rail} ${action} error:`, error);

    if (error.code && error.message) {
      // Provider-specific error
      return new PayoutError(
        `${this.rail} error: ${error.message}`,
        `${this.rail.toUpperCase()}_${error.code}`,
        this.isRetryableError(error),
        error.retry_after
      );
    }

    // Generic error
    return new PayoutError(
      `${this.rail} ${action} failed: ${error.message || 'Unknown error'}`,
      `${this.rail.toUpperCase()}_ERROR`,
      false
    );
  }

  /**
   * Determine if an error is retryable
   */
  protected isRetryableError(error: any): boolean {
    const retryableCodes = [
      'rate_limit_error',
      'api_connection_error',
      'api_error',
      'temporary_unavailable'
    ];

    return retryableCodes.includes(error.code) || 
           error.status >= 500 ||
           error.status === 429;
  }

  /**
   * Format processing time from minutes to human-readable string
   */
  protected formatProcessingTime(minMinutes: number, maxMinutes: number): string {
    const formatTime = (minutes: number): string => {
      if (minutes < 60) return `${minutes} minutes`;
      if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
      return `${Math.round(minutes / 1440)} days`;
    };

    if (minMinutes === maxMinutes) {
      return formatTime(minMinutes);
    }

    return `${formatTime(minMinutes)} - ${formatTime(maxMinutes)}`;
  }

  /**
   * Calculate estimated arrival date
   */
  protected calculateEstimatedArrival(processingTimeMinutes: number): string {
    return new Date(Date.now() + processingTimeMinutes * 60 * 1000).toISOString();
  }
}