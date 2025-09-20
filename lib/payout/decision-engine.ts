// Rail selection decision engine - chooses the best payout rail based on user preferences and constraints

import { createClient } from '@/utils/supabase/server';
import {
  Rail,
  Currency,
  PayoutMethod,
  RailSelectionInput,
  RailCapability,
  PayoutQuote,
  PayoutFeeConfig,
  RailCountrySupport,
  RailNotSupportedError,
  KYCRequiredError,
  AmountLimitError
} from './types';

export class PayoutDecisionEngine {
  private supabase = createClient();

  /**
   * Main entry point - selects the best rail for a payout request
   */
  async chooseRail(input: RailSelectionInput): Promise<Rail> {
    // Validate KYC requirements
    this.validateKYC(input);

    // Get supported rails for this request
    const capabilities = await this.getRailCapabilities(input);
    const eligibleRails = capabilities.filter(cap => cap.supported);

    if (eligibleRails.length === 0) {
      throw new RailNotSupportedError(
        'none' as Rail,
        input.targetCountry,
        input.currency
      );
    }

    // Apply user preferences first
    if (input.userPrefs?.length) {
      const preferredRail = input.userPrefs.find(pref => 
        eligibleRails.some(rail => rail.rail === pref)
      );
      if (preferredRail) {
        const capability = eligibleRails.find(r => r.rail === preferredRail);
        if (capability && this.validateAmount(input.amount, capability)) {
          return preferredRail;
        }
      }
    }

    // Apply decision logic based on method and requirements
    return this.applyDecisionLogic(input, eligibleRails);
  }

  /**
   * Get quotes from all eligible rails for comparison
   */
  async getQuotes(input: RailSelectionInput): Promise<PayoutQuote[]> {
    this.validateKYC(input);
    
    const capabilities = await this.getRailCapabilities(input);
    const eligibleRails = capabilities.filter(cap => 
      cap.supported && this.validateAmount(input.amount, cap, false)
    );

    const quotes: PayoutQuote[] = [];
    
    for (const capability of eligibleRails) {
      try {
        const quote = await this.calculateQuote(input, capability);
        quotes.push(quote);
      } catch (error) {
        console.warn(`Failed to get quote for ${capability.rail}:`, error);
      }
    }

    // Sort by net amount (highest first)
    return quotes.sort((a, b) => b.net_amount - a.net_amount);
  }

  /**
   * Validate KYC requirements
   */
  private validateKYC(input: RailSelectionInput): void {
    if (!input.userKycOk) {
      throw new KYCRequiredError('basic');
    }

    // Enhanced KYC required for amounts > $10,000 or certain countries
    const requiresEnhancedKYC = 
      input.amount > 1000000 || // > $10,000
      ['NG', 'IN', 'PH'].includes(input.targetCountry);

    if (requiresEnhancedKYC && !input.enhancedKycOk) {
      throw new KYCRequiredError('enhanced');
    }
  }

  /**
   * Get rail capabilities for this specific request
   */
  private async getRailCapabilities(input: RailSelectionInput): Promise<RailCapability[]> {
    const { data: countrySupport } = await this.supabase
      .from('rail_country_support')
      .select('*')
      .eq('country_code', input.targetCountry)
      .eq('currency', input.currency);

    const { data: feeConfigs } = await this.supabase
      .from('payout_fees')
      .select('*')
      .eq('currency', input.currency)
      .in('country', [input.targetCountry, null]) // country-specific or global
      .eq('is_active', true);

    if (!countrySupport || !feeConfigs) {
      return [];
    }

    const capabilities: RailCapability[] = [];

    for (const rail of input.railsEnabled) {
      const support = countrySupport.find(s => s.rail === rail);
      const feeConfig = feeConfigs
        .filter(f => f.rail === rail)
        .sort((a, b) => a.country ? 1 : -1)[0]; // prefer country-specific

      if (!support?.is_supported || !feeConfig) {
        continue;
      }

      const estimatedFee = this.calculateFee(input.amount, feeConfig);

      capabilities.push({
        rail,
        supported: true,
        requires_enhanced_kyc: support.requires_enhanced_kyc,
        min_amount: feeConfig.min_amount,
        max_amount: feeConfig.max_amount,
        daily_limit: support.max_daily_limit || Infinity,
        monthly_limit: support.max_monthly_limit || Infinity,
        estimated_fee,
        processing_time_min: feeConfig.processing_time_min,
        processing_time_max: feeConfig.processing_time_max,
        supports_instant: feeConfig.supports_instant && input.urgency === 'instant'
      });
    }

    return capabilities;
  }

