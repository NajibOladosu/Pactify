// Optimized API response helpers with caching and parallel queries

import { createClient } from '@/utils/supabase/server';
import { cache, getUserCacheKey, cached } from '@/lib/cache/redis-cache';
import { NextResponse } from 'next/server';

// Response compression and streaming helpers
export function createStreamingResponse(data: any) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(JSON.stringify(data)));
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60, s-maxage=300',
      'Content-Encoding': 'gzip'
    }
  });
}

// Optimized user data fetching with parallel queries
export const getOptimizedUserData = cached(
  async (userId: string) => {
    const supabase = await createClient();

    // Execute all queries in parallel
    const [profileResult, dashboardResult, balanceResult, notificationResult] = await Promise.all([
      supabase.rpc('get_user_profile_fast', { _user_id: userId }),
      supabase.rpc('get_user_dashboard_data', { _user_id: userId }),
      supabase.from('wallet_balances').select('*').eq('user_id', userId),
      supabase.from('notifications').select('count').eq('user_id', userId).eq('is_read', false)
    ]);

    return {
      profile: profileResult.data,
      dashboard: dashboardResult.data,
      balances: balanceResult.data || [],
      unread_notifications: notificationResult.data?.length || 0
    };
  },
  (userId: string) => getUserCacheKey(userId, 'complete-data'),
  180 // 3 minutes cache
);

// Optimized contract listing with pagination
export const getOptimizedContracts = cached(
  async (userId: string, filters: { status?: string; limit?: number; offset?: number }) => {
    const supabase = await createClient();
    const { status, limit = 20, offset = 0 } = filters;

    let query = supabase
      .from('contracts')
      .select(`
        id, title, status, total_amount, currency, created_at, updated_at,
        client:profiles!client_id(id, display_name, avatar_url),
        freelancer:profiles!freelancer_id(id, display_name, avatar_url),
        milestones:contract_milestones(count)
      `, { count: 'exact' })
      .or(`client_id.eq.${userId},freelancer_id.eq.${userId}`)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    return await query;
  },
  (userId: string, filters) => getUserCacheKey(userId, `contracts-${JSON.stringify(filters)}`),
  120 // 2 minutes cache
);

// Optimized payment history
export const getOptimizedPaymentHistory = cached(
  async (userId: string, currency: string, limit: number = 50, offset: number = 0) => {
    const supabase = await createClient();

    // Single optimized query with all needed data
    const { data, error } = await supabase
      .from('payouts')
      .select(`
        id, amount, currency, net_amount, status, rail, trace_id,
        platform_fee, provider_fee, failure_reason, created_at,
        expected_arrival_date, completed_at,
        withdrawal_method:withdrawal_methods!inner(
          label, provider_name, icon, last_four
        )
      `)
      .eq('user_id', userId)
      .eq('currency', currency)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return data;
  },
  (userId: string, currency: string, limit: number, offset: number) => 
    getUserCacheKey(userId, `payments-${currency}-${limit}-${offset}`),
  60 // 1 minute cache
);

// Batch API response optimization
export async function createOptimizedResponse<T>(
  dataFetcher: () => Promise<T>,
  cacheKey?: string,
  cacheTtl: number = 300
) {
  try {
    let data: T;

    if (cacheKey) {
      // Try cache first
      const cached = await cache.get<T>(cacheKey);
      if (cached) {
        return NextResponse.json({
          success: true,
          data: cached,
          cached: true,
          timestamp: new Date().toISOString()
        }, {
          headers: {
            'Cache-Control': 'public, max-age=60, s-maxage=300',
            'X-Cache': 'HIT'
          }
        });
      }
    }

    // Fetch data
    data = await dataFetcher();

    // Cache result
    if (cacheKey) {
      await cache.set(cacheKey, data, cacheTtl);
    }

    return NextResponse.json({
      success: true,
      data,
      cached: false,
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=300',
        'X-Cache': 'MISS'
      }
    });

  } catch (error) {
    console.error('API optimization error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }
}

// Parallel data loading helper
export async function loadDataInParallel<T extends Record<string, any>>(
  loaders: { [K in keyof T]: () => Promise<T[K]> }
): Promise<T> {
  const keys = Object.keys(loaders) as (keyof T)[];
  const promises = keys.map(key => loaders[key]());
  
  const results = await Promise.allSettled(promises);
  const data = {} as T;

  results.forEach((result, index) => {
    const key = keys[index];
    if (result.status === 'fulfilled') {
      data[key] = result.value;
    } else {
      console.error(`Failed to load ${String(key)}:`, result.reason);
      data[key] = null as T[keyof T];
    }
  });

  return data;
}

// Response compression middleware
export function compressResponse(data: any): string {
  // Simple JSON minification - in production, use actual compression
  return JSON.stringify(data, null, 0);
}

// API rate limiting with cache
export async function checkRateLimit(
  identifier: string, 
  limit: number = 100, 
  windowSeconds: number = 3600
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const key = `rate_limit:${identifier}`;
  const now = Date.now();
  const windowStart = now - (windowSeconds * 1000);

  // Get current count from cache
  let requestLog = await cache.get<number[]>(key) || [];
  
  // Filter out old requests
  requestLog = requestLog.filter(timestamp => timestamp > windowStart);
  
  const allowed = requestLog.length < limit;
  const remaining = Math.max(0, limit - requestLog.length);
  const resetTime = windowStart + (windowSeconds * 1000);

  if (allowed) {
    requestLog.push(now);
    await cache.set(key, requestLog, windowSeconds);
  }

  return { allowed, remaining, resetTime };
}