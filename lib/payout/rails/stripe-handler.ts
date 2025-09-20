// Stripe rail handler for bank transfers

import Stripe from 'stripe';
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
import { createClient } from '@/utils/supabase/server';

export class StripeRailHandler extends BaseRailHandler {
  rail: Rail = 'stripe';
  private stripe: Stripe;

  constructor() {
    super();
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-07-30.basil',
    });
  }

  async createPayout(payout: Payout, method: WithdrawalMethod): Promise<PayoutResult> {
    try {
      this.validateMethod(method);

      const supabase = await createClient();

      // Get user's connected account
      const { data: connectedAccount } = await supabase
        .from('connected_accounts')
        .select('stripe_account_id, payouts_enabled, cap_transfers')
        .eq('user_id', payout.user_id)
        .single();

      if (!connectedAccount?.stripe_account_id || !connectedAccount.payouts_enabled) {
        throw new PayoutError(
          'User does not have a verified Stripe Connect account',
          'STRIPE_ACCOUNT_NOT_READY',
          false
        );
      }

      // First, transfer funds from platform to connected account
      const transfer = await this.stripe.transfers.create({
        amount: payout.amount,
        currency: payout.currency.toLowerCase(),
        destination: connectedAccount.stripe_account_id,
        description: payout.description || `Pactify payout ${payout.trace_id}`,
        metadata: {
          payout_id: payout.id,
          trace_id: payout.trace_id,
          user_id: payout.user_id,
          purpose: 'contract_payment_transfer'
        }
      });

      // Create payout from connected account to external account
      let stripePayout: Stripe.Payout;
      
      if (method.stripe_external_account_id) {
        // Payout to specific external account
        stripePayout = await this.stripe.payouts.create({
          amount: payout.amount,
          currency: payout.currency.toLowerCase(),
          destination: method.stripe_external_account_id,
          description: payout.description || `Pactify withdrawal`,
          statement_descriptor: 'Pactify',
          metadata: {
            payout_id: payout.id,
            trace_id: payout.trace_id,
            transfer_id: transfer.id
          }
        }, {
          stripeAccount: connectedAccount.stripe_account_id,
          idempotencyKey: this.generateIdempotencyKey(payout)
        });
      } else {
        // Payout to default external account (Express accounts)
        stripePayout = await this.stripe.payouts.create({
          amount: payout.amount,
          currency: payout.currency.toLowerCase(),
          method: 'standard',
          description: payout.description || `Pactify withdrawal`,
          statement_descriptor: 'Pactify',
          metadata: {
            payout_id: payout.id,
            trace_id: payout.trace_id,
            transfer_id: transfer.id
          }
        }, {
          stripeAccount: connectedAccount.stripe_account_id,
          idempotencyKey: this.generateIdempotencyKey(payout)
        });
      }

      const estimatedArrival = stripePayout.arrival_date ? 
        new Date(stripePayout.arrival_date * 1000).toISOString() : 
        this.calculateEstimatedArrival(2 * 24 * 60); // 2 days default

      return {
        success: true,
        provider_reference: stripePayout.id,
        estimated_arrival: estimatedArrival
      };

    } catch (error) {
      throw this.handleProviderError(error, 'payout creation');
    }
  }

  async getPayoutStatus(providerReference: string): Promise<PayoutStatus> {
    try {
      const payout = await this.stripe.payouts.retrieve(providerReference);
      return this.mapProviderStatus(payout.status);
    } catch (error) {
      throw this.handleProviderError(error, 'status check');
    }
  }

  async cancelPayout(providerReference: string): Promise<boolean> {
    try {
      const payout = await this.stripe.payouts.cancel(providerReference);
      return payout.status === 'canceled';
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError && error.code === 'payout_not_cancelable') {
        return false;
      }
      throw this.handleProviderError(error, 'payout cancellation');
    }
  }

  async getQuote(amount: number, currency: Currency, method: WithdrawalMethod): Promise<PayoutQuote> {
    try {
      this.validateMethod(method);

      const fees = this.calculateFees(amount, method.fee_structure);
      const netAmount = amount - fees.platformFee - fees.providerFee;

      // Stripe typically takes 1-7 business days
      const processingTime = this.formatProcessingTime(24 * 60, 7 * 24 * 60);
      const estimatedArrival = this.calculateEstimatedArrival(24 * 60); // 1 day

      return {
        rail: this.rail,
        method_id: method.id,
        amount,
        currency,
        platform_fee: fees.platformFee,
        provider_fee: fees.providerFee,
        net_amount: netAmount,
        processing_time: processingTime,
        estimated_arrival: estimatedArrival,
        supports_instant: false
      };
    } catch (error) {
      throw this.handleProviderError(error, 'quote generation');
    }
  }

  protected mapProviderStatus(providerStatus: string): PayoutStatus {
    switch (providerStatus) {
      case 'pending':
        return 'processing';
      case 'paid':
        return 'paid';
      case 'failed':
        return 'failed';
      case 'canceled':
        return 'cancelled';
      case 'in_transit':
        return 'processing';
      default:
        console.warn(`Unknown Stripe payout status: ${providerStatus}`);
        return 'processing';
    }
  }

  protected handleProviderError(error: any, action: string): PayoutError {
    if (error instanceof Stripe.errors.StripeError) {
      const isRetryable = error.type === 'StripeConnectionError' || 
                          error.type === 'StripeAPIError' ||
                          error.statusCode === 429;

      return new PayoutError(
        `Stripe ${action} failed: ${error.message}`,
        `STRIPE_${error.code?.toUpperCase() || 'ERROR'}`,
        isRetryable,
        error.statusCode === 429 ? 60 : undefined
      );
    }

    return super.handleProviderError(error, action);
  }
}