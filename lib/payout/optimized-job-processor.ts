// Optimized background job processor with parallel processing and smart batching

import { createOptimizedClient, executeBatchQueries, withTransaction } from '@/utils/supabase/optimized-client';
import { getRailHandler } from './rails';
import { reconciliationManager } from './reconciliation';
import { cache, getCacheKey } from '@/lib/cache/redis-cache';
import {
  Payout,
  WithdrawalMethod,
  PayoutError,
  PayoutResult
} from './types';

interface OptimizedPayoutJob {
  id: string;
  payout_id: string;
  rail: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'retrying';
  attempts: number;
  max_attempts: number;
  next_retry_at?: string;
  error_message?: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

export class OptimizedPayoutJobProcessor {
  private isProcessing = false;
  private maxConcurrentJobs = 10; // Increased from 5
  private batchSize = 20; // Process jobs in batches
  private retryDelayMs = [1000, 5000, 15000, 60000, 300000]; // Optimized retry delays
  private processingWorkers: Set<string> = new Set();
  private statsCache = new Map<string, any>();

  /**
   * Start the optimized job processor with multiple workers
   */
  async start(): Promise<void> {
    if (this.isProcessing) {
      console.log('Optimized job processor is already running');
      return;
    }

    console.log('Starting optimized payout job processor...');
    this.isProcessing = true;

    // Start multiple worker processes
    const workers = Array.from({ length: this.maxConcurrentJobs }, (_, i) => 
      this.startWorker(`worker-${i}`)
    );

    // Start metrics collection
    this.startMetricsCollection();

    await Promise.all(workers);
  }

  /**
   * Individual worker process
   */
  private async startWorker(workerId: string): Promise<void> {
    while (this.isProcessing) {
      try {
        await this.processJobsBatch(workerId);
        
        // Brief pause between batches
        await this.sleep(2000);
      } catch (error) {
        console.error(`Worker ${workerId} error:`, error);
        await this.sleep(5000); // Longer pause on error
      }
    }
  }

  /**
   * Process jobs in optimized batches
   */
  private async processJobsBatch(workerId: string): Promise<void> {
    const { client, release } = await createOptimizedClient();
    
    try {
      // Get batch of jobs with optimized query
      const { data: jobs, error } = await client
        .from('payout_jobs')
        .select('*')
        .in('status', ['queued', 'retrying'])
        .or(`next_retry_at.is.null,next_retry_at.lt.${new Date().toISOString()}`)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(this.batchSize);

      if (error || !jobs?.length) {
        return;
      }

      console.log(`Worker ${workerId}: Processing ${jobs.length} jobs`);

      // Process jobs in parallel with controlled concurrency
      const jobPromises = jobs.map((job: any) => this.processJobOptimized(job, workerId));
      await Promise.allSettled(jobPromises);

    } finally {
      release();
    }
  }

