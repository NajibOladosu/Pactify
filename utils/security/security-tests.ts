import { createSecurityValidator, SecurityValidationError } from "./validations";
import { InputSanitizer } from "./sanitization";
import { SECURITY_CONFIG, validateAmount, validateTextLength } from "./config";
import { validateSchema, ContractCreateSchema, KycCreateSchema } from "./validation-schemas";

export class SecurityTestSuite {
  /**
   * Run comprehensive security tests
   */
  static async runAllTests(): Promise<{ passed: number; failed: number; results: any[] }> {
    console.log("🔒 Running Pactify Security Test Suite...\n");
    
    const tests = [
      // Input validation tests
      { name: "Input Sanitization", test: this.testInputSanitization },
      { name: "XSS Prevention", test: this.testXssPrevention },
      { name: "SQL Injection Prevention", test: this.testSqlInjectionPrevention },
      { name: "Schema Validation", test: this.testSchemaValidation },
      
      // Business logic tests
      { name: "Amount Validation", test: this.testAmountValidation },
      { name: "KYC Level Validation", test: this.testKycLevelValidation },
      { name: "File Type Validation", test: this.testFileTypeValidation },
      
      // Security configuration tests
      { name: "Rate Limiting Config", test: this.testRateLimitingConfig },
      { name: "Security Headers", test: this.testSecurityHeaders },
      { name: "Environment Config", test: this.testEnvironmentConfig },
      
      // Data protection tests
      { name: "Data Sanitization", test: this.testDataSanitization },
      { name: "URL Validation", test: this.testUrlValidation },
      { name: "Date Validation", test: this.testDateValidation }
    ];

    const results = [];
    let passed = 0;
    let failed = 0;

    for (const { name, test } of tests) {
      try {
        console.log(`Running: ${name}...`);
        const result = await test();
        if (result.success) {
          console.log(`✅ ${name}: PASSED`);
          passed++;
        } else {
          console.log(`❌ ${name}: FAILED - ${result.error}`);
          failed++;
        }
        results.push({ name, ...result });
      } catch (error) {
        console.log(`❌ ${name}: ERROR - ${error}`);
        failed++;
        results.push({ name, success: false, error: String(error) });
      }
    }

    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
    return { passed, failed, results };
  }

  /**
   * Test input sanitization
   */
  static testInputSanitization(): { success: boolean; error?: string } {
    const testCases = [
      {
        input: "<script>alert('xss')</script>Hello World",
        expected: "Hello World"
      },
      {
        input: "javascript:alert('xss')",
        expected: "alert('xss')"
      },
      {
        input: "SELECT * FROM users; DROP TABLE users;",
        expected: " users; DROP TABLE users;"
      }
    ];

    for (const { input, expected } of testCases) {
      const sanitized = InputSanitizer.sanitizeText(input);
      if (sanitized !== expected) {
        return {
          success: false,
          error: `Expected "${expected}", got "${sanitized}"`
        };
      }
    }

    return { success: true };
  }

  /**
   * Test XSS prevention
   */
  static testXssPrevention(): { success: boolean; error?: string } {
    const maliciousInputs = [
      "<script>alert('xss')</script>",
      "<img src=x onerror=alert('xss')>",
      "<svg onload=alert('xss')>",
      "javascript:alert('xss')",
      "data:text/html,<script>alert('xss')</script>"
    ];

    for (const input of maliciousInputs) {
      const sanitized = InputSanitizer.sanitizeHtml(input);
      if (sanitized.includes('<script') || sanitized.includes('javascript:') || sanitized.includes('onerror')) {
        return {
          success: false,
          error: `XSS payload not properly sanitized: ${input}`
        };
      }
    }

    return { success: true };
  }

  /**
   * Test SQL injection prevention
   */
  static testSqlInjectionPrevention(): { success: boolean; error?: string } {
    const sqlInjectionInputs = [
      "'; DROP TABLE users; --",
      "1' OR '1'='1",
      "UNION SELECT * FROM passwords",
      "1; INSERT INTO admin VALUES('hacker', 'password')"
    ];

    for (const input of sqlInjectionInputs) {
      try {
        const sanitized = InputSanitizer.sanitizeText(input);
        // Check if dangerous SQL keywords are still present
        if (/\b(DROP|INSERT|DELETE|UPDATE|SELECT|UNION)\b/i.test(sanitized)) {
          return {
            success: false,
            error: `SQL injection payload not properly sanitized: ${input}`
          };
        }
      } catch (error) {
        // If it throws an error, that's actually good for dangerous input
        continue;
      }
    }

    return { success: true };
  }

