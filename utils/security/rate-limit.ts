import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from './validation';

/**
 * Rate limiting configuration for different endpoints
 */
export const RATE_LIMITS = {
  // Authentication endpoints
  '/api/auth': { requests: 5, windowMs: 15 * 60 * 1000 }, // 5 requests per 15 min
  '/api/sign-in': { requests: 5, windowMs: 15 * 60 * 1000 },
  '/api/sign-up': { requests: 3, windowMs: 60 * 60 * 1000 }, // 3 requests per hour
  '/api/forgot-password': { requests: 3, windowMs: 60 * 60 * 1000 },
  
  // API endpoints
  '/api/contracts': { requests: 100, windowMs: 60 * 60 * 1000 }, // 100 requests per hour
  '/api/payments': { requests: 50, windowMs: 60 * 60 * 1000 }, // 50 requests per hour
  '/api/webhooks': { requests: 1000, windowMs: 60 * 60 * 1000 }, // 1000 requests per hour (webhooks)
  
  // File uploads
  '/api/upload': { requests: 10, windowMs: 60 * 60 * 1000 }, // 10 uploads per hour
  
  // Default rate limit
  default: { requests: 200, windowMs: 60 * 60 * 1000 } // 200 requests per hour
};

/**
 * Get client IP address from request
 */
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cloudflareIP = request.headers.get('cf-connecting-ip');
  
  if (cloudflareIP) return cloudflareIP;
  if (realIP) return realIP;
  if (forwarded) return forwarded.split(',')[0].trim();
  
  return 'unknown';
}

/**
 * Get rate limit configuration for a path
 */
function getRateLimitConfig(pathname: string) {
  // Find the most specific matching rate limit
  for (const [path, config] of Object.entries(RATE_LIMITS)) {
    if (pathname.startsWith(path)) {
      return config;
    }
  }
  return RATE_LIMITS.default;
}

/**
 * Rate limiting middleware for API routes
 */
export function withRateLimit(handler: (request: NextRequest) => Promise<NextResponse>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      const clientIP = getClientIP(request);
      const pathname = request.nextUrl.pathname;
      const config = getRateLimitConfig(pathname);
      
      // Create a unique key for this IP and endpoint
      const rateLimitKey = `${clientIP}:${pathname}`;
      
      // Check rate limit
      const isAllowed = checkRateLimit(rateLimitKey, config.requests, config.windowMs);
      
      if (!isAllowed) {
        return NextResponse.json(
          { 
            error: 'Too many requests',
            message: `Rate limit exceeded. Try again in ${Math.ceil(config.windowMs / 60000)} minutes.`,
            retryAfter: Math.ceil(config.windowMs / 1000)
          },
          { 
            status: 429,
            headers: {
              'Retry-After': Math.ceil(config.windowMs / 1000).toString(),
              'X-RateLimit-Limit': config.requests.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': (Date.now() + config.windowMs).toString()
            }
          }
        );
      }
      
      // Call the original handler
      const response = await handler(request);
      
      // Add rate limit headers to successful responses
      response.headers.set('X-RateLimit-Limit', config.requests.toString());
      
      return response;
      
    } catch (error) {
      console.error('Rate limit middleware error:', error);
      // If rate limiting fails, allow the request to proceed
      return handler(request);
    }
  };
}

/**
 * Simple rate limit check for inline use
 */
export function checkEndpointRateLimit(request: NextRequest): boolean {
  const clientIP = getClientIP(request);
  const pathname = request.nextUrl.pathname;
  const config = getRateLimitConfig(pathname);
  const rateLimitKey = `${clientIP}:${pathname}`;
  
  return checkRateLimit(rateLimitKey, config.requests, config.windowMs);
}