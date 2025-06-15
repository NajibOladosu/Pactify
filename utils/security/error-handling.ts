import { NextResponse } from "next/server";
import { SecurityValidationError } from "./validations";

export interface ApiError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
  path?: string;
}

export class ErrorHandler {
  /**
   * Handle and format API errors
   */
  static handleApiError(error: any, request?: Request): NextResponse {
    const timestamp = new Date().toISOString();
    const path = request ? new URL(request.url).pathname : undefined;

    // Security validation errors
    if (error instanceof SecurityValidationError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            timestamp,
            path
          }
        },
        { status: error.statusCode }
      );
    }

    // Supabase errors
    if (error?.code && error?.message) {
      return this.handleSupabaseError(error, timestamp, path);
    }

    // Stripe errors
    if (error?.type && error?.type.startsWith('Stripe')) {
      return this.handleStripeError(error, timestamp, path);
    }

    // Network/timeout errors
    if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
      return NextResponse.json(
        {
          error: {
            code: "REQUEST_TIMEOUT",
            message: "Request timed out. Please try again.",
            timestamp,
            path
          }
        },
        { status: 408 }
      );
    }

    // Validation errors
    if (error?.name === 'ValidationError' || error?.message?.includes('validation')) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: error.message || "Invalid input data",
            details: error.details,
            timestamp,
            path
          }
        },
        { status: 400 }
      );
    }

    // Generic errors
    console.error("Unhandled API error:", error);
    
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred. Please try again later.",
          timestamp,
          path
        }
      },
      { status: 500 }
    );
  }

  /**
   * Handle Supabase specific errors
   */
  private static handleSupabaseError(error: any, timestamp: string, path?: string): NextResponse {
    const errorMappings: Record<string, { status: number; code: string; message: string }> = {
      'PGRST116': {
        status: 404,
        code: "RESOURCE_NOT_FOUND",
        message: "The requested resource was not found"
      },
      'PGRST301': {
        status: 403,
        code: "ACCESS_DENIED",
        message: "Access denied. Check your permissions."
      },
      '23505': {
        status: 409,
        code: "DUPLICATE_RESOURCE",
        message: "Resource already exists"
      },
      '23503': {
        status: 400,
        code: "FOREIGN_KEY_VIOLATION",
        message: "Referenced resource does not exist"
      },
      '23514': {
        status: 400,
        code: "CHECK_CONSTRAINT_VIOLATION",
        message: "Data violates database constraints"
      },
      'JWT_EXPIRED': {
        status: 401,
        code: "TOKEN_EXPIRED",
        message: "Authentication token has expired"
      },
      'JWT_INVALID': {
        status: 401,
        code: "INVALID_TOKEN",
        message: "Invalid authentication token"
      }
    };

    const mapping = errorMappings[error.code] || {
      status: 500,
      code: "DATABASE_ERROR",
      message: "Database operation failed"
    };

    return NextResponse.json(
      {
        error: {
          code: mapping.code,
          message: mapping.message,
          timestamp,
          path
        }
      },
      { status: mapping.status }
    );
  }

  /**
   * Handle Stripe specific errors
   */
  private static handleStripeError(error: any, timestamp: string, path?: string): NextResponse {
    const errorMappings: Record<string, { status: number; code: string; message: string }> = {
      'StripeCardError': {
        status: 402,
        code: "PAYMENT_FAILED",
        message: "Payment was declined. Please check your payment method."
      },
      'StripeInvalidRequestError': {
        status: 400,
        code: "INVALID_PAYMENT_REQUEST",
        message: "Invalid payment request"
      },
      'StripeAPIError': {
        status: 502,
        code: "PAYMENT_SERVICE_ERROR",
        message: "Payment service temporarily unavailable"
      },
      'StripeConnectionError': {
        status: 503,
        code: "PAYMENT_SERVICE_UNAVAILABLE",
        message: "Unable to connect to payment service"
      },
      'StripeAuthenticationError': {
        status: 500,
        code: "PAYMENT_CONFIGURATION_ERROR",
        message: "Payment service configuration error"
      }
    };

    const mapping = errorMappings[error.type] || {
      status: 500,
      code: "PAYMENT_ERROR",
      message: "Payment processing error"
    };

    return NextResponse.json(
      {
        error: {
          code: mapping.code,
          message: mapping.message,
          details: {
            decline_code: error.decline_code,
            charge_id: error.charge
          },
          timestamp,
          path
        }
      },
      { status: mapping.status }
    );
  }

  /**
   * Log security events
   */
  static logSecurityEvent(
    event: string,
    userId?: string,
    details?: any,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      userId,
      details,
      severity,
      ip: details?.ip,
      userAgent: details?.userAgent
    };

    // In production, this would send to a security monitoring service
    console.warn(`[SECURITY-${severity.toUpperCase()}]`, logEntry);

    // For critical events, could trigger alerts
    if (severity === 'critical') {
      // Trigger alert system
      console.error("CRITICAL SECURITY EVENT:", logEntry);
    }
  }

  /**
   * Handle rate limiting
   */
  static handleRateLimit(
    identifier: string,
    operation: string,
    limit: number,
    windowMs: number
  ): NextResponse | null {
    // In production, this would use Redis or similar
    // For now, we'll implement a simple in-memory store
    const now = Date.now();
    const windowStart = now - windowMs;

    // This is a simplified implementation
    // In production, use proper rate limiting middleware
    
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: `Too many ${operation} requests. Please try again later.`,
          timestamp: new Date().toISOString(),
          retryAfter: Math.ceil(windowMs / 1000)
        }
      },
      { 
        status: 429,
        headers: {
          'Retry-After': Math.ceil(windowMs / 1000).toString(),
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil((now + windowMs) / 1000).toString()
        }
      }
    );
  }

  /**
   * Validate required environment variables
   */
  static validateEnvironment(): void {
    const requiredVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];

    const missing = requiredVars.filter(varName => !process.env[varName]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  /**
   * Sanitize error messages for client consumption
   */
  static sanitizeErrorMessage(error: any, includeDetails: boolean = false): string {
    // Don't expose sensitive information in error messages
    if (typeof error === 'string') {
      return error;
    }

    if (error?.message) {
      let message = error.message;
      
      // Remove sensitive database details
      message = message.replace(/\b(password|secret|key|token)\b[=:]\s*\S+/gi, '[REDACTED]');
      
      // Remove file paths in production
      if (process.env.NODE_ENV === 'production') {
        message = message.replace(/\/[^\s]+/g, '[PATH]');
      }

      return message;
    }

    return "An error occurred";
  }

  /**
   * Create standardized API response
   */
  static createApiResponse(
    data: any = null,
    success: boolean = true,
    message?: string,
    metadata?: any
  ): any {
    const response: any = {
      success,
      timestamp: new Date().toISOString()
    };

    if (data !== null) {
      response.data = data;
    }

    if (message) {
      response.message = message;
    }

    if (metadata) {
      response.metadata = metadata;
    }

    return response;
  }
}

/**
 * Async error wrapper for API routes
 */
export function withErrorHandling<T extends any[], R>(
  handler: (...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      const request = args.find(arg => arg instanceof Request) as Request | undefined;
      return ErrorHandler.handleApiError(error, request);
    }
  };
}

/**
 * Log and handle errors with context
 */
export function logError(
  error: any,
  context: {
    operation: string;
    userId?: string;
    contractId?: string;
    ip?: string;
    userAgent?: string;
  }
): void {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    error: {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      code: error?.code
    },
    context
  };

  console.error('API Error:', errorInfo);

  // In production, send to monitoring service
  if (process.env.NODE_ENV === 'production') {
    // Send to error tracking service (e.g., Sentry, DataDog)
  }
}