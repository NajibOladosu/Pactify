// Redis cache implementation for high-performance caching
// Falls back to in-memory cache if Redis is not available

// Conditional Redis import - only load if available
let createRedisClient: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const redis = require('redis');
  createRedisClient = redis.createClient;
} catch {
  // Redis not available, will use memory cache fallback
  console.log('Redis not available, using memory cache fallback');
}

// In-memory cache fallback
const memoryCache = new Map<string, { value: any; expiry: number }>();

class CacheManager {
  private redis: ReturnType<typeof createRedisClient> | null = null;
  private useRedis = false;

  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis() {
    try {
      if (process.env.REDIS_URL && createRedisClient) {
        this.redis = createRedisClient({
          url: process.env.REDIS_URL
        });

        this.redis.on('error', (err: any) => {
          console.error('Redis error:', err);
          this.useRedis = false;
        });

        this.redis.on('connect', () => {
          console.log('Redis connected');
          this.useRedis = true;
        });

        await this.redis.connect();
      }
    } catch (error) {
      console.warn('Redis initialization failed, using memory cache:', error);
      this.useRedis = false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.useRedis && this.redis) {
        const value = await this.redis.get(key);
        return value ? JSON.parse(value) : null;
      } else {
        // Memory cache fallback
        const item = memoryCache.get(key);
        if (item && item.expiry > Date.now()) {
          return item.value;
        } else if (item) {
          memoryCache.delete(key);
        }
        return null;
      }
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number = 300): Promise<void> {
    try {
      if (this.useRedis && this.redis) {
        await this.redis.setEx(key, ttlSeconds, JSON.stringify(value));
      } else {
        // Memory cache fallback
        memoryCache.set(key, {
          value,
          expiry: Date.now() + ttlSeconds * 1000
        });
      }
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      if (this.useRedis && this.redis) {
        await this.redis.del(key);
      } else {
        memoryCache.delete(key);
      }
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      if (this.useRedis && this.redis) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(keys);
        }
      } else {
        // Memory cache pattern invalidation
        for (const key of Array.from(memoryCache.keys())) {
          if (key.includes(pattern.replace('*', ''))) {
            memoryCache.delete(key);
          }
        }
      }
    } catch (error) {
      console.error('Cache pattern invalidation error:', error);
    }
  }

  // Cleanup expired memory cache entries
  private cleanupMemoryCache() {
    const now = Date.now();
    for (const [key, item] of Array.from(memoryCache.entries())) {
      if (item.expiry <= now) {
        memoryCache.delete(key);
      }
    }
  }
}

// Singleton instance
export const cache = new CacheManager();

// Cache helper functions
export function getCacheKey(...parts: string[]): string {
  return parts.join(':');
}

export function getUserCacheKey(userId: string, type: string): string {
  return getCacheKey('user', userId, type);
}

export function getContractCacheKey(contractId: string, type: string): string {
  return getCacheKey('contract', contractId, type);
}

// Cached function wrapper
export function cached<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  keyGenerator: (...args: T) => string,
  ttlSeconds: number = 300
) {
  return async (...args: T): Promise<R> => {
    const key = keyGenerator(...args);
    
    // Try to get from cache
    const cached = await cache.get<R>(key);
    if (cached !== null) {
      return cached;
    }

    // Execute function and cache result
    const result = await fn(...args);
    await cache.set(key, result, ttlSeconds);
    
    return result;
  };
}

// Start cleanup interval for memory cache
setInterval(() => {
  if (cache) {
    (cache as any).cleanupMemoryCache();
  }
}, 60000); // Clean up every minute