import { NextRequest, NextResponse } from "next/server";
import { createSecurityValidator, SecurityValidationError } from "./validations";
import { InputSanitizer, sanitizeRequestBody } from "./sanitization";
import { ErrorHandler, withErrorHandling } from "./error-handling";

export interface SecurityConfig {
  rateLimit?: {
    requests: number;
    windowMs: number;
  };
  validateInput?: boolean;
  requireAuth?: boolean;
  allowedMethods?: string[];
  maxBodySize?: number;
  requireKyc?: boolean;
  contractAmountCheck?: boolean;
}

export class SecurityMiddleware {
  private static rateLimitStore = new Map<string, { count: number; resetTime: number }>();

  /**
   * Apply comprehensive security middleware
   */
  static withSecurity(
    handler: (request: NextRequest, context?: any) => Promise<NextResponse>,
    config: SecurityConfig = {}
  ) {
    return withErrorHandling(async (request: NextRequest, context?: any) => {
      // Default security config
      const securityConfig: Required<SecurityConfig> = {
        rateLimit: { requests: 100, windowMs: 15 * 60 * 1000 }, // 100 requests per 15 minutes
        validateInput: true,
        requireAuth: true,
        allowedMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
        maxBodySize: 10 * 1024 * 1024, // 10MB
        requireKyc: false,
        contractAmountCheck: false,
        ...config
      };

      // 1. Validate HTTP method
      if (!securityConfig.allowedMethods.includes(request.method)) {
        return NextResponse.json(
          {
            error: {
              code: "METHOD_NOT_ALLOWED",
              message: `Method ${request.method} not allowed`,
              timestamp: new Date().toISOString()
            }
          },
          { status: 405 }
        );
      }

      // 2. Apply rate limiting
      const rateLimitResponse = await this.applyRateLimit(request, securityConfig.rateLimit);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      // 3. Validate content length
      const contentLength = request.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > securityConfig.maxBodySize) {
        return NextResponse.json(
          {
            error: {
              code: "PAYLOAD_TOO_LARGE",
              message: "Request body too large",
              timestamp: new Date().toISOString()
            }
          },
          { status: 413 }
        );
      }

      // 4. Check authentication if required
      if (securityConfig.requireAuth) {
        try {
          await createSecurityValidator();
        } catch (error) {
          if (error instanceof SecurityValidationError) {
            return NextResponse.json(
              {
                error: {
                  code: error.code,
                  message: error.message,
                  timestamp: new Date().toISOString()
                }
              },
              { status: error.statusCode }
            );
          }
          throw error;
        }
      }

      // 5. Validate and sanitize input
      if (securityConfig.validateInput && ['POST', 'PATCH', 'PUT'].includes(request.method)) {
        try {
          const originalBody = await request.json().catch(() => ({}));
          const sanitizedBody = this.sanitizeInput(originalBody, request.url);
          
          // Create a new request with sanitized body
          const sanitizedRequest = new NextRequest(request.url, {
            method: request.method,
            headers: request.headers,
            body: JSON.stringify(sanitizedBody)
          });

          // Add sanitized body to the request for the handler
          (sanitizedRequest as any).sanitizedBody = sanitizedBody;
          
          request = sanitizedRequest;
        } catch (error) {
          return NextResponse.json(
            {
              error: {
                code: "INVALID_JSON",
                message: "Invalid JSON in request body",
                timestamp: new Date().toISOString()
              }
            },
            { status: 400 }
          );
        }
      }

      // 6. Security headers
      const response = await handler(request, context);
      this.addSecurityHeaders(response);

      // 7. Log security events
      this.logSecurityEvent(request, response);

      return response;
    });
  }

  /**
   * Apply rate limiting
   */
  private static async applyRateLimit(
    request: NextRequest,
    config: { requests: number; windowMs: number }
  ): Promise<NextResponse | null> {
    const identifier = this.getClientIdentifier(request);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Clean up expired entries
    for (const [key, value] of this.rateLimitStore.entries()) {
      if (value.resetTime < now) {
        this.rateLimitStore.delete(key);
      }
    }

    // Get or create rate limit entry
    let rateLimitEntry = this.rateLimitStore.get(identifier);
    if (!rateLimitEntry || rateLimitEntry.resetTime < now) {
      rateLimitEntry = {
        count: 0,
        resetTime: now + config.windowMs
      };
      this.rateLimitStore.set(identifier, rateLimitEntry);
    }

    // Check if limit exceeded
    if (rateLimitEntry.count >= config.requests) {
      const retryAfter = Math.ceil((rateLimitEntry.resetTime - now) / 1000);
      
      ErrorHandler.logSecurityEvent(
        'RATE_LIMIT_EXCEEDED',
        undefined,
        { identifier, ip: request.ip },
        'medium'
      );

      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests. Please try again later.",
            timestamp: new Date().toISOString(),
            retryAfter
          }
        },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': config.requests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(rateLimitEntry.resetTime / 1000).toString()
          }
        }
      );
    }

    // Increment counter
    rateLimitEntry.count++;
    this.rateLimitStore.set(identifier, rateLimitEntry);

    return null;
  }

  /**
   * Get client identifier for rate limiting
   */
  private static getClientIdentifier(request: NextRequest): string {
    // Use IP address and User-Agent for identification
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    // Create a hash of IP + User-Agent for privacy
    return `${ip}-${userAgent.slice(0, 50)}`;
  }

  /**
   * Sanitize input based on endpoint
   */
  private static sanitizeInput(body: any, url: string): any {
    if (!body || typeof body !== 'object') {
      return {};
    }

    // Determine sanitization type based on URL
    if (url.includes('/contracts') && url.includes('/milestones')) {
      return sanitizeRequestBody(body, 'milestone');
    } else if (url.includes('/contracts')) {
      return sanitizeRequestBody(body, 'contract');
    } else if (url.includes('/deliver') || url.includes('/submit')) {
      return sanitizeRequestBody(body, 'submission');
    } else if (url.includes('/review') || url.includes('/feedback')) {
      return sanitizeRequestBody(body, 'feedback');
    }

    return sanitizeRequestBody(body, 'general');
  }

  /**
   * Add security headers to response
   */
  private static addSecurityHeaders(response: NextResponse): void {
    // Prevent XSS attacks
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    
    // HSTS for HTTPS
    if (process.env.NODE_ENV === 'production') {
      response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Content Security Policy
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:"
    );

    // Referrer Policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Remove server information
    response.headers.delete('Server');
    response.headers.delete('X-Powered-By');
  }

  /**
   * Log security events
   */
  private static logSecurityEvent(request: NextRequest, response: NextResponse): void {
    const statusCode = response.status;
    const method = request.method;
    const url = request.url;
    const ip = request.ip || request.headers.get('x-forwarded-for');
    const userAgent = request.headers.get('user-agent');

    // Log suspicious activity
    if (statusCode === 401 || statusCode === 403) {
      ErrorHandler.logSecurityEvent(
        'UNAUTHORIZED_ACCESS_ATTEMPT',
        undefined,
        {
          method,
          url,
          ip,
          userAgent,
          statusCode
        },
        'medium'
      );
    }

    // Log server errors
    if (statusCode >= 500) {
      ErrorHandler.logSecurityEvent(
        'SERVER_ERROR',
        undefined,
        {
          method,
          url,
          ip,
          userAgent,
          statusCode
        },
        'high'
      );
    }

    // Log in development/debug mode
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] ${method} ${url} - ${statusCode} - ${ip}`);
    }
  }

  /**
   * Validate API key if provided
   */
  static validateApiKey(request: NextRequest): boolean {
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) return false;

    // In production, validate against stored API keys
    const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
    return validApiKeys.includes(apiKey);
  }

  /**
   * Check for suspicious patterns
   */
  static detectSuspiciousActivity(request: NextRequest): boolean {
    const url = request.url.toLowerCase();
    const userAgent = request.headers.get('user-agent')?.toLowerCase() || '';

    // Common attack patterns
    const suspiciousPatterns = [
      /\.\./,  // Path traversal
      /<script/i,  // XSS attempts
      /union.*select/i,  // SQL injection
      /exec\s*\(/i,  // Code injection
      /javascript:/i,  // JavaScript injection
      /data:text\/html/i  // Data URI XSS
    ];

    return suspiciousPatterns.some(pattern => 
      pattern.test(url) || pattern.test(userAgent)
    );
  }

  /**
   * Create middleware for contract-specific operations
   */
  static forContract(config: Partial<SecurityConfig> = {}) {
    return this.withSecurity(async (request, context) => {
      // This will be implemented by the actual route handler
      throw new Error("Handler not implemented");
    }, {
      ...config,
      contractAmountCheck: true
    });
  }

  /**
   * Create middleware for payment operations
   */
  static forPayment(config: Partial<SecurityConfig> = {}) {
    return this.withSecurity(async (request, context) => {
      throw new Error("Handler not implemented");
    }, {
      ...config,
      requireKyc: true,
      rateLimit: { requests: 10, windowMs: 60 * 1000 } // More restrictive for payments
    });
  }

  /**
   * Create middleware for KYC operations
   */
  static forKyc(config: Partial<SecurityConfig> = {}) {
    return this.withSecurity(async (request, context) => {
      throw new Error("Handler not implemented");
    }, {
      ...config,
      rateLimit: { requests: 5, windowMs: 60 * 1000 }, // Very restrictive for KYC
      maxBodySize: 50 * 1024 * 1024 // 50MB for document uploads
    });
  }
}

/**
 * Helper function to apply security to any handler
 */
export function withSecureHandler<T extends any[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse>,
  config?: SecurityConfig
) {
  return SecurityMiddleware.withSecurity(handler, config);
}

/**
 * Extract sanitized body from request (added by middleware)
 */
export function getSanitizedBody(request: NextRequest): any {
  return (request as any).sanitizedBody || {};
}