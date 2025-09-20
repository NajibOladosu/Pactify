import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from './rate-limit';
import { withCSRF } from './csrf';
import { withAuth } from '@/utils/api/with-auth';
import { auditLogger } from './audit-logger';
import type { User } from '@supabase/supabase-js';

export interface SecurityConfig {
  requireAuth?: boolean;
  requireCSRF?: boolean;
  rateLimit?: boolean;
  auditLog?: boolean;
  roles?: string[];
}

/**
 * Comprehensive security middleware for API routes
 */
export function withSecurity(
  handler: (request: NextRequest, user?: User) => Promise<NextResponse>,
  config: SecurityConfig = {}
) {
  const {
    requireAuth = true,
    requireCSRF = true,
    rateLimit = true,
    auditLog = true,
    roles = []
  } = config;

  let securedHandler = handler;

  // Apply audit logging
  if (auditLog) {
    securedHandler = withAuditLogging(securedHandler);
  }

  // Apply authentication
  if (requireAuth) {
    securedHandler = withAuth(securedHandler as any) as any;
  }

  // Apply role-based access control
  if (roles.length > 0) {
    securedHandler = withRoleCheck(securedHandler, roles);
  }

  // Apply CSRF protection
  if (requireCSRF) {
    securedHandler = withCSRF(securedHandler as any) as any;
  }

  // Apply rate limiting
  if (rateLimit) {
    securedHandler = withRateLimit(securedHandler as any) as any;
  }

  return securedHandler;
}

/**
 * Audit logging middleware
 */
function withAuditLogging(
  handler: (request: NextRequest, user?: User) => Promise<NextResponse>
) {
  return async (request: NextRequest, user?: User): Promise<NextResponse> => {
    const startTime = Date.now();
    const pathname = request.nextUrl.pathname;
    const method = request.method;

    try {
      // Log request start
      if (user) {
        await auditLogger.logSecurityEvent({
          userId: user.id,
          action: `api_${method.toLowerCase()}_start`,
          resource: pathname,
          details: {
            method,
            pathname,
            userAgent: request.headers.get('user-agent'),
            ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
          },
          success: true,
          severity: 'low'
        });
      }

      const response = await handler(request, user);

      // Log successful request
      const duration = Date.now() - startTime;
      if (user) {
        await auditLogger.logSecurityEvent({
          userId: user.id,
          action: `api_${method.toLowerCase()}_success`,
          resource: pathname,
          details: {
            method,
            pathname,
            statusCode: response.status,
            duration
          },
          success: true,
          severity: 'low'
        });
      }

      return response;

    } catch (error) {
      // Log failed request
      const duration = Date.now() - startTime;
      if (user) {
        await auditLogger.logSecurityEvent({
          userId: user.id,
          action: `api_${method.toLowerCase()}_error`,
          resource: pathname,
          details: {
            method,
            pathname,
            error: error instanceof Error ? error.message : 'Unknown error',
            duration
          },
          success: false,
          severity: 'medium'
        });
      }

      throw error;
    }
  };
}

/**
 * Role-based access control middleware
 */
function withRoleCheck(
  handler: (request: NextRequest, user?: User) => Promise<NextResponse>,
  allowedRoles: string[]
) {
  return async (request: NextRequest, user?: User): Promise<NextResponse> => {
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get user role (this would need to be implemented based on your user role system)
    const userRole = user.user_metadata?.role || 'user';

    if (!allowedRoles.includes(userRole)) {
      await auditLogger.logSecurityEvent({
        userId: user.id,
        action: 'unauthorized_access_attempt',
        resource: request.nextUrl.pathname,
        details: {
          userRole,
          requiredRoles: allowedRoles,
          method: request.method
        },
        success: false,
        severity: 'high'
      });

      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    return handler(request, user);
  };
}

/**
 * Input validation middleware
 */
export function withValidation<T>(
  handler: (request: NextRequest, validatedData: T, user?: User) => Promise<NextResponse>,
  schema: any // Zod schema
) {
  return async (request: NextRequest, user?: User): Promise<NextResponse> => {
    try {
      const body = await request.json();
      const validatedData = schema.parse(body);
      return handler(request, validatedData, user);
    } catch (error: any) {
      if (user) {
        await auditLogger.logSecurityEvent({
          userId: user.id,
          action: 'input_validation_failed',
          resource: request.nextUrl.pathname,
          details: {
            error: error.message,
            method: request.method
          },
          success: false,
          severity: 'medium'
        });
      }

      return NextResponse.json(
        { error: 'Invalid input data', details: error.message },
        { status: 400 }
      );
    }
  };
}

/**
 * Error handling middleware
 */
export function withErrorHandling(
  handler: (request: NextRequest, user?: User) => Promise<NextResponse>
) {
  return async (request: NextRequest, user?: User): Promise<NextResponse> => {
    try {
      return await handler(request, user);
    } catch (error) {
      console.error('API Error:', error);

      if (user) {
        await auditLogger.logSecurityEvent({
          userId: user.id,
          action: 'api_error',
          resource: request.nextUrl.pathname,
          details: {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          },
          success: false,
          severity: 'high'
        });
      }

      // Don't expose internal errors in production
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      return NextResponse.json(
        {
          error: 'Internal server error',
          ...(isDevelopment && { details: error instanceof Error ? error.message : 'Unknown error' })
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Complete security stack for high-security endpoints
 */
export function withFullSecurity(
  handler: (request: NextRequest, user: User) => Promise<NextResponse>,
  config: SecurityConfig = {}
) {
  return withErrorHandling(
    withSecurity(handler, {
      requireAuth: true,
      requireCSRF: true,
      rateLimit: true,
      auditLog: true,
      ...config
    })
  );
}

/**
 * Public endpoint security (no auth required)
 */
export function withPublicSecurity(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return withErrorHandling(
    withSecurity(handler, {
      requireAuth: false,
      requireCSRF: false,
      rateLimit: true,
      auditLog: false
    })
  );
}