  /**
   * Apply decision logic to choose the best rail
   */
  private applyDecisionLogic(
    input: RailSelectionInput, 
    eligibleRails: RailCapability[]
  ): Rail {
    // Filter by urgency requirements
    let candidateRails = eligibleRails;
    
    if (input.urgency === 'instant') {
      candidateRails = eligibleRails.filter(r => r.supports_instant);
      if (candidateRails.length === 0) {
        // Fall back to fastest available
        candidateRails = eligibleRails.sort((a, b) => a.processing_time_min - b.processing_time_min);
      }
    }

    // Apply method-specific logic
    switch (input.method) {
      case 'paypal':
        const paypalRail = candidateRails.find(r => r.rail === 'paypal');
        if (paypalRail) return 'paypal';
        break;


      case 'mobile':
        const localRail = candidateRails.find(r => r.rail === 'local');
        if (localRail) return 'local';
        break;

      case 'wallet':
        // Prefer Payoneer for wallet-to-wallet transfers
        const payoneerRail = candidateRails.find(r => r.rail === 'payoneer');
        if (payoneerRail) return 'payoneer';
        break;

      case 'bank':
      default:
        // For bank transfers, choose based on cost and speed
        return this.chooseBankRail(input, candidateRails);
    }

    // Default fallback
    return candidateRails[0]?.rail || 'stripe';
  }

  /**
   * Choose best rail for bank transfers
   */
  private chooseBankRail(
    input: RailSelectionInput,
    candidateRails: RailCapability[]
  ): Rail {
    // Check if this is cross-border with heavy FX
    const isCrossBorderFX = this.isCrossBorderFXHeavy(input);
    
    if (isCrossBorderFX) {
      // Prefer Wise for better FX rates
      const wiseRail = candidateRails.find(r => r.rail === 'wise');
      if (wiseRail) return 'wise';
    }

    // For domestic or small amounts, prefer Stripe (lowest fees, most reliable)
    const stripeRail = candidateRails.find(r => r.rail === 'stripe');
    if (stripeRail) return 'stripe';

    // Sort by estimated fee (lowest first) as fallback
    const sortedByFee = candidateRails.sort((a, b) => a.estimated_fee - b.estimated_fee);
    return sortedByFee[0]?.rail || 'stripe';
  }

  /**
   * Check if this is a cross-border transaction with significant FX component
   */
  private isCrossBorderFXHeavy(input: RailSelectionInput): boolean {
    // Simple heuristic: different country + amount > $1000
    const isDifferentCountry = input.targetCountry !== 'US'; // Assuming platform is US-based
    const isLargeAmount = input.amount > 100000; // > $1000
    
    return isDifferentCountry && isLargeAmount;
  }

  /**
   * Validate amount against rail limits
   */
  private validateAmount(
    amount: number, 
    capability: RailCapability, 
    throwError: boolean = true
  ): boolean {
    if (amount < capability.min_amount) {
      if (throwError) {
        throw new AmountLimitError(amount, capability.min_amount, 'min');
      }
      return false;
    }

    if (capability.max_amount && amount > capability.max_amount) {
      if (throwError) {
        throw new AmountLimitError(amount, capability.max_amount, 'max');
      }
      return false;
    }

    // TODO: Check daily/monthly limits against user's recent payouts
    
    return true;
  }

  /**
   * Calculate fee for an amount using fee config
   */
  private calculateFee(amount: number, config: PayoutFeeConfig): number {
    const percentFee = Math.round(amount * config.percent_fee);
    const totalFee = config.fixed_fee + percentFee;
    
    const minFee = config.min_fee;
    const maxFee = config.max_fee || Infinity;
    
    return Math.max(minFee, Math.min(totalFee, maxFee));
  }

  /**
   * Calculate detailed quote for a specific rail
   */
  private async calculateQuote(
    input: RailSelectionInput,
    capability: RailCapability
  ): Promise<PayoutQuote> {
    const platformFeeRate = 0.005; // 0.5% platform fee
    const platformFee = Math.round(input.amount * platformFeeRate);
    const providerFee = capability.estimated_fee;
    
    // FX rate simulation (in real implementation, fetch from provider APIs)
    const fxRate = input.currency === 'USD' ? 1 : this.getEstimatedFXRate(input.currency);
    
    const netAmount = input.amount - platformFee - providerFee;
    
    const processingTimeText = this.formatProcessingTime(
      capability.processing_time_min,
      capability.processing_time_max
    );
    
    const estimatedArrival = new Date(
      Date.now() + capability.processing_time_min * 60 * 1000
    ).toISOString();

    return {
      rail: capability.rail,
      method_id: '', // Will be set by caller
      amount: input.amount,
      currency: input.currency,
      platform_fee: platformFee,
      provider_fee: providerFee,
      fx_rate: fxRate !== 1 ? fxRate : undefined,
      net_amount: netAmount,
      processing_time: processingTimeText,
      estimated_arrival: estimatedArrival,
      supports_instant: capability.supports_instant,
      instant_fee: capability.supports_instant ? Math.round(providerFee * 0.5) : undefined
    };
  }

  /**
   * Format processing time range into human-readable text
   */
  private formatProcessingTime(minMinutes: number, maxMinutes: number): string {
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
   * Get estimated FX rate (mock - in production, integrate with real FX APIs)
   */
  private getEstimatedFXRate(currency: Currency): number {
    const mockRates: Record<string, number> = {
      'EUR': 0.85,
      'GBP': 0.75,
      'CAD': 1.35,
      'AUD': 1.50,
      'JPY': 150,
      'NGN': 800,
      'INR': 83,
      'PHP': 56
    };
    
    return mockRates[currency] || 1;
  }
}

// Export singleton instance
export const payoutDecisionEngine = new PayoutDecisionEngine();