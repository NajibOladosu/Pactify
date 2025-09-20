import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export interface CSRFConfig {
  secret: string;
  headerName: string;
  cookieName: string;
  excludePaths: string[];
}

const defaultConfig: CSRFConfig = {
  secret: process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex'),
  headerName: 'X-CSRF-Token',
  cookieName: '__csrf-token',
  excludePaths: ['/api/webhooks/', '/api/health']
};

/**
 * Generate a CSRF token for the current session
 */
export function generateCSRFToken(sessionId: string, config: Partial<CSRFConfig> = {}): string {
  const { secret } = { ...defaultConfig, ...config };
  
  const timestamp = Date.now().toString();
  const random = crypto.randomBytes(16).toString('hex');
  
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${sessionId}:${timestamp}:${random}`);
  
  const signature = hmac.digest('hex');
  return `${timestamp}:${random}:${signature}`;
}

/**
 * Validate a CSRF token against the current session
 */
export function validateCSRFToken(
  token: string, 
  sessionId: string, 
  config: Partial<CSRFConfig> = {}
): boolean {
  try {
    const { secret } = { ...defaultConfig, ...config };
    
    if (!token || !sessionId) return false;
    
    const parts = token.split(':');
    if (parts.length !== 3) return false;
    
    const [timestamp, random, signature] = parts;
    
    // Check if token is not too old (24 hours max)
    const tokenTime = parseInt(timestamp);
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    if (Date.now() - tokenTime > maxAge) return false;
    
    // Validate signature
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${sessionId}:${timestamp}:${random}`);
    const expectedSignature = hmac.digest('hex');
    
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch (error) {
    console.error('CSRF token validation error:', error);
    return false;
  }
}

/**
 * CSRF protection middleware for API routes
 */
export function withCSRF(handler: (request: NextRequest) => Promise<NextResponse>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      const pathname = request.nextUrl.pathname;
      const method = request.method;
      
      // Skip CSRF protection for safe methods and excluded paths
      if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        return handler(request);
      }
      
      if (defaultConfig.excludePaths.some(path => pathname.startsWith(path))) {
        return handler(request);
      }
      
      // Get CSRF token from header
      const csrfToken = request.headers.get(defaultConfig.headerName);
      
      if (!csrfToken) {
        return NextResponse.json(
          { 
            error: 'CSRF_TOKEN_MISSING',
            message: 'CSRF token is required for this operation' 
          },
          { status: 403 }
        );
      }
      
      // Get session ID from auth header or cookie
      const authHeader = request.headers.get('authorization');
      const sessionId = authHeader?.replace('Bearer ', '') || 'anonymous';
      
      if (!validateCSRFToken(csrfToken, sessionId)) {
        return NextResponse.json(
          { 
            error: 'CSRF_TOKEN_INVALID',
            message: 'Invalid CSRF token' 
          },
          { status: 403 }
        );
      }
      
      // Call the original handler
      const response = await handler(request);
      
      // Add new CSRF token to response for next request
      const newToken = generateCSRFToken(sessionId);
      response.headers.set('X-CSRF-Token', newToken);
      
      return response;
      
    } catch (error) {
      console.error('CSRF middleware error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

/**
 * Get CSRF token for client-side use
 */
export function getCSRFToken(sessionId: string): string {
  return generateCSRFToken(sessionId);
}

/**
 * API endpoint to get CSRF token
 */
export async function handleCSRFTokenRequest(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('authorization');
    const sessionId = authHeader?.replace('Bearer ', '') || crypto.randomUUID();
    
    const token = generateCSRFToken(sessionId);
    
    return NextResponse.json({
      csrfToken: token,
      sessionId: sessionId
    });
    
  } catch (error) {
    console.error('CSRF token generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate CSRF token' },
      { status: 500 }
    );
  }
}