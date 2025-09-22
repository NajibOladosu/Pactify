// Performance monitoring and health check endpoint

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getConnectionStats } from '@/utils/supabase/optimized-client';
import { optimizedPayoutJobProcessor } from '@/lib/payout/optimized-job-processor';
import { cache } from '@/lib/cache/redis-cache';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admin check (simplified - in production, check proper roles)
    const isAdmin = user.email?.endsWith('@pactify.com') || false;
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const url = new URL(request.url);
    const metric = url.searchParams.get('metric');

    // Get specific metric or all metrics
    const metrics = await gatherPerformanceMetrics();
    
    if (metric && metrics[metric as keyof typeof metrics]) {
      return NextResponse.json({
        success: true,
        metric,
        data: metrics[metric as keyof typeof metrics],
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Performance monitoring error:', error);
    return NextResponse.json({
      error: 'Failed to gather performance metrics',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function gatherPerformanceMetrics() {
  const startTime = Date.now();

  // Gather all metrics in parallel
  const [
    dbConnectionStats,
    jobProcessorHealth,
    cacheHealth,
    systemMetrics,
    slowQueries,
    apiResponseTimes
  ] = await Promise.allSettled([
    getDatabaseConnectionStats(),
    getJobProcessorHealth(),
    getCacheHealth(),
    getSystemMetrics(),
    getSlowQueries(),
    getApiResponseTimes()
  ]);

  const gatheringTime = Date.now() - startTime;

  return {
    database: {
      connections: dbConnectionStats.status === 'fulfilled' ? dbConnectionStats.value : null,
      error: dbConnectionStats.status === 'rejected' ? dbConnectionStats.reason?.message : null
    },
    job_processor: {
      health: jobProcessorHealth.status === 'fulfilled' ? jobProcessorHealth.value : null,
      error: jobProcessorHealth.status === 'rejected' ? jobProcessorHealth.reason?.message : null
    },
    cache: {
      health: cacheHealth.status === 'fulfilled' ? cacheHealth.value : null,
      error: cacheHealth.status === 'rejected' ? cacheHealth.reason?.message : null
    },
    system: {
      metrics: systemMetrics.status === 'fulfilled' ? systemMetrics.value : null,
      error: systemMetrics.status === 'rejected' ? systemMetrics.reason?.message : null
    },
    database_performance: {
      slow_queries: slowQueries.status === 'fulfilled' ? slowQueries.value : null,
      error: slowQueries.status === 'rejected' ? slowQueries.reason?.message : null
    },
    api_performance: {
      response_times: apiResponseTimes.status === 'fulfilled' ? apiResponseTimes.value : null,
      error: apiResponseTimes.status === 'rejected' ? apiResponseTimes.reason?.message : null
    },
    meta: {
      gathering_time_ms: gatheringTime,
      timestamp: new Date().toISOString()
    }
  };
}

async function getDatabaseConnectionStats() {
  const stats = getConnectionStats();
  
  // Test database connectivity
  const supabase = await createClient();
  const testStart = Date.now();
  
  try {
    await supabase.from('profiles').select('count').limit(1);
    const responseTime = Date.now() - testStart;
    
    return {
      ...stats,
      connectivity: {
        status: 'healthy',
        response_time_ms: responseTime
      }
    };
  } catch (error) {
    return {
      ...stats,
      connectivity: {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Connection failed'
      }
    };
  }
}

async function getJobProcessorHealth() {
  const health = optimizedPayoutJobProcessor.getHealthMetrics();
  const stats = await optimizedPayoutJobProcessor.getJobStats();
  
  return {
    ...health,
    job_stats: stats,
    status: health.is_processing ? 'running' : 'stopped'
  };
}

async function getCacheHealth() {
  const testKey = `health-check-${Date.now()}`;
  const testValue = { test: true, timestamp: Date.now() };
  
  try {
    const writeStart = Date.now();
    await cache.set(testKey, testValue, 10);
    const writeTime = Date.now() - writeStart;
    
    const readStart = Date.now();
    const retrieved = await cache.get(testKey);
    const readTime = Date.now() - readStart;
    
    await cache.del(testKey);
    
    const isWorking = retrieved && JSON.stringify(retrieved) === JSON.stringify(testValue);
    
    return {
      status: isWorking ? 'healthy' : 'degraded',
      performance: {
        write_time_ms: writeTime,
        read_time_ms: readTime
      },
      test_success: isWorking
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Cache test failed'
    };
  }
}

async function getSystemMetrics() {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  return {
    memory: {
      rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
      heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      external_mb: Math.round(memoryUsage.external / 1024 / 1024)
    },
    cpu: {
      user_ms: Math.round(cpuUsage.user / 1000),
      system_ms: Math.round(cpuUsage.system / 1000)
    },
    uptime_seconds: Math.round(process.uptime()),
    node_version: process.version,
    platform: process.platform
  };
}

async function getSlowQueries() {
  try {
    const supabase = await createClient();
    
    // This would require pg_stat_statements extension to be enabled
    const { data, error } = await supabase.rpc('get_slow_queries').limit(10);
    
    if (error) {
      return { available: false, reason: 'pg_stat_statements not enabled' };
    }
    
    return {
      available: true,
      queries: data || []
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : 'Query failed'
    };
  }
}

async function getApiResponseTimes() {
  // Simple health checks for key endpoints
  const endpoints = [
    '/api/withdrawals/history?limit=1',
    '/api/withdrawals/methods',
    '/api/balance/sync'
  ];
  
  const results = await Promise.allSettled(
    endpoints.map(async (endpoint) => {
      const start = Date.now();
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}${endpoint}`, {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer test', // This would need proper auth in production
            'Content-Type': 'application/json'
          }
        });
        
        return {
          status_code: response.status,
          response_time_ms: Date.now() - start,
          healthy: response.status < 500
        };
      } catch (error) {
        return {
          status_code: 0,
          response_time_ms: Date.now() - start,
          healthy: false,
          error: error instanceof Error ? error.message : 'Request failed'
        };
      }
    })
  );
  
  return results.map((result, index) => ({
    endpoint: endpoints[index],
    ...(result.status === 'fulfilled' ? result.value : {
      error: result.reason?.message || 'Health check failed'
    })
  }));
}

// Health check endpoint
export async function HEAD() {
  try {
    // Quick health check
    const supabase = await createClient();
    await supabase.from('profiles').select('count').limit(1);
    
    return new Response(null, { status: 200 });
  } catch (error) {
    return new Response(null, { status: 503 });
  }
}