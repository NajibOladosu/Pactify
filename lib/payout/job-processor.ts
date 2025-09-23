// Background job processor for payout execution

import { createClient } from '@/utils/supabase/server';
import { getRailHandler } from './rails';
import { reconciliationManager } from './reconciliation';
import {
  Payout,
  WithdrawalMethod,
  PayoutError,
  PayoutResult,
  Rail
} from './types';

interface PayoutJob {
  id: string;
  payout_id: string;
  rail: Rail;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'retrying';
  attempts: number;
  max_attempts: number;
  next_retry_at?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export class PayoutJobProcessor {
  private async getClient() {
    return await createClient();
  }
  private isProcessing = false;
  private maxConcurrentJobs = 5;
  private retryDelayMs = [1000, 5000, 30000, 300000]; // 1s, 5s, 30s, 5min

  /**
   * Start the job processor
   */
  async start(): Promise<void> {
    if (this.isProcessing) {
      console.log('Job processor is already running');
      return;
    }

    console.log('Starting payout job processor...');
    this.isProcessing = true;

    // Process jobs in a loop
    while (this.isProcessing) {
      try {
        await this.processJobs();
        
        // Wait before next iteration
        await this.sleep(5000); // 5 seconds
      } catch (error) {
        console.error('Error in job processor loop:', error);
        await this.sleep(10000); // Wait longer on error
      }
    }
  }

  /**
   * Stop the job processor
   */
  stop(): void {
    console.log('Stopping payout job processor...');
    this.isProcessing = false;
  }

  /**
   * Queue a payout for processing
   */
  async queuePayout(payoutId: string): Promise<void> {
    try {
      // Get payout details
      const supabase = await this.getClient();
      const { data: payout, error: payoutError } = await (supabase as any)
        .from('payouts')
        .select('*')
        .eq('id', payoutId)
        .single();

      if (payoutError || !payout) {
        throw new PayoutError(
          'Payout not found',
          'PAYOUT_NOT_FOUND',
          false
        );
      }

      // Create job record (we'll use a simple table for now)
      // In production, you might want to use a proper job queue like BullMQ
      const { error: jobError } = await (supabase as any)
        .from('payout_jobs')
        .insert({
          payout_id: payoutId,
          rail: payout.rail,
          status: 'queued',
          attempts: 0,
          max_attempts: 3
        });

      if (jobError) {
        console.error('Failed to queue payout job:', jobError);
        throw new PayoutError(
          'Failed to queue payout',
          'JOB_QUEUE_ERROR',
          true
        );
      }

      console.log(`Payout ${payoutId} queued for processing`);

    } catch (error) {
      console.error('Error queuing payout:', error);
      throw error;
    }
  }

  /**
   * Process pending jobs
   */
  private async processJobs(): Promise<void> {
    // Get queued or retryable jobs
    const supabase = await this.getClient();
    const { data: jobs, error } = await (supabase as any)
      .from('payout_jobs')
      .select('*')
      .in('status', ['queued', 'retrying'])
      .or(`next_retry_at.is.null,next_retry_at.lt.${new Date().toISOString()}`)
      .limit(this.maxConcurrentJobs)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching jobs:', error);
      return;
    }

    if (!jobs || jobs.length === 0) {
      return; // No jobs to process
    }

    console.log(`Processing ${jobs.length} payout jobs...`);

    // Process jobs concurrently
    const promises = jobs.map((job: any) => this.processJob(job));
    await Promise.allSettled(promises);
  }

  /**
   * Process a single job
   */
  private async processJob(job: PayoutJob): Promise<void> {
    try {
      console.log(`Processing job ${job.id} for payout ${job.payout_id}`);

      // Mark job as processing
      await this.updateJobStatus(job.id, 'processing');

      // Get payout and method details
      const supabase = await this.getClient();
      const { data: payout } = await (supabase as any)
        .from('payouts')
        .select(`
          *,
          withdrawal_method:withdrawal_methods!inner(*)
        `)
        .eq('id', job.payout_id)
        .single();

      if (!payout) {
        throw new PayoutError('Payout not found', 'PAYOUT_NOT_FOUND', false);
      }

      // Get rail handler
      const railHandler = getRailHandler(job.rail as any);

      // Log job start
      await reconciliationManager.logEntry({
        payout_id: job.payout_id,
        rail: job.rail,
        event_time: new Date().toISOString(),
        action: 'job_started',
        notes: `Background job started for payout processing (attempt ${job.attempts + 1})`,
        created_by: 'job_processor'
      });

      // Execute the payout
      const result: PayoutResult = await railHandler.createPayout(
        payout,
        payout.withdrawal_method
      );

      if (result.success) {
        console.log(`Payout ${job.payout_id} processed successfully`);

        // Update payout with provider reference
        if (result.provider_reference) {
          await (supabase as any)
            .from('payouts')
            .update({
              provider_reference: result.provider_reference,
              status: 'processing',
              processing_started_at: new Date().toISOString(),
              expected_arrival_date: result.estimated_arrival
            })
            .eq('id', job.payout_id);
        }

        // Mark job as completed
        await this.updateJobStatus(job.id, 'completed');

        // Log success
        await reconciliationManager.logEntry({
          payout_id: job.payout_id,
          rail: job.rail,
          event_time: new Date().toISOString(),
          action: 'job_completed',
          provider_reference: result.provider_reference,
          notes: 'Payout processed successfully via rail handler',
          created_by: 'job_processor',
          response_payload: result
        });

      } else {
        throw new PayoutError(
          result.error || 'Payout processing failed',
          'PAYOUT_PROCESSING_ERROR',
          true
        );
      }

    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      await this.handleJobFailure(job, error);
    }
  }

  /**
   * Handle job failure and retries
   */
  private async handleJobFailure(job: PayoutJob, error: any): Promise<void> {
    const attempts = job.attempts + 1;
    const maxAttempts = job.max_attempts;
    const isRetryable = error instanceof PayoutError ? error.retryable : true;

    // Log the failure
    await reconciliationManager.logEntry({
      payout_id: job.payout_id,
      rail: job.rail,
      event_time: new Date().toISOString(),
      action: 'job_failed',
      notes: `Job attempt ${attempts} failed: ${error.message}`,
      created_by: 'job_processor',
      request_payload: {
        error: error.message,
        code: error.code,
        retryable: isRetryable,
        attempt: attempts
      }
    });

    if (isRetryable && attempts < maxAttempts) {
      // Schedule retry
      const retryDelayIndex = Math.min(attempts - 1, this.retryDelayMs.length - 1);
      const retryDelay = this.retryDelayMs[retryDelayIndex];
      const nextRetryAt = new Date(Date.now() + retryDelay).toISOString();

      const supabase2 = await this.getClient();
      await (supabase2 as any)
        .from('payout_jobs')
        .update({
          status: 'retrying',
          attempts,
          error_message: error.message,
          next_retry_at: nextRetryAt,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);

      console.log(`Job ${job.id} will retry in ${retryDelay}ms (attempt ${attempts}/${maxAttempts})`);

    } else {
      // Mark as permanently failed
      await this.updateJobStatus(job.id, 'failed', error.message);

      // Update payout status to failed
      await reconciliationManager.updatePayoutStatus(
        job.payout_id,
        'failed',
        undefined,
        undefined,
        error.message
      );

      console.log(`Job ${job.id} permanently failed after ${attempts} attempts`);
    }
  }

  /**
   * Update job status
   */
  private async updateJobStatus(
    jobId: string, 
    status: PayoutJob['status'], 
    errorMessage?: string
  ): Promise<void> {
    const supabase = await this.getClient();
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'processing') {
      updateData.attempts = (supabase as any).sql`attempts + 1`;
    }

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    await (supabase as any)
      .from('payout_jobs')
      .update(updateData)
      .eq('id', jobId);
  }

  /**
   * Get job statistics
   */
  async getJobStats(): Promise<{
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    retrying: number;
  }> {
    const supabase = await this.getClient();
    const { data, error } = await (supabase as any)
      .from('payout_jobs')
      .select('status')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24 hours

    if (error || !data) {
      return { queued: 0, processing: 0, completed: 0, failed: 0, retrying: 0 };
    }

    const stats = data.reduce((acc: any, job: any) => {
      acc[job.status as keyof typeof acc] = (acc[job.status as keyof typeof acc] || 0) + 1;
      return acc;
    }, { queued: 0, processing: 0, completed: 0, failed: 0, retrying: 0 });

    return stats;
  }

  /**
   * Clean up old completed jobs
   */
  async cleanupOldJobs(daysOld: number = 30): Promise<void> {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
    
    const supabase = await this.getClient();
    const { error } = await (supabase as any)
      .from('payout_jobs')
      .delete()
      .in('status', ['completed', 'failed'])
      .lt('updated_at', cutoffDate);

    if (error) {
      console.error('Error cleaning up old jobs:', error);
    } else {
      console.log(`Cleaned up completed/failed jobs older than ${daysOld} days`);
    }
  }

  /**
   * Utility function to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const payoutJobProcessor = new PayoutJobProcessor();

// Create the payout_jobs table migration (to be added to database)
export const payoutJobsTableSQL = `
-- Payout jobs table for background processing
CREATE TABLE IF NOT EXISTS payout_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID REFERENCES payouts(id) ON DELETE CASCADE NOT NULL,
  rail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'completed', 'failed', 'retrying')
  ),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for job processing
CREATE INDEX IF NOT EXISTS idx_payout_jobs_status ON payout_jobs(status);
CREATE INDEX IF NOT EXISTS idx_payout_jobs_next_retry ON payout_jobs(next_retry_at) WHERE next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payout_jobs_created_at ON payout_jobs(created_at);

-- RLS policy
ALTER TABLE payout_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can manage payout jobs" ON payout_jobs FOR ALL USING (auth.role() = 'service_role');

-- Grant permissions
GRANT ALL ON payout_jobs TO service_role;
`;