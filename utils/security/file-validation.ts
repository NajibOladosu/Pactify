import crypto from 'crypto';

export interface FileValidationConfig {
  maxSize: number;
  allowedTypes: string[];
  scanForMalware?: boolean;
  allowExecutables?: boolean;
}

// File type signatures (magic numbers)
export const FILE_SIGNATURES: Record<string, number[]> = {
  // Images
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  'image/gif': [0x47, 0x49, 0x46, 0x38],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // Note: WEBP needs additional validation
  
  // Documents
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'application/msword': [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [0x50, 0x4B, 0x03, 0x04],
  'application/vnd.ms-excel': [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [0x50, 0x4B, 0x03, 0x04],
  
  // Text
  'text/plain': [], // No magic number for plain text
  'text/csv': [],   // No magic number for CSV
};

// Safe file types that are allowed
export const SAFE_FILE_TYPES = [
  'image/jpeg',
  'image/png', 
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv'
];

// Dangerous file extensions to always block
export const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
  '.msi', '.dll', '.app', '.deb', '.rpm', '.dmg', '.pkg', '.iso',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.psm1'
];

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
  fileInfo: {
    name: string;
    size: number;
    type: string;
    hash: string;
  };
}

/**
 * Validate file content using magic numbers
 */
export function validateFileSignature(buffer: ArrayBuffer, expectedType: string): boolean {
  const signature = FILE_SIGNATURES[expectedType];
  
  // If no signature defined (like text files), allow it
  if (!signature || signature.length === 0) {
    return true;
  }
  
  const bytes = new Uint8Array(buffer.slice(0, signature.length));
  
  // Special case for WEBP - needs additional validation
  if (expectedType === 'image/webp') {
    const riffSignature = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
    const webpSignature = [0x57, 0x45, 0x42, 0x50]; // "WEBP" at offset 8
    
    if (bytes.length < 12) return false;
    
    const riffMatch = riffSignature.every((byte, i) => bytes[i] === byte);
    const webpBytes = new Uint8Array(buffer.slice(8, 12));
    const webpMatch = webpSignature.every((byte, i) => webpBytes[i] === byte);
    
    return riffMatch && webpMatch;
  }
  
  return signature.every((byte, i) => bytes[i] === byte);
}

/**
 * Check if filename has dangerous extension
 */
export function hasDangerousExtension(filename: string): boolean {
  const lowerName = filename.toLowerCase();
  return DANGEROUS_EXTENSIONS.some(ext => lowerName.endsWith(ext));
}

/**
 * Sanitize filename for safe storage
 */
export function sanitizeFilename(filename: string): string {
  // Remove directory traversal attempts
  let sanitized = filename.replace(/[\/\\]/g, '');
  
  // Remove dangerous characters
  sanitized = sanitized.replace(/[<>:"|?*\x00-\x1f]/g, '_');
  
  // Limit length
  if (sanitized.length > 255) {
    const extension = sanitized.split('.').pop() || '';
    const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf('.'));
    sanitized = nameWithoutExt.substring(0, 255 - extension.length - 1) + '.' + extension;
  }
  
  // Ensure it's not empty
  if (!sanitized || sanitized === '.') {
    sanitized = 'unnamed_file';
  }
  
  return sanitized;
}

/**
 * Calculate file hash for deduplication and integrity
 */
export async function calculateFileHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Comprehensive file validation
 */
export async function validateFile(
  file: File, 
  config: FileValidationConfig = {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: SAFE_FILE_TYPES
  }
): Promise<FileValidationResult> {
  const warnings: string[] = [];
  
  try {
    // Basic checks
    if (!file || !file.name) {
      return {
        valid: false,
        error: 'No file provided',
        fileInfo: { name: '', size: 0, type: '', hash: '' }
      };
    }
    
    // Check file size
    if (file.size > config.maxSize) {
      return {
        valid: false,
        error: `File too large. Maximum size is ${Math.round(config.maxSize / 1024 / 1024)}MB`,
        fileInfo: { name: file.name, size: file.size, type: file.type, hash: '' }
      };
    }
    
    if (file.size === 0) {
      return {
        valid: false,
        error: 'Empty file not allowed',
        fileInfo: { name: file.name, size: file.size, type: file.type, hash: '' }
      };
    }
    
    // Check dangerous extensions
    if (hasDangerousExtension(file.name)) {
      return {
        valid: false,
        error: 'File type not permitted for security reasons',
        fileInfo: { name: file.name, size: file.size, type: file.type, hash: '' }
      };
    }
    
    // Check allowed MIME types
    if (!config.allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type '${file.type}' not allowed. Allowed types: ${config.allowedTypes.join(', ')}`,
        fileInfo: { name: file.name, size: file.size, type: file.type, hash: '' }
      };
    }
    
    // Get file content for magic number validation
    const buffer = await file.arrayBuffer();
    const hash = await calculateFileHash(buffer);
    
    // Validate file signature
    if (!validateFileSignature(buffer, file.type)) {
      return {
        valid: false,
        error: 'File content does not match its declared type',
        fileInfo: { name: file.name, size: file.size, type: file.type, hash }
      };
    }
    
    // Additional security checks
    const content = new Uint8Array(buffer);
    
    // Check for embedded scripts in images (basic check)
    if (file.type.startsWith('image/')) {
      const contentStr = new TextDecoder('utf-8', { fatal: false }).decode(content);
      if (contentStr.includes('<script') || contentStr.includes('javascript:')) {
        warnings.push('Image may contain embedded scripts');
      }
    }
    
    // Check PDF for JavaScript (basic check)
    if (file.type === 'application/pdf') {
      const contentStr = new TextDecoder('utf-8', { fatal: false }).decode(content);
      if (contentStr.includes('/JS ') || contentStr.includes('/JavaScript')) {
        warnings.push('PDF contains JavaScript content');
      }
    }
    
    return {
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      fileInfo: {
        name: sanitizeFilename(file.name),
        size: file.size,
        type: file.type,
        hash
      }
    };
    
  } catch (error) {
    console.error('File validation error:', error);
    return {
      valid: false,
      error: 'File validation failed',
      fileInfo: { name: file.name || '', size: file.size || 0, type: file.type || '', hash: '' }
    };
  }
}

/**
 * Create secure upload path
 */
export function createSecureUploadPath(userId: string, filename: string): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  const sanitizedName = sanitizeFilename(filename);
  
  return `${userId}/${timestamp}_${random}_${sanitizedName}`;
}