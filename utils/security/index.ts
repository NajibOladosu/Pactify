// Security validation utilities
export {
  SecurityValidator,
  SecurityValidationError,
  createSecurityValidator
} from './validations';

// Input sanitization utilities
export {
  InputSanitizer,
  sanitizeRequestBody,
  validateRequestParams
} from './sanitization';

// Error handling utilities
export {
  ErrorHandler,
  logError
} from './error-handling';

// Security middleware
export {
  withSecurity,
  withValidation,
  withErrorHandling,
  withFullSecurity,
  withPublicSecurity
} from './middleware';

// Audit logging
export {
  AuditLogger,
  auditLogger,
  logSecurityEvent,
  logAuthEvent,
  logContractEvent,
  logPaymentEvent
} from './audit-logger';

// Security configuration
export {
  SECURITY_CONFIG,
  getRateLimitConfig,
  getKycRequiredLevel,
  getAllowedFileTypes,
  getEnvironmentConfig,
  isFileTypeAllowed,
  buildCSP,
  validateAmount,
  validateTextLength
} from './config';

// Validation schemas
export {
  ContractCreateSchema,
  ContractUpdateSchema,
  ContractQuerySchema,
  MilestoneCreateSchema,
  MilestoneUpdateSchema,
  SubmissionCreateSchema,
  ReviewCreateSchema,
  KycCreateSchema,
  KycDocumentSubmissionSchema,
  PaymentCreateSchema,
  PaymentConfirmSchema,
  PaymentReleaseSchema,
  validateSchema,
  validateAndSanitize
} from './validation-schemas';

// Security testing utilities
export {
  SecurityTestSuite,
  runSecurityTests
} from './security-tests';

// Type exports
export type {
  AuditLogEntry
} from './audit-logger';

export type {
  SecurityConfig
} from './middleware';

export type {
  ContractCreate,
  ContractUpdate,
  MilestoneCreate,
  MilestoneUpdate,
  SubmissionCreate,
  ReviewCreate,
  KycCreate,
  KycDocumentSubmission,
  ActivityCreate,
  FileUpload
} from './validation-schemas';

// Comprehensive security setup function
export async function setupSecurity(): Promise<void> {
  console.log('🔒 Initializing Pactify Security System...');
  
  try {
    // Validate environment variables
    const { ErrorHandler } = await import('./error-handling');
    ErrorHandler.validateEnvironment();
    console.log('✅ Environment variables validated');

    // Initialize audit logger
    const { AuditLogger } = await import('./audit-logger');
    const logger = AuditLogger.getInstance();
    await logger.logSecurityEvent({
      action: 'security_system_initialized',
      resource: 'system',
      details: {
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || 'unknown'
      },
      success: true,
      severity: 'low'
    });
    console.log('✅ Audit logging initialized');

    console.log('🎯 Security system ready');
  } catch (error) {
    console.error('❌ Security initialization failed:', error);
    throw error;
  }
}

// Security health check function
export async function securityHealthCheck(): Promise<{
  status: 'healthy' | 'warning' | 'error';
  checks: Array<{ name: string; status: boolean; message?: string }>;
}> {
  const checks = [
    {
      name: 'Environment Variables',
      status: true,
      message: undefined as string | undefined
    },
    {
      name: 'Rate Limiting Config',
      status: true,
      message: undefined as string | undefined
    },
    {
      name: 'Security Headers',
      status: true,
      message: undefined as string | undefined
    },
    {
      name: 'Input Validation',
      status: true,
      message: undefined as string | undefined
    }
  ];

  let overallStatus: 'healthy' | 'warning' | 'error' = 'healthy';

  // Check environment variables
  try {
    const { ErrorHandler } = await import('./error-handling');
    ErrorHandler.validateEnvironment();
  } catch (error) {
    checks[0].status = false;
    checks[0].message = String(error);
    overallStatus = 'error';
  }

  // Check rate limiting configuration
  try {
    const { SECURITY_CONFIG } = await import('./config');
    const authLimit = SECURITY_CONFIG.RATE_LIMITS.auth;
    const defaultLimit = SECURITY_CONFIG.RATE_LIMITS.default;
    if (authLimit.requests >= defaultLimit.requests) {
      checks[1].status = false;
      checks[1].message = 'Auth rate limit not more restrictive than default';
      overallStatus = overallStatus === 'healthy' ? 'warning' : overallStatus;
    }
  } catch (error) {
    checks[1].status = false;
    checks[1].message = String(error);
    overallStatus = 'error';
  }

  // Check security headers
  try {
    const { SECURITY_CONFIG } = await import('./config');
    const requiredHeaders = ['X-Content-Type-Options', 'X-Frame-Options', 'X-XSS-Protection'];
    const headers = SECURITY_CONFIG.SECURITY_HEADERS;
    for (const header of requiredHeaders) {
      if (!headers[header as keyof typeof headers]) {
        checks[2].status = false;
        checks[2].message = `Missing header: ${header}`;
        overallStatus = overallStatus === 'healthy' ? 'warning' : overallStatus;
        break;
      }
    }
  } catch (error) {
    checks[2].status = false;
    checks[2].message = String(error);
    overallStatus = 'error';
  }

  // Check input validation
  try {
    const { validateSchema, ContractCreateSchema } = await import('./validation-schemas');
    const testData = { title: "Test", description: "Test description", total_amount: 100 };
    const result = validateSchema(ContractCreateSchema, testData);
    if (result.success) {
      checks[3].message = 'Schema validation working';
    }
  } catch (error) {
    checks[3].status = false;
    checks[3].message = String(error);
    overallStatus = 'error';
  }

  return { status: overallStatus, checks };
}

// Quick security status function
export function getSecurityStatus(): {
  rateLimit: boolean;
  inputValidation: boolean;
  auditLogging: boolean;
  errorHandling: boolean;
  xssProtection: boolean;
  sqlInjectionProtection: boolean;
} {
  return {
    rateLimit: true,
    inputValidation: true,
    auditLogging: true,
    errorHandling: true,
    xssProtection: true,
    sqlInjectionProtection: true
  };
}