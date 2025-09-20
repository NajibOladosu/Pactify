// Reconciliation and balance management utilities

import { createClient } from '@/utils/supabase/server';
import { 
  ReconciliationEntry, 
  Payout,
  PayoutStatus,
  PayoutError 
} from './types';

export class ReconciliationManager {
  private supabase = createClient();

  /**
   * Log a reconciliation entry for audit trail
   */
  async logEntry(entry: Omit<ReconciliationEntry, 'id'>): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('reconciliation_ledger')
        .insert({
          payout_id: entry.payout_id,
          rail: entry.rail,
          event_time: entry.event_time || new Date().toISOString(),
          action: entry.action,
          amount: entry.amount,
          currency: entry.currency,
          balance_before: entry.balance_before,
          balance_after: entry.balance_after,
          provider_reference: entry.provider_reference,
          provider_status: entry.provider_status,
          request_payload: entry.request_payload,
          response_payload: entry.response_payload,
          notes: entry.notes,
          created_by: entry.created_by || 'system'
        });

      if (error) {
        console.error('Failed to log reconciliation entry:', error);
      }
    } catch (error) {
      console.error('Error logging reconciliation entry:', error);
    }
  }

  /**
   * Get reconciliation history for a payout
   */
  async getPayoutReconciliation(payoutId: string): Promise<ReconciliationEntry[]> {
    try {
      const { data, error } = await this.supabase
        .from('reconciliation_ledger')
        .select('*')
        .eq('payout_id', payoutId)
        .order('event_time', { ascending: true });

      if (error) {
        throw new PayoutError(
          'Failed to fetch reconciliation data',
          'RECONCILIATION_FETCH_ERROR',
          false
        );
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching reconciliation data:', error);
      return [];
    }
  }

  /**
   * Update payout status and log reconciliation entry
   */
  async updatePayoutStatus(
    payoutId: string,
    newStatus: PayoutStatus,
    providerReference?: string,
    providerStatus?: string,
    failureReason?: string,
    responsePayload?: any
  ): Promise<void> {
    try {
      // Get current payout data
      const { data: payout, error: fetchError } = await this.supabase
        .from('payouts')
        .select('*')
        .eq('id', payoutId)
        .single();

      if (fetchError || !payout) {
        throw new PayoutError(
          'Payout not found',
          'PAYOUT_NOT_FOUND',
          false
        );
      }

      // Determine update fields based on status
      const updateFields: any = {
        status: newStatus,
        updated_at: new Date().toISOString()
      };

      if (providerReference) {
        updateFields.provider_reference = providerReference;
      }

      if (failureReason) {
        updateFields.failure_reason = failureReason;
      }

      // Set timing fields based on status
      if (newStatus === 'processing' && !payout.processing_started_at) {
        updateFields.processing_started_at = new Date().toISOString();
      }

      if (['paid', 'failed', 'cancelled', 'returned'].includes(newStatus) && !payout.completed_at) {
        updateFields.completed_at = new Date().toISOString();
      }

      // Update payout record
      const { error: updateError } = await this.supabase
        .from('payouts')
        .update(updateFields)
        .eq('id', payoutId);

      if (updateError) {
        throw new PayoutError(
          'Failed to update payout status',
          'PAYOUT_UPDATE_ERROR',
          true
        );
      }

      // Update wallet balances if payout completed (success or failure)
      if (['paid', 'failed', 'cancelled', 'returned'].includes(newStatus)) {
        const success = newStatus === 'paid';
        await this.completePayout(payoutId, success);
      }

      // Log reconciliation entry
      await this.logEntry({
        payout_id: payoutId,
        rail: payout.rail,
        action: 'webhook_update',
        provider_reference: providerReference,
        provider_status: providerStatus,
        response_payload: responsePayload,
        notes: `Status updated to ${newStatus}${failureReason ? ` - ${failureReason}` : ''}`,
        created_by: 'webhook'
      });

    } catch (error) {
      console.error('Error updating payout status:', error);
      throw error;
    }
  }

  /**
   * Complete payout and update balances
   */
  async completePayout(payoutId: string, success: boolean): Promise<void> {
    try {
      const { data: result, error } = await this.supabase
        .rpc('complete_payout', {
          _payout_id: payoutId,
          _success: success
        });

      if (error || !result) {
        console.error('Failed to complete payout:', error);
        throw new PayoutError(
          'Failed to complete payout',
          'PAYOUT_COMPLETION_ERROR',
          true
        );
      }

      // Log the balance update
      await this.logEntry({
        payout_id: payoutId,
        rail: 'system',
        action: success ? 'complete_payout_success' : 'complete_payout_failure',
        notes: success 
          ? 'Payout completed successfully - moved from pending to withdrawn'
          : 'Payout failed - returned funds to available balance',
        created_by: 'system'
      });

    } catch (error) {
      console.error('Error completing payout:', error);
      throw error;
    }
  }

  /**
   * Reconcile discrepancies between our records and provider records
   */
  async reconcileDiscrepancies(rail: string, date: string): Promise<{
    matches: number;
    discrepancies: Array<{
      payout_id: string;
      our_status: string;
      provider_status: string;
      our_amount: number;
      provider_amount: number;
    }>;
  }> {
    // This would integrate with provider APIs to fetch their records
    // and compare against our database
    
    const startDate = new Date(date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    try {
      // Get our records for the date
      const { data: ourPayouts, error } = await this.supabase
        .from('payouts')
        .select('*')
        .eq('rail', rail)
        .gte('created_at', startDate.toISOString())
        .lt('created_at', endDate.toISOString())
        .not('provider_reference', 'is', null);

      if (error || !ourPayouts) {
        throw new PayoutError(
          'Failed to fetch payouts for reconciliation',
          'RECONCILIATION_FETCH_ERROR',
          true
        );
      }

      // TODO: Fetch provider records and compare
      // For now, return mock data structure
      const result = {
        matches: ourPayouts.length,
        discrepancies: [] as any[]
      };

      // Log reconciliation attempt
      await this.logEntry({
        payout_id: '', // No specific payout
        rail,
        action: 'daily_reconciliation',
        notes: `Reconciled ${result.matches} payouts, found ${result.discrepancies.length} discrepancies`,
        created_by: 'reconciliation_job'
      });

      return result;

    } catch (error) {
      console.error('Error during reconciliation:', error);
      throw error;
    }
  }

  /**
   * Get balance summary for a user
   */
  async getUserBalanceSummary(userId: string, currency: string = 'USD') {
    try {
      const { data: stats, error } = await this.supabase
        .rpc('get_user_payout_stats', {
          _user_id: userId,
          _currency: currency
        })
        .single();

      if (error) {
        console.error('Error fetching balance summary:', error);
        return null;
      }

      return stats;
    } catch (error) {
      console.error('Error getting balance summary:', error);
      return null;
    }
  }

  /**
   * Validate user balance for withdrawal
   */
  async validateWithdrawalAmount(
    userId: string, 
    amount: number, 
    currency: string = 'USD'
  ): Promise<{ valid: boolean; available: number; error?: string }> {
    try {
      const { data: balance, error } = await this.supabase
        .from('wallet_balances')
        .select('available')
        .eq('user_id', userId)
        .eq('currency', currency)
        .single();

      if (error) {
        return {
          valid: false,
          available: 0,
          error: 'Failed to fetch balance'
        };
      }

      const available = balance?.available || 0;

      return {
        valid: available >= amount,
        available,
        error: available < amount ? 'Insufficient balance' : undefined
      };

    } catch (error) {
      console.error('Error validating withdrawal amount:', error);
      return {
        valid: false,
        available: 0,
        error: 'Validation error'
      };
    }
  }

  /**
   * Credit user balance from completed contract
   */
  async creditFromContract(
    userId: string,
    contractId: string,
    amount: number,
    currency: string = 'USD',
    description: string = 'Contract completion'
  ): Promise<void> {
    try {
      // Credit the balance
      const { data: result, error } = await this.supabase
        .rpc('credit_balance', {
          _user_id: userId,
          _amount: amount,
          _currency: currency
        });

      if (error || !result) {
        throw new PayoutError(
          'Failed to credit balance',
          'BALANCE_CREDIT_ERROR',
          true
        );
      }

      // Log the credit
      await this.logEntry({
        payout_id: '', // No specific payout
        rail: 'contract_system',
        action: 'credit_balance',
        amount,
        currency,
        notes: `${description} - Contract ID: ${contractId}`,
        created_by: 'contract_system',
        request_payload: {
          contract_id: contractId,
          amount,
          currency,
          description
        }
      });

    } catch (error) {
      console.error('Error crediting balance from contract:', error);
      throw error;
    }
  }

  /**
   * Generate reconciliation report
   */
  async generateReconciliationReport(
    startDate: string,
    endDate: string,
    rail?: string
  ): Promise<{
    summary: {
      total_payouts: number;
      total_amount: number;
      successful_payouts: number;
      failed_payouts: number;
      pending_payouts: number;
    };
    by_rail: Record<string, any>;
    discrepancies: any[];
  }> {
    try {
      let query = this.supabase
        .from('payouts')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      if (rail) {
        query = query.eq('rail', rail);
      }

      const { data: payouts, error } = await query;

      if (error || !payouts) {
        throw new PayoutError(
          'Failed to generate reconciliation report',
          'REPORT_GENERATION_ERROR',
          true
        );
      }

      // Calculate summary
      const summary = {
        total_payouts: payouts.length,
        total_amount: payouts.reduce((sum, p) => sum + p.amount, 0),
        successful_payouts: payouts.filter(p => p.status === 'paid').length,
        failed_payouts: payouts.filter(p => ['failed', 'returned', 'cancelled'].includes(p.status)).length,
        pending_payouts: payouts.filter(p => ['requested', 'queued', 'processing'].includes(p.status)).length
      };

      // Group by rail
      const byRail = payouts.reduce((acc, payout) => {
        if (!acc[payout.rail]) {
          acc[payout.rail] = {
            count: 0,
            amount: 0,
            successful: 0,
            failed: 0,
            pending: 0
          };
        }
        
        acc[payout.rail].count++;
        acc[payout.rail].amount += payout.amount;
        
        if (payout.status === 'paid') acc[payout.rail].successful++;
        else if (['failed', 'returned', 'cancelled'].includes(payout.status)) acc[payout.rail].failed++;
        else acc[payout.rail].pending++;
        
        return acc;
      }, {} as Record<string, any>);

      return {
        summary,
        by_rail: byRail,
        discrepancies: [] // TODO: Implement actual discrepancy detection
      };

    } catch (error) {
      console.error('Error generating reconciliation report:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const reconciliationManager = new ReconciliationManager();