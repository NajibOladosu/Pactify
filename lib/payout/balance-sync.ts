// Balance synchronization with existing contract payment system

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { reconciliationManager } from './reconciliation';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

interface ContractPayment {
  id: string;
  contract_id: string;
  user_id: string;
  amount: number;
  currency: string;
  payment_type: 'escrow' | 'release' | 'refund';
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'released';
  stripe_payment_id: string | null;
  created_at: string;
  completed_at: string | null;
  metadata: any;
}

interface Contract {
  id: string;
  freelancer_id: string;
  client_id: string;
  title: string;
  currency: string;
}

export class BalanceSyncManager {
  /**
   * Credit freelancer balance when contract payment is released
   */
  async creditFreelancerBalance(
    contractId: string,
    freelancerId: string,
    amount: number,
    currency: string,
    paymentId: string,
    metadata?: any
  ): Promise<void> {
    try {
      // Convert to minor units (cents)
      const minorAmount = Math.round(amount * 100);

      // Credit the balance using our atomic function
      const { data, error } = await serviceSupabase.rpc('credit_balance', {
        _user_id: freelancerId,
        _amount: minorAmount,
        _currency: currency.toUpperCase()
      });

      if (error || !data) {
        throw new Error(`Failed to credit balance: ${error?.message || 'Unknown error'}`);
      }

      // Log the balance credit for audit
      await reconciliationManager.logEntry({
        payout_id: '', // This isn't a payout yet, it's a balance credit
        rail: 'stripe', // Source is Stripe contract payment
        event_time: new Date().toISOString(),
        action: 'balance_credited',
        provider_reference: paymentId,
        notes: `Balance credited from contract payment release`,
        created_by: 'balance_sync',
        request_payload: {
          contract_id: contractId,
          freelancer_id: freelancerId,
          amount: minorAmount,
          currency: currency,
          payment_id: paymentId,
          metadata
        }
      });

      console.log(`Credited ${amount} ${currency} to freelancer ${freelancerId} from contract ${contractId}`);

    } catch (error) {
      console.error('Error crediting freelancer balance:', error);
      throw error;
    }
  }

  /**
   * Sync all existing contract payments to wallet balances
   * This is useful for migrating existing data
   */
  async syncAllExistingPayments(): Promise<{
    processed: number;
    credited: number;
    errors: Array<{ payment_id: string; error: string }>;
  }> {
    const results = {
      processed: 0,
      credited: 0,
      errors: [] as Array<{ payment_id: string; error: string }>
    };

    try {
      // Get all released contract payments that haven't been synced yet
      const { data: payments, error } = await serviceSupabase
        .from('contract_payments')
        .select(`
          *,
          contracts!inner(
            id,
            freelancer_id,
            client_id,
            title,
            currency
          )
        `)
        .eq('payment_type', 'release')
        .eq('status', 'released');

      if (error) {
        throw error;
      }

      if (!payments) {
        return results;
      }

      console.log(`Found ${payments.length} released payments to sync`);

      for (const payment of payments) {
        results.processed++;

        try {
          // Check if this payment was already synced
          const existingEntry = await this.checkIfPaymentSynced(payment.id);
          if (existingEntry) {
            console.log(`Payment ${payment.id} already synced, skipping`);
            continue;
          }

          const contract = payment.contracts as Contract;
          
          // Credit the freelancer's balance
          await this.creditFreelancerBalance(
            contract.id,
            contract.freelancer_id,
            parseFloat(payment.amount.toString()),
            payment.currency || contract.currency || 'USD',
            payment.id,
            {
              sync_type: 'historical',
              original_release_date: payment.completed_at,
              contract_title: contract.title
            }
          );

          results.credited++;
          console.log(`Synced payment ${payment.id}: ${payment.amount} ${payment.currency}`);

        } catch (error) {
          results.errors.push({
            payment_id: payment.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          console.error(`Error syncing payment ${payment.id}:`, error);
        }
      }

      console.log(`Balance sync completed: ${results.credited}/${results.processed} payments synced`);
      return results;

    } catch (error) {
      console.error('Error in syncAllExistingPayments:', error);
      throw error;
    }
  }

  /**
   * Check if a payment has already been synced
   */
  private async checkIfPaymentSynced(paymentId: string): Promise<boolean> {
    const { data } = await serviceSupabase
      .from('reconciliation_ledger')
      .select('id')
      .eq('action', 'balance_credited')
      .eq('provider_reference', paymentId)
      .limit(1);

    return (data && data.length > 0) || false;
  }

  /**
   * Get wallet balance summary for a user
   */
  async getBalanceSummary(userId: string): Promise<{
    balances: Array<{
      currency: string;
      available: number;
      pending: number;
      total: number;
    }>;
    total_earned: number;
    total_withdrawn: number;
  }> {
    try {
      // Get current balances
      const { data: balances, error: balanceError } = await serviceSupabase
        .from('wallet_balances')
        .select('*')
        .eq('user_id', userId);

      if (balanceError) {
        throw balanceError;
      }

      // Get earnings summary
      const { data: earnings } = await serviceSupabase
        .from('reconciliation_ledger')
        .select('request_payload')
        .eq('created_by', 'balance_sync')
        .eq('action', 'balance_credited')
        .contains('request_payload', { freelancer_id: userId });

      // Get withdrawal summary
      const { data: withdrawals } = await serviceSupabase
        .from('payouts')
        .select('net_amount, currency')
        .eq('user_id', userId)
        .in('status', ['paid', 'processing']);

      // Calculate totals (assuming USD for simplicity - in production, handle multi-currency)
      const totalEarned = earnings?.reduce((sum, entry) => {
        const payload = entry.request_payload as any;
        return sum + (payload.amount || 0);
      }, 0) || 0;

      const totalWithdrawn = withdrawals?.reduce((sum, payout) => {
        return sum + (payout.net_amount || 0);
      }, 0) || 0;

      // Format balances (convert from minor units)
      const formattedBalances = (balances || []).map(balance => ({
        currency: balance.currency,
        available: Math.floor(balance.available / 100), // Convert from cents
        pending: Math.floor(balance.pending / 100),
        total: Math.floor((balance.available + balance.pending) / 100)
      }));

      return {
        balances: formattedBalances,
        total_earned: Math.floor(totalEarned / 100),
        total_withdrawn: Math.floor(totalWithdrawn / 100)
      };

    } catch (error) {
      console.error('Error getting balance summary:', error);
      throw error;
    }
  }

  /**
   * Handle real-time balance updates from contract payment webhooks
   */
  async handleContractPaymentWebhook(
    eventType: string,
    payment: ContractPayment,
    contract: Contract
  ): Promise<void> {
    try {
      if (eventType === 'payment.released' && payment.payment_type === 'release') {
        // Credit freelancer balance when payment is released
        await this.creditFreelancerBalance(
          contract.id,
          contract.freelancer_id,
          parseFloat(payment.amount.toString()),
          payment.currency || contract.currency || 'USD',
          payment.id,
          {
            webhook_event: eventType,
            release_date: payment.completed_at || new Date().toISOString(),
            contract_title: contract.title
          }
        );
      }

      // Handle other payment events as needed
      // e.g., refunds, chargebacks, etc.

    } catch (error) {
      console.error('Error handling contract payment webhook:', error);
      throw error;
    }
  }

  /**
   * Reconcile balance with actual contract payments
   * Useful for detecting discrepancies
   */
  async reconcileUserBalance(userId: string): Promise<{
    expected_balance: Record<string, number>;
    actual_balance: Record<string, number>;
    discrepancies: Record<string, number>;
  }> {
    try {
      // Calculate expected balance from contract payments
      const { data: releasePayments } = await serviceSupabase
        .from('contract_payments')
        .select(`
          amount,
          currency,
          contracts!inner(freelancer_id)
        `)
        .eq('payment_type', 'release')
        .eq('status', 'released')
        .eq('contracts.freelancer_id', userId);

      // Calculate expected balance by currency
      const expectedBalance: Record<string, number> = {};
      releasePayments?.forEach(payment => {
        const currency = payment.currency || 'USD';
        const amount = Math.round(parseFloat(payment.amount.toString()) * 100); // Convert to minor units
        expectedBalance[currency] = (expectedBalance[currency] || 0) + amount;
      });

      // Get actual balance from wallet
      const { data: actualBalances } = await serviceSupabase
        .from('wallet_balances')
        .select('currency, available, pending')
        .eq('user_id', userId);

      const actualBalance: Record<string, number> = {};
      actualBalances?.forEach(balance => {
        actualBalance[balance.currency] = balance.available + balance.pending;
      });

      // Calculate discrepancies
      const discrepancies: Record<string, number> = {};
      const allCurrencies = new Set([...Object.keys(expectedBalance), ...Object.keys(actualBalance)]);
      
      allCurrencies.forEach(currency => {
        const expected = expectedBalance[currency] || 0;
        const actual = actualBalance[currency] || 0;
        const difference = actual - expected;
        
        if (difference !== 0) {
          discrepancies[currency] = difference;
        }
      });

      return {
        expected_balance: expectedBalance,
        actual_balance: actualBalance,
        discrepancies
      };

    } catch (error) {
      console.error('Error reconciling user balance:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const balanceSyncManager = new BalanceSyncManager();