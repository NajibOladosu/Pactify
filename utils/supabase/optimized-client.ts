// Optimized Supabase client with connection pooling and caching

import { createClient } from '@supabase/supabase-js';
import { cache } from '@/lib/cache/redis-cache';

// Connection pool configuration
const POOL_SIZE = 10;
const IDLE_TIMEOUT = 30000; // 30 seconds
const MAX_LIFETIME = 300000; // 5 minutes

// Client pool for reusing connections
class SupabaseClientPool {
  private clients: Array<{
    client: ReturnType<typeof createClient>;
    created: number;
    lastUsed: number;
    inUse: boolean;
  }> = [];
  private maxSize: number;

  constructor(maxSize: number = POOL_SIZE) {
    this.maxSize = maxSize;
  }

  private createNewClient() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        db: {
          schema: 'public',
        },
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        },
        global: {
          headers: {
            'X-Connection-Pool': 'optimized-client'
          }
        }
      }
    );
  }

  getClient() {
    const now = Date.now();

    // Find available client
    let pooledClient = this.clients.find(c => 
      !c.inUse && 
      (now - c.created) < MAX_LIFETIME &&
      (now - c.lastUsed) < IDLE_TIMEOUT
    );

    if (!pooledClient) {
      // Create new client if pool not full
      if (this.clients.length < this.maxSize) {
        const newClient = {
          client: this.createNewClient(),
          created: now,
          lastUsed: now,
          inUse: true
        };
        this.clients.push(newClient as any);
        pooledClient = newClient as any;
      } else {
        // Remove oldest client and create new one
        const oldestIndex = this.clients.reduce((oldest, client, index) => 
          client.created < this.clients[oldest].created ? index : oldest, 0
        );
        
        this.clients[oldestIndex] = {
          client: this.createNewClient(),
          created: now,
          lastUsed: now,
          inUse: true
        } as any;
        
        pooledClient = this.clients[oldestIndex] as any;
      }
    } else {
      pooledClient.inUse = true;
      pooledClient.lastUsed = now;
    }

    return { 
      client: pooledClient!.client, 
      release: () => this.releaseClient(pooledClient!) 
    };
  }

  private releaseClient(pooledClient: any) {
    pooledClient.inUse = false;
    pooledClient.lastUsed = Date.now();
  }

  // Clean up expired clients
  cleanup() {
    const now = Date.now();
    this.clients = this.clients.filter(c => 
      (now - c.created) < MAX_LIFETIME && 
      (now - c.lastUsed) < IDLE_TIMEOUT
    );
  }
}

// Global client pool
const clientPool = new SupabaseClientPool();

// Cleanup interval
setInterval(() => {
  clientPool.cleanup();
}, 60000); // Every minute

// Cached query wrapper
export async function cachedQuery<T>(
  cacheKey: string,
  queryFn: (client: any) => Promise<T>,
  ttlSeconds: number = 300
): Promise<T> {
  // Try cache first
  const cached = await cache.get<T>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  // Execute query with pooled connection
  const { client, release } = clientPool.getClient();
  try {
    const result = await queryFn(client);
    await cache.set(cacheKey, result, ttlSeconds);
    return result;
  } finally {
    release();
  }
}

// Optimized server client with connection pooling
export async function createOptimizedClient() {
  const { client, release } = clientPool.getClient();
  
  // Add auto-release after timeout
  const timeoutId = setTimeout(() => {
    console.warn('Client held for too long, force releasing');
    release();
  }, 30000); // 30 seconds max

  return {
    client,
    release: () => {
      clearTimeout(timeoutId);
      release();
    }
  };
}

// Transaction wrapper with pooled connection
export async function withTransaction<T>(
  fn: (client: any) => Promise<T>
): Promise<T> {
  const { client, release } = clientPool.getClient();
  
  try {
    // Start transaction
    const { error: beginError } = await client.rpc('begin_transaction');
    if (beginError) throw beginError;

    try {
      const result = await fn(client);
      
      // Commit transaction
      const { error: commitError } = await client.rpc('commit_transaction');
      if (commitError) throw commitError;
      
      return result;
    } catch (error) {
      // Rollback on error
      await client.rpc('rollback_transaction');
      throw error;
    }
  } finally {
    release();
  }
}

// Batch query execution
export async function executeBatchQueries<T extends Record<string, any>>(
  queries: { [K in keyof T]: (client: any) => Promise<T[K]> }
): Promise<T> {
  const { client, release } = clientPool.getClient();
  
  try {
    const results = {} as T;
    const keys = Object.keys(queries) as (keyof T)[];
    
    // Execute all queries in parallel with same connection
    const promises = keys.map(async (key) => {
      try {
        results[key] = await queries[key](client);
      } catch (error) {
        console.error(`Batch query failed for ${String(key)}:`, error);
        results[key] = null as T[keyof T];
      }
    });

    await Promise.all(promises);
    return results;
  } finally {
    release();
  }
}

// Optimized user profile query with caching
export const getOptimizedUserProfile = async (userId: string) => {
  return cachedQuery(
    `profile:${userId}`,
    async (client) => {
      const { data, error } = await (client as any)
        .rpc('get_user_profile_fast', { _user_id: userId })
        .single();
      
      if (error) throw error;
      return data;
    },
    300 // 5 minutes cache
  );
};

// Optimized dashboard data with caching
export const getOptimizedDashboardData = async (userId: string) => {
  return cachedQuery(
    `dashboard:${userId}`,
    async (client) => {
      const { data, error } = await (client as any)
        .rpc('get_user_dashboard_data', { _user_id: userId })
        .single();
      
      if (error) throw error;
      return data;
    },
    60 // 1 minute cache for real-time data
  );
};

// Connection health monitoring
export function getConnectionStats() {
  return {
    poolSize: (clientPool as any).clients.length,
    activeConnections: (clientPool as any).clients.filter((c: any) => c.inUse).length,
    availableConnections: (clientPool as any).clients.filter((c: any) => !c.inUse).length,
    maxSize: (clientPool as any).maxSize
  };
}