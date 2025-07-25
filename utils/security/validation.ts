import { z } from 'zod';

/**
 * Validates request body against a Zod schema
 * @param schema - Zod schema to validate against
 * @param body - Request body to validate
 * @returns Validated and typed data
 */
export function validateRequestBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown
): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ');
      
      throw new Error(`Validation failed: ${errorMessages}`);
    }
    throw error;
  }
}

/**
 * Validates query parameters against a Zod schema
 * @param schema - Zod schema to validate against
 * @param params - Query parameters to validate
 * @returns Validated and typed data
 */
export function validateQueryParams<T>(
  schema: z.ZodSchema<T>,
  params: unknown
): T {
  try {
    return schema.parse(params);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ');
      
      throw new Error(`Query validation failed: ${errorMessages}`);
    }
    throw error;
  }
}

/**
 * Validates environment variables
 * @param varName - Name of the environment variable
 * @param value - Value to validate
 * @returns The validated value
 */
export function validateEnvVar(varName: string, value?: string): string {
  if (!value) {
    throw new Error(`Environment variable ${varName} is required`);
  }
  return value;
}

/**
 * Validates UUID format
 * @param uuid - UUID string to validate
 * @returns True if valid UUID
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validates email format
 * @param email - Email string to validate
 * @returns True if valid email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates amount format and range
 * @param amount - Amount to validate
 * @param min - Minimum allowed amount
 * @param max - Maximum allowed amount
 * @returns True if valid amount
 */
export function isValidAmount(amount: number, min: number = 0, max: number = 1000000): boolean {
  return !isNaN(amount) && amount >= min && amount <= max && Number.isFinite(amount);
}

/**
 * Sanitizes text input to prevent XSS
 * @param text - Text to sanitize
 * @returns Sanitized text
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Remove HTML tags and attributes
  let cleanText = text.replace(/<[^>]*>/g, '');
  
  // Remove potentially dangerous characters
  cleanText = cleanText
    .replace(/[<>'"&]/g, (char) => {
      const entities: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      };
      return entities[char] || char;
    })
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/on\w+=/gi, '');
  
  // Trim whitespace
  return cleanText.trim();
}

/**
 * Sanitizes HTML content for rich text editors
 * @param html - HTML to sanitize
 * @returns Sanitized HTML
 */
export function sanitizeHTML(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }
  
  // Allow only safe HTML tags and attributes
  const allowedTags = ['p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  const allowedAttributes = ['class', 'style'];
  
  // Remove script tags and event handlers
  let cleanHTML = html
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '');
  
  // This is a basic implementation - in production, use DOMPurify
  return cleanHTML;
}

/**
 * Validates file type and size
 * @param file - File object to validate
 * @param allowedTypes - Array of allowed file extensions
 * @param maxSizeBytes - Maximum file size in bytes
 * @returns True if valid file
 */
export function isValidFile(
  file: { name: string; size: number }, 
  allowedTypes: string[] = [],
  maxSizeBytes: number = 10 * 1024 * 1024 // 10MB default
): boolean {
  if (!file || !file.name) {
    return false;
  }
  
  // Check file size
  if (file.size > maxSizeBytes) {
    return false;
  }
  
  // Check file extension
  if (allowedTypes.length > 0) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !allowedTypes.includes(extension)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Rate limiting validator
 * @param key - Unique key for the rate limit
 * @param limit - Maximum number of requests
 * @param windowMs - Time window in milliseconds
 * @returns True if under rate limit
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  // This would typically use Redis or similar for distributed rate limiting
  // For now, we'll use a simple in-memory implementation
  const now = Date.now();
  const requests = rateLimitStore.get(key) || [];
  
  // Clean old requests
  const validRequests = requests.filter((time: number) => now - time < windowMs);
  
  // Check if under limit
  if (validRequests.length >= limit) {
    return false;
  }
  
  // Add current request
  validRequests.push(now);
  rateLimitStore.set(key, validRequests);
  
  return true;
}

// Simple in-memory rate limit store (should be replaced with Redis in production)
const rateLimitStore = new Map<string, number[]>();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [key, requests] of Array.from(rateLimitStore.entries())) {
    const validRequests = requests.filter((time: number) => now - time < oneHour);
    if (validRequests.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, validRequests);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes