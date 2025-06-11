export const SECURITY_CONFIG = {
  // Rate limiting configuration
  RATE_LIMITS: {
    // General API endpoints
    default: {
      requests: 100,
      windowMs: 15 * 60 * 1000 // 15 minutes
    },
    // Authentication endpoints
    auth: {
      requests: 5,
      windowMs: 15 * 60 * 1000 // 15 minutes
    },
    // Payment endpoints
    payment: {
      requests: 10,
      windowMs: 60 * 1000 // 1 minute
    },
    // KYC endpoints
    kyc: {
      requests: 5,
      windowMs: 60 * 1000 // 1 minute
    },
    // Contract creation
    contractCreation: {
      requests: 20,
      windowMs: 60 * 60 * 1000 // 1 hour
    },
    // File uploads
    fileUpload: {
      requests: 50,
      windowMs: 60 * 60 * 1000 // 1 hour
    }
  },

  // Input validation limits
  INPUT_LIMITS: {
    // Text field limits
    shortText: 255,
    mediumText: 2000,
    longText: 10000,
    description: 5000,
    
    // File upload limits
    maxFileSize: 50 * 1024 * 1024, // 50MB
    maxRequestSize: 10 * 1024 * 1024, // 10MB for regular requests
    
    // Array limits
    maxArrayLength: 100,
    maxStringArrayLength: 50,
    
    // Numeric limits
    minAmount: 0.01,
    maxAmount: 1000000,
    maxContractAmount: 10000000,
    
    // Date limits
    maxFutureDays: 365 * 2, // 2 years
    maxPastDays: 365 * 1, // 1 year
  },

  // KYC verification levels
  KYC_LEVELS: {
    basic: {
      name: "Basic Verification",
      maxAmount: 500,
      requiredDocuments: ["email_verification", "phone_verification"],
      estimatedTime: "Instant",
      stripeRequired: false
    },
    enhanced: {
      name: "Enhanced Verification",
      maxAmount: 5000,
      requiredDocuments: ["government_id", "address_proof", "selfie_verification"],
      estimatedTime: "1-2 business days",
      stripeRequired: true
    },
    business: {
      name: "Business Verification",
      maxAmount: null, // No limit
      requiredDocuments: ["business_registration", "tax_id", "business_bank_account", "beneficial_ownership"],
      estimatedTime: "3-5 business days",
      stripeRequired: true
    }
  },

  // Security event severities
  SECURITY_SEVERITIES: {
    low: {
      description: "Normal operations, informational events",
      alertRequired: false,
      logRetention: 90 // days
    },
    medium: {
      description: "Potentially suspicious activity, authentication events",
      alertRequired: false,
      logRetention: 180 // days
    },
    high: {
      description: "Security violations, admin actions",
      alertRequired: true,
      logRetention: 365 // days
    },
    critical: {
      description: "Immediate security threats, system compromise",
      alertRequired: true,
      logRetention: 2555 // 7 years
    }
  },

  // Allowed file types for uploads
  ALLOWED_FILE_TYPES: {
    documents: ["pdf", "doc", "docx", "txt"],
    images: ["jpg", "jpeg", "png", "gif", "webp"],
    kyc: ["pdf", "jpg", "jpeg", "png"],
    submissions: ["pdf", "doc", "docx", "txt", "zip", "jpg", "jpeg", "png", "gif"]
  },

  // Content Security Policy
  CSP_DIRECTIVES: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    fontSrc: ["'self'", "data:"],
    connectSrc: ["'self'", "https:"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"]
  },

  // Security headers
  SECURITY_HEADERS: {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()"
  },

  // Suspicious activity patterns
  SUSPICIOUS_PATTERNS: {
    pathTraversal: /\.\./,
    xssAttempt: /<script/i,
    sqlInjection: /union.*select/i,
    codeInjection: /exec\s*\(/i,
    jsInjection: /javascript:/i,
    dataUriXss: /data:text\/html/i,
    commandInjection: /[;&|`$]/,
    ldapInjection: /[()&|!>=<]/
  },

  // Password requirements
  PASSWORD_REQUIREMENTS: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: "!@#$%^&*()_+-=[]{}|;:,.<>?",
    maxRepeatingChars: 3,
    preventCommonPasswords: true
  },

  // Session management
  SESSION_CONFIG: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    renewThreshold: 60 * 60 * 1000, // 1 hour
    maxConcurrentSessions: 5,
    requireReauthForSensitive: true,
    reauthTimeout: 30 * 60 * 1000 // 30 minutes
  },

  // API versioning and deprecation
  API_CONFIG: {
    currentVersion: "v1",
    supportedVersions: ["v1"],
    deprecationWarningDays: 90,
    maxRequestsPerVersion: {
      v1: 1000
    }
  },

  // Environment-specific settings
  ENVIRONMENT_OVERRIDES: {
    development: {
      rateLimits: {
        default: { requests: 1000, windowMs: 60 * 1000 }
      },
      logLevel: "debug",
      strictValidation: false
    },
    production: {
      logLevel: "warn",
      strictValidation: true,
      enableHSTS: true,
      requireHTTPS: true
    },
    staging: {
      logLevel: "info",
      strictValidation: true
    }
  }
} as const;

// Helper functions
export function getRateLimitConfig(endpoint: string) {
  const category = categorizeEndpoint(endpoint);
  return SECURITY_CONFIG.RATE_LIMITS[category] || SECURITY_CONFIG.RATE_LIMITS.default;
}

export function getKycRequiredLevel(amount: number, currency: string = "USD"): keyof typeof SECURITY_CONFIG.KYC_LEVELS {
  // Convert to USD for standardized comparison
  const usdAmount = currency === "USD" ? amount : amount; // In real implementation, would convert currencies
  
  if (usdAmount <= SECURITY_CONFIG.KYC_LEVELS.basic.maxAmount) return "basic";
  if (usdAmount <= SECURITY_CONFIG.KYC_LEVELS.enhanced.maxAmount) return "enhanced";
  return "business";
}

export function getAllowedFileTypes(category: keyof typeof SECURITY_CONFIG.ALLOWED_FILE_TYPES): string[] {
  return SECURITY_CONFIG.ALLOWED_FILE_TYPES[category] || [];
}

export function getEnvironmentConfig() {
  const env = process.env.NODE_ENV as keyof typeof SECURITY_CONFIG.ENVIRONMENT_OVERRIDES;
  return SECURITY_CONFIG.ENVIRONMENT_OVERRIDES[env] || {};
}

export function isFileTypeAllowed(filename: string, category: keyof typeof SECURITY_CONFIG.ALLOWED_FILE_TYPES): boolean {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!extension) return false;
  
  const allowedTypes = getAllowedFileTypes(category);
  return allowedTypes.includes(extension);
}

export function buildCSP(): string {
  const directives = Object.entries(SECURITY_CONFIG.CSP_DIRECTIVES)
    .map(([key, values]) => {
      const directive = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      const valueString = Array.isArray(values) ? values.join(' ') : values;
      return `${directive} ${valueString}`;
    })
    .join('; ');
  
  return directives;
}

export function validateAmount(amount: number, category: 'general' | 'contract' = 'general'): boolean {
  const min = SECURITY_CONFIG.INPUT_LIMITS.minAmount;
  const max = category === 'contract' 
    ? SECURITY_CONFIG.INPUT_LIMITS.maxContractAmount 
    : SECURITY_CONFIG.INPUT_LIMITS.maxAmount;
  
  return amount >= min && amount <= max && isFinite(amount);
}

export function validateTextLength(text: string, category: keyof typeof SECURITY_CONFIG.INPUT_LIMITS): boolean {
  const limit = SECURITY_CONFIG.INPUT_LIMITS[category];
  return typeof limit === 'number' && text.length <= limit;
}

function categorizeEndpoint(endpoint: string): keyof typeof SECURITY_CONFIG.RATE_LIMITS {
  if (endpoint.includes('/auth/') || endpoint.includes('/sign-in') || endpoint.includes('/sign-up')) {
    return 'auth';
  }
  if (endpoint.includes('/payment') || endpoint.includes('/fund') || endpoint.includes('/release-payment')) {
    return 'payment';
  }
  if (endpoint.includes('/kyc')) {
    return 'kyc';
  }
  if (endpoint.includes('/contracts') && endpoint.includes('POST')) {
    return 'contractCreation';
  }
  if (endpoint.includes('/upload') || endpoint.includes('/documents')) {
    return 'fileUpload';
  }
  return 'default';
}