  /**
   * Test schema validation
   */
  static testSchemaValidation(): { success: boolean; error?: string } {
    // Test valid contract data
    const validContract = {
      title: "Test Contract",
      description: "This is a valid contract description",
      total_amount: 1000,
      currency: "USD",
      type: "fixed"
    };

    const validResult = validateSchema(ContractCreateSchema, validContract);
    if (!validResult.success) {
      return {
        success: false,
        error: `Valid contract rejected: ${validResult.errors.join(', ')}`
      };
    }

    // Test invalid contract data
    const invalidContract = {
      title: "", // Empty title should fail
      description: "Short", // Too short description
      total_amount: -100, // Negative amount should fail
      currency: "INVALID", // Invalid currency
      type: "invalid_type" // Invalid type
    };

    const invalidResult = validateSchema(ContractCreateSchema, invalidContract);
    if (invalidResult.success) {
      return {
        success: false,
        error: "Invalid contract was accepted"
      };
    }

    return { success: true };
  }

  /**
   * Test amount validation
   */
  static testAmountValidation(): { success: boolean; error?: string } {
    const testCases = [
      { amount: 1, valid: true },
      { amount: 1000000, valid: true },
      { amount: 0, valid: false },
      { amount: -100, valid: false },
      { amount: Infinity, valid: false },
      { amount: NaN, valid: false }
    ];

    for (const { amount, valid } of testCases) {
      const result = validateAmount(amount);
      if (result !== valid) {
        return {
          success: false,
          error: `Amount ${amount} validation failed. Expected ${valid}, got ${result}`
        };
      }
    }

    return { success: true };
  }

  /**
   * Test KYC level validation
   */
  static testKycLevelValidation(): { success: boolean; error?: string } {
    // Test valid KYC data
    const validKyc = {
      verification_level: "basic",
      documents: [
        {
          type: "email_verification",
          filename: "email_verification.pdf",
          file_url: "https://example.com/file.pdf"
        }
      ]
    };

    const validResult = validateSchema(KycCreateSchema, validKyc);
    if (!validResult.success) {
      return {
        success: false,
        error: `Valid KYC rejected: ${validResult.errors.join(', ')}`
      };
    }

    // Test invalid KYC data
    const invalidKyc = {
      verification_level: "invalid_level",
      documents: [
        {
          type: "invalid_document_type",
          filename: "invalid<>filename",
          file_url: "not_a_url"
        }
      ]
    };

    const invalidResult = validateSchema(KycCreateSchema, invalidKyc);
    if (invalidResult.success) {
      return {
        success: false,
        error: "Invalid KYC was accepted"
      };
    }

    return { success: true };
  }

  /**
   * Test file type validation
   */
  static testFileTypeValidation(): { success: boolean; error?: string } {
    const allowedTypes = SECURITY_CONFIG.ALLOWED_FILE_TYPES.documents;
    
    // Test allowed file
    const allowedFile = "document.pdf";
    const extension = allowedFile.split('.').pop()?.toLowerCase();
    if (!extension || !allowedTypes.includes(extension)) {
      return {
        success: false,
        error: `Allowed file type ${extension} was rejected`
      };
    }

    // Test disallowed file
    const disallowedFile = "malicious.exe";
    const badExtension = disallowedFile.split('.').pop()?.toLowerCase();
    if (badExtension && allowedTypes.includes(badExtension)) {
      return {
        success: false,
        error: `Disallowed file type ${badExtension} was accepted`
      };
    }

    return { success: true };
  }

  /**
   * Test rate limiting configuration
   */
  static testRateLimitingConfig(): { success: boolean; error?: string } {
    const authLimit = SECURITY_CONFIG.RATE_LIMITS.auth;
    const paymentLimit = SECURITY_CONFIG.RATE_LIMITS.payment;
    const defaultLimit = SECURITY_CONFIG.RATE_LIMITS.default;

    // Auth should be more restrictive than default
    if (authLimit.requests >= defaultLimit.requests) {
      return {
        success: false,
        error: "Auth rate limit should be more restrictive than default"
      };
    }

    // Payment should be more restrictive than default
    if (paymentLimit.requests >= defaultLimit.requests) {
      return {
        success: false,
        error: "Payment rate limit should be more restrictive than default"
      };
    }

    return { success: true };
  }

  /**
   * Test security headers configuration
   */
  static testSecurityHeaders(): { success: boolean; error?: string } {
    const headers = SECURITY_CONFIG.SECURITY_HEADERS;
    
    const requiredHeaders = [
      "X-Content-Type-Options",
      "X-Frame-Options", 
      "X-XSS-Protection",
      "Referrer-Policy"
    ];

    for (const header of requiredHeaders) {
      if (!headers[header as keyof typeof headers]) {
        return {
          success: false,
          error: `Missing required security header: ${header}`
        };
      }
    }

    // Check for secure values
    if (headers["X-Frame-Options"] !== "DENY") {
      return {
        success: false,
        error: "X-Frame-Options should be set to DENY"
      };
    }

    return { success: true };
  }

