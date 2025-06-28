import DOMPurify from 'isomorphic-dompurify';

export class InputSanitizer {
  /**
   * Sanitize HTML content to prevent XSS attacks
   */
  static sanitizeHtml(html: string): string {
    if (!html) return '';
    
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li', 
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'
      ],
      ALLOWED_ATTR: ['class'],
      FORBID_TAGS: ['script', 'object', 'embed', 'link', 'style', 'iframe'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style']
    });
  }

  /**
   * Sanitize plain text input
   */
  static sanitizeText(text: string, maxLength: number = 10000): string {
    if (!text) return '';
    
    // Remove HTML tags
    let cleaned = text.replace(/<[^>]*>/g, '');
    
    // Remove potential script injections
    cleaned = cleaned.replace(/javascript:/gi, '');
    cleaned = cleaned.replace(/data:/gi, '');
    cleaned = cleaned.replace(/vbscript:/gi, '');
    
    // Trim and limit length
    cleaned = cleaned.trim().substring(0, maxLength);
    
    return cleaned;
  }

  /**
   * Sanitize email input
   */
  static sanitizeEmail(email: string): string {
    if (!email) return '';
    
    // Remove whitespace and convert to lowercase
    let cleaned = email.trim().toLowerCase();
    
    // Remove potentially dangerous characters
    cleaned = cleaned.replace(/[<>'"]/g, '');
    
    return cleaned;
  }

  /**
   * Sanitize URL input
   */
  static sanitizeUrl(url: string): string {
    if (!url) return '';
    
    // Only allow http, https, and data URLs
    const allowedProtocols = ['http:', 'https:', 'data:'];
    
    try {
      const parsedUrl = new URL(url);
      if (!allowedProtocols.includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
      return parsedUrl.toString();
    } catch {
      return '';
    }
  }

  /**
   * Sanitize filename
   */
  static sanitizeFilename(filename: string): string {
    if (!filename) return '';
    
    // Remove path traversal attempts
    let cleaned = filename.replace(/\.\./g, '');
    cleaned = cleaned.replace(/[\/\\]/g, '');
    
    // Remove potentially dangerous characters
    cleaned = cleaned.replace(/[<>:"|?*]/g, '');
    
    // Limit length
    cleaned = cleaned.substring(0, 255);
    
    return cleaned;
  }

  /**
   * Sanitize JSON input
   */
  static sanitizeJson(jsonString: string): any {
    if (!jsonString) return null;
    
    try {
      const parsed = JSON.parse(jsonString);
      
      // Recursively sanitize string values
      return this.sanitizeJsonObject(parsed);
    } catch {
      return null;
    }
  }

  /**
   * Sanitize numeric input
   */
  static sanitizeNumber(value: any, min?: number, max?: number): number | null {
    const num = parseFloat(value);
    
    if (isNaN(num) || !isFinite(num)) {
      return null;
    }
    
    if (min !== undefined && num < min) {
      return min;
    }
    
    if (max !== undefined && num > max) {
      return max;
    }
    
    return num;
  }

  /**
   * Sanitize array of strings
   */
  static sanitizeStringArray(arr: any[], maxLength: number = 100): string[] {
    if (!Array.isArray(arr)) return [];
    
    return arr
      .filter(item => typeof item === 'string')
      .map(item => this.sanitizeText(item))
      .filter(item => item.length > 0)
      .slice(0, maxLength);
  }

  /**
   * Validate and sanitize contract data
   */
  static sanitizeContractData(data: any): any {
    if (!data || typeof data !== 'object') return {};
    
    return {
      title: this.sanitizeText(data.title, 255),
      description: this.sanitizeText(data.description, 5000),
      terms_and_conditions: this.sanitizeHtml(data.terms_and_conditions),
      client_email: data.client_email ? this.sanitizeEmail(data.client_email) : null,
      total_amount: this.sanitizeNumber(data.total_amount, 0.01, 1000000),
      currency: this.sanitizeText(data.currency, 3),
      start_date: this.sanitizeDate(data.start_date),
      end_date: this.sanitizeDate(data.end_date),
      deliverables: Array.isArray(data.deliverables) 
        ? this.sanitizeStringArray(data.deliverables, 50)
        : []
    };
  }

  /**
   * Validate and sanitize milestone data
   */
  static sanitizeMilestoneData(data: any): any {
    if (!data || typeof data !== 'object') return {};
    
    return {
      title: this.sanitizeText(data.title, 255),
      description: this.sanitizeText(data.description, 2000),
      amount: this.sanitizeNumber(data.amount, 0.01, 1000000),
      due_date: this.sanitizeDate(data.due_date),
      deliverables: Array.isArray(data.deliverables) 
        ? this.sanitizeStringArray(data.deliverables, 20)
        : []
    };
  }

  /**
   * Validate and sanitize submission data
   */
  static sanitizeSubmissionData(data: any): any {
    if (!data || typeof data !== 'object') return {};
    
    return {
      submission_url: data.submission_url ? this.sanitizeUrl(data.submission_url) : null,
      notes: this.sanitizeText(data.notes, 2000),
      deliverables: Array.isArray(data.deliverables) 
        ? this.sanitizeStringArray(data.deliverables, 20)
        : []
    };
  }

  /**
   * Validate and sanitize feedback data
   */
  static sanitizeFeedbackData(data: any): any {
    if (!data || typeof data !== 'object') return {};
    
    return {
      feedback: this.sanitizeText(data.feedback, 2000),
      revision_notes: this.sanitizeText(data.revision_notes, 2000),
      rating: this.sanitizeNumber(data.rating, 1, 5)
    };
  }

  /**
   * Sanitize date input
   */
  static sanitizeDate(dateInput: any): string | null {
    if (!dateInput) return null;
    
    try {
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) return null;
      
      // Only allow dates within reasonable range (past 100 years to future 10 years)
      const now = new Date();
      const minDate = new Date(now.getFullYear() - 100, 0, 1);
      const maxDate = new Date(now.getFullYear() + 10, 11, 31);
      
      if (date < minDate || date > maxDate) return null;
      
      return date.toISOString();
    } catch {
      return null;
    }
  }

  /**
   * Recursively sanitize object properties
   */
  static sanitizeJsonObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (typeof obj === 'string') {
      return this.sanitizeText(obj);
    }
    
    if (typeof obj === 'number') {
      return isFinite(obj) ? obj : null;
    }
    
    if (typeof obj === 'boolean') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeJsonObject(item));
    }
    
    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = this.sanitizeText(key, 100);
        if (sanitizedKey) {
          sanitized[sanitizedKey] = this.sanitizeJsonObject(value);
        }
      }
      return sanitized;
    }
    
    return null;
  }
}

/**
 * Middleware function to sanitize request body
 */
export function sanitizeRequestBody(body: any, type: 'contract' | 'milestone' | 'submission' | 'feedback' | 'general' = 'general'): any {
  if (!body) return {};
  
  switch (type) {
    case 'contract':
      return InputSanitizer.sanitizeContractData(body);
    case 'milestone':
      return InputSanitizer.sanitizeMilestoneData(body);
    case 'submission':
      return InputSanitizer.sanitizeSubmissionData(body);
    case 'feedback':
      return InputSanitizer.sanitizeFeedbackData(body);
    default:
      return InputSanitizer.sanitizeJsonObject(body);
  }
}

/**
 * Validate request parameters
 */
export function validateRequestParams(params: any): { [key: string]: string } {
  const validated: { [key: string]: string } = {};
  
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      const sanitizedKey = InputSanitizer.sanitizeText(key, 50);
      const sanitizedValue = InputSanitizer.sanitizeText(value as string, 255);
      
      if (sanitizedKey && sanitizedValue) {
        validated[sanitizedKey] = sanitizedValue;
      }
    }
  }
  
  return validated;
}