  /**
   * Optimized single job processing
   */
  private async processJobOptimized(job: OptimizedPayoutJob, workerId: string): Promise<void> {
    const jobKey = `job:${job.id}`;
    
    // Skip if already being processed by another worker
    if (this.processingWorkers.has(jobKey)) {
      return;
    }

    this.processingWorkers.add(jobKey);
    
    try {
      console.log(`Worker ${workerId}: Processing job ${job.id} for payout ${job.payout_id}`);

      // Use transaction for atomic updates
      await withTransaction(async (client) => {
        // Mark job as processing
        const { error: updateError } = await client
          .from('payout_jobs')
          .update({
            status: 'processing',
            attempts: job.attempts + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id)
          .eq('status', job.status); // Ensure job hasn't been picked up by another worker

        if (updateError) {
          console.log(`Job ${job.id} already being processed by another worker`);
          return;
        }

        // Get payout and method data in parallel
        // Get payout data first
        const { data: payout, error: payoutError } = await (client as any)
          .from('payouts')
          .select('*')
          .eq('id', job.payout_id)
          .single();

        if (payoutError || !payout) {
          throw new PayoutError('Payout not found', 'PAYOUT_NOT_FOUND', false);
        }

        // Get withdrawal method data
        const { data: method } = await (client as any)
          .from('withdrawal_methods')
          .select('*')
          .eq('id', payout.withdrawal_method_id)
          .single();

        // Get rail handler
        const railHandler = getRailHandler(job.rail as any);

        // Log job start
        await reconciliationManager.logEntry({
          payout_id: job.payout_id,
          rail: job.rail as any,
          event_time: new Date().toISOString(),
          action: 'job_started',
          notes: `Optimized job started (worker: ${workerId}, attempt: ${job.attempts + 1})`,
          created_by: workerId,
          request_payload: {
            job_id: job.id,
            worker_id: workerId,
            attempt: job.attempts + 1
          }
        });

        // Execute the payout
        const result: PayoutResult = await railHandler.createPayout(payout, method);

        if (result.success) {
          console.log(`Worker ${workerId}: Payout ${job.payout_id} processed successfully`);

          // Batch update payout and job status
          await Promise.all([
            (client as any)
              .from('payouts')
              .update({
                provider_reference: result.provider_reference,
                status: 'processing',
                processing_started_at: new Date().toISOString(),
                expected_arrival_date: result.estimated_arrival
              })
              .eq('id', job.payout_id),
            
            (client as any)
              .from('payout_jobs')
              .update({
                status: 'completed',
                updated_at: new Date().toISOString()
              })
              .eq('id', job.id)
          ]);

          // Log success
          await reconciliationManager.logEntry({
            payout_id: job.payout_id,
            rail: job.rail as any,
            event_time: new Date().toISOString(),
            action: 'job_completed',
            provider_reference: result.provider_reference,
            notes: `Payout processed successfully (worker: ${workerId})`,
            created_by: workerId,
            response_payload: result
          });

          // Invalidate relevant caches
          await this.invalidatePayoutCaches(payout.user_id, payout.currency);

        } else {
          throw new PayoutError(
            result.error || 'Payout processing failed',
            'PAYOUT_PROCESSING_ERROR',
            true
          );
        }
      });

    } catch (error) {
      console.error(`Worker ${workerId}: Job ${job.id} failed:`, error);
      await this.handleJobFailureOptimized(job, error, workerId);
    } finally {
      this.processingWorkers.delete(jobKey);
    }
  }

  /**
   * Optimized job failure handling with exponential backoff
   */
  private async handleJobFailureOptimized(
    job: OptimizedPayoutJob, 
    error: any, 
    workerId: string
  ): Promise<void> {
    const { client, release } = await createOptimizedClient();
    
    try {
      const attempts = job.attempts + 1;
      const maxAttempts = job.max_attempts;
      const isRetryable = error instanceof PayoutError ? error.retryable : true;

      // Log the failure
      await reconciliationManager.logEntry({
        payout_id: job.payout_id,
        rail: job.rail as any,
        event_time: new Date().toISOString(),
        action: 'job_failed',
        notes: `Job attempt ${attempts} failed (worker: ${workerId}): ${error.message}`,
        created_by: workerId,
        request_payload: {
          error: error.message,
          code: error.code,
          retryable: isRetryable,
          attempt: attempts,
          worker_id: workerId
        }
      });

      if (isRetryable && attempts < maxAttempts) {
        // Calculate exponential backoff with jitter
        const baseDelay = this.retryDelayMs[Math.min(attempts - 1, this.retryDelayMs.length - 1)];
        const jitter = Math.random() * 0.1 * baseDelay; // Add up to 10% jitter
        const retryDelay = Math.floor(baseDelay + jitter);
        const nextRetryAt = new Date(Date.now() + retryDelay).toISOString();

        await (client as any)
          .from('payout_jobs')
          .update({
            status: 'retrying',
            attempts,
            error_message: error.message,
            next_retry_at: nextRetryAt,
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id);

        console.log(`Worker ${workerId}: Job ${job.id} will retry in ${retryDelay}ms (attempt ${attempts}/${maxAttempts})`);

      } else {
        // Mark as permanently failed
        await Promise.all([
          (client as any)
            .from('payout_jobs')
            .update({
              status: 'failed',
              attempts,
              error_message: error.message,
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id),
          
          reconciliationManager.updatePayoutStatus(
            job.payout_id,
            'failed',
            undefined,
            undefined,
            error.message
          )
        ]);

        console.log(`Worker ${workerId}: Job ${job.id} permanently failed after ${attempts} attempts`);
      }
    } finally {
      release();
    }
  }

  /**
   * Queue multiple payouts for batch processing
   */
  async queuePayoutsBatch(payoutIds: string[], priority: number = 0): Promise<void> {
    const { client, release } = await createOptimizedClient();
    
    try {
      // Get payout data in batch
      const { data: payouts, error } = await client
        .from('payouts')
        .select('id, rail, user_id')
        .in('id', payoutIds);

      if (error || !payouts?.length) {
        throw new PayoutError('Payouts not found', 'PAYOUTS_NOT_FOUND', false);
      }

      // Create job records in batch
      const jobInserts = payouts.map((payout: any) => ({
        payout_id: payout.id,
        rail: payout.rail,
        status: 'queued' as const,
        attempts: 0,
        max_attempts: 3,
        priority
      }));

      const { error: jobError } = await client
        .from('payout_jobs')
        .insert(jobInserts as any);

      if (jobError) {
        throw new PayoutError('Failed to queue payouts', 'JOB_QUEUE_ERROR', true);
      }

      console.log(`Queued ${payoutIds.length} payouts for batch processing (priority: ${priority})`);

    } finally {
      release();
    }
  }

  /**
   * Get optimized job statistics with caching
   */
  async getJobStats(): Promise<{
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    retrying: number;
    workers_active: number;
  }> {
    const cacheKey = getCacheKey('job-stats');
    
    return await cache.get(cacheKey) || await executeBatchQueries({
      stats: async (client) => {
        const { data, error } = await client
          .from('payout_jobs')
          .select('status')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        if (error || !data) {
          return { queued: 0, processing: 0, completed: 0, failed: 0, retrying: 0, workers_active: 0 };
        }

        const stats = data.reduce((acc: any, job: any) => {
          const status = job.status as string;
          if (status in acc) {
            acc[status] = (acc[status] || 0) + 1;
          }
          return acc;
        }, { queued: 0, processing: 0, completed: 0, failed: 0, retrying: 0, workers_active: this.processingWorkers.size });

        // Cache for 30 seconds
        await cache.set(cacheKey, stats, 30);
        return stats;
      }
    }).then(result => result.stats);
  }

  /**
   * Stop the processor gracefully
   */
  stop(): void {
    console.log('Stopping optimized payout job processor...');
    this.isProcessing = false;
  }

  /**
   * Invalidate payout-related caches
   */
  private async invalidatePayoutCaches(userId: string, currency: string): Promise<void> {
    await Promise.all([
      cache.invalidatePattern(`user:${userId}:*`),
      cache.invalidatePattern(`withdrawal-history-${currency}-*`),
      cache.invalidatePattern('job-stats')
    ]);
  }

  /**
   * Start metrics collection for monitoring
   */
  private startMetricsCollection(): void {
    setInterval(async () => {
      try {
        const stats = await this.getJobStats();
        this.statsCache.set('current', {
          ...stats,
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        });
      } catch (error) {
        console.error('Metrics collection error:', error);
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Get processor health metrics
   */
  getHealthMetrics() {
    return {
      is_processing: this.isProcessing,
      active_workers: this.processingWorkers.size,
      max_concurrent_jobs: this.maxConcurrentJobs,
      batch_size: this.batchSize,
      last_stats: this.statsCache.get('current'),
      memory_usage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }

  /**
   * Clean up completed jobs in batches
   */
  async cleanupCompletedJobs(daysOld: number = 7): Promise<number> {
    const { client, release } = await createOptimizedClient();
    
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
      
      const { count, error } = await client
        .from('payout_jobs')
        .delete({ count: 'exact' })
        .in('status', ['completed', 'failed'])
        .lt('updated_at', cutoffDate);

      if (error) {
        console.error('Error cleaning up jobs:', error);
        return 0;
      }

      console.log(`Cleaned up ${count || 0} completed/failed jobs older than ${daysOld} days`);
      return count || 0;
    } finally {
      release();
    }
  }

  /**
   * Utility function to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export optimized singleton instance
export const optimizedPayoutJobProcessor = new OptimizedPayoutJobProcessor();