  /**
   * Test environment configuration
   */
  static testEnvironmentConfig(): { success: boolean; error?: string } {
    const envConfig = SECURITY_CONFIG.ENVIRONMENT_OVERRIDES;
    
    // Development should have relaxed limits
    if (envConfig.development.rateLimits?.default.requests <= SECURITY_CONFIG.RATE_LIMITS.default.requests) {
      return {
        success: false,
        error: "Development environment should have relaxed rate limits"
      };
    }

    // Production should have strict validation
    if (!envConfig.production.strictValidation) {
      return {
        success: false,
        error: "Production environment should have strict validation enabled"
      };
    }

    return { success: true };
  }

  /**
   * Test data sanitization
   */
  static testDataSanitization(): { success: boolean; error?: string } {
    const contractData = {
      title: "<script>alert('xss')</script>Valid Title",
      description: "A valid description with some <b>bold</b> text",
      total_amount: "1000",
      currency: "  usd  ",
      client_email: "  USER@EXAMPLE.COM  "
    };

    const sanitized = InputSanitizer.sanitizeContractData(contractData);

    // Title should have script tags removed
    if (sanitized.title.includes('<script')) {
      return {
        success: false,
        error: "Script tags not removed from title"
      };
    }

    // Currency should be uppercase and trimmed
    if (sanitized.currency !== "USD") {
      return {
        success: false,
        error: `Currency not properly normalized. Expected "USD", got "${sanitized.currency}"`
      };
    }

    // Email should be lowercase and trimmed
    if (sanitized.client_email !== "user@example.com") {
      return {
        success: false,
        error: `Email not properly normalized. Expected "user@example.com", got "${sanitized.client_email}"`
      };
    }

    return { success: true };
  }

  /**
   * Test URL validation
   */
  static testUrlValidation(): { success: boolean; error?: string } {
    const validUrls = [
      "https://example.com/file.pdf",
      "http://localhost:3000/api/test"
    ];

    const invalidUrls = [
      "javascript:alert('xss')",
      "data:text/html,<script>alert('xss')</script>",
      "ftp://example.com/file",
      "file:///etc/passwd",
      "not-a-url"
    ];

    for (const url of validUrls) {
      const sanitized = InputSanitizer.sanitizeUrl(url);
      if (!sanitized || sanitized !== url) {
        return {
          success: false,
          error: `Valid URL rejected: ${url}`
        };
      }
    }

    for (const url of invalidUrls) {
      const sanitized = InputSanitizer.sanitizeUrl(url);
      if (sanitized === url) {
        return {
          success: false,
          error: `Invalid URL accepted: ${url}`
        };
      }
    }

    return { success: true };
  }

  /**
   * Test date validation
   */
  static testDateValidation(): { success: boolean; error?: string } {
    const now = new Date();
    
    // Valid future date
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + 30);
    const validDate = InputSanitizer.sanitizeDate(futureDate.toISOString());
    if (!validDate) {
      return {
        success: false,
        error: "Valid future date rejected"
      };
    }

    // Invalid past date (too far in past)
    const veryOldDate = new Date();
    veryOldDate.setFullYear(now.getFullYear() - 200);
    const invalidOldDate = InputSanitizer.sanitizeDate(veryOldDate.toISOString());
    if (invalidOldDate) {
      return {
        success: false,
        error: "Very old date should be rejected"
      };
    }

    // Invalid future date (too far in future)
    const veryFutureDate = new Date();
    veryFutureDate.setFullYear(now.getFullYear() + 50);
    const invalidFutureDate = InputSanitizer.sanitizeDate(veryFutureDate.toISOString());
    if (invalidFutureDate) {
      return {
        success: false,
        error: "Very future date should be rejected"
      };
    }

    return { success: true };
  }

  /**
   * Generate security test report
   */
  static generateTestReport(results: any[]): string {
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const total = results.length;

    let report = `
# Pactify Security Test Report

## Summary
- **Total Tests**: ${total}
- **Passed**: ${passed}
- **Failed**: ${failed}
- **Success Rate**: ${((passed / total) * 100).toFixed(1)}%

## Test Results

`;

    results.forEach(result => {
      const status = result.success ? "✅ PASS" : "❌ FAIL";
      report += `### ${result.name}: ${status}\n`;
      if (!result.success && result.error) {
        report += `**Error**: ${result.error}\n\n`;
      } else {
        report += "\n";
      }
    });

    if (failed > 0) {
      report += `
## Security Recommendations

Please address the failed tests before deploying to production. Each failed test represents a potential security vulnerability.

`;
    } else {
      report += `
## ✅ All Security Tests Passed!

Your application has passed all security tests. However, remember that security is an ongoing process:

1. Regularly update dependencies
2. Monitor for new security vulnerabilities
3. Conduct periodic security audits
4. Implement proper logging and monitoring
5. Keep security configurations up to date

`;
    }

    return report;
  }
}

// Export test runner function
export async function runSecurityTests(): Promise<void> {
  const results = await SecurityTestSuite.runAllTests();
  const report = SecurityTestSuite.generateTestReport(results.results);
  
  console.log("\n" + "=".repeat(50));
  console.log(report);
  
  if (results.failed > 0) {
    process.exit(1); // Exit with error code if tests failed
  }
}