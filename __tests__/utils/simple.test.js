// Simple utility test to verify utility testing works
describe('Utility Tests', () => {
  describe('Email Validation', () => {
    const validateEmail = (email) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      return emailRegex.test(email)
    }

    it('should validate correct email formats', () => {
      expect(validateEmail('test@example.com')).toBe(true)
      expect(validateEmail('user.name+tag@domain.co.uk')).toBe(true)
      expect(validateEmail('user123@test-domain.com')).toBe(true)
    })

    it('should reject invalid email formats', () => {
      expect(validateEmail('invalid-email')).toBe(false)
      expect(validateEmail('test@')).toBe(false)
      expect(validateEmail('@example.com')).toBe(false)
      expect(validateEmail('')).toBe(false)
      expect(validateEmail('test.example.com')).toBe(false)
    })
  })

  describe('Amount Validation', () => {
    const validateAmount = (amount, minAmount = 1, maxAmount = 1000000) => {
      if (isNaN(amount) || amount < minAmount) {
        return { valid: false, error: `Amount must be at least ${minAmount}` }
      }
      if (amount > maxAmount) {
        return { valid: false, error: `Amount cannot exceed ${maxAmount}` }
      }
      return { valid: true, error: null }
    }

    it('should validate amounts within range', () => {
      expect(validateAmount(100)).toEqual({ valid: true, error: null })
      expect(validateAmount(1000)).toEqual({ valid: true, error: null })
      expect(validateAmount(50000)).toEqual({ valid: true, error: null })
    })

    it('should reject amounts too low', () => {
      expect(validateAmount(0)).toEqual({
        valid: false,
        error: 'Amount must be at least 1',
      })
      expect(validateAmount(-100)).toEqual({
        valid: false,
        error: 'Amount must be at least 1',
      })
    })

    it('should reject amounts too high', () => {
      expect(validateAmount(1000001)).toEqual({
        valid: false,
        error: 'Amount cannot exceed 1000000',
      })
    })

    it('should use custom min/max amounts', () => {
      expect(validateAmount(5, 10, 100)).toEqual({
        valid: false,
        error: 'Amount must be at least 10',
      })
      expect(validateAmount(150, 10, 100)).toEqual({
        valid: false,
        error: 'Amount cannot exceed 100',
      })
      expect(validateAmount(50, 10, 100)).toEqual({
        valid: true,
        error: null,
      })
    })
  })

  describe('Text Sanitization', () => {
    const sanitizeText = (text, maxLength = 10000) => {
      if (!text || typeof text !== 'string') {
        return { valid: false, error: 'Invalid text input' }
      }
      if (text.length > maxLength) {
        return { valid: false, error: `Text exceeds maximum length of ${maxLength}` }
      }
      
      // Basic HTML tag removal
      const cleanText = text.replace(/<[^>]*>/g, '')
      
      // Check for potential SQL injection patterns
      const sqlInjectionPatterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b)/i,
        /(--|\/\*|\*\/)/,
        /(\bOR\b.*=)/i,
        /(\bUNION\b.*\bSELECT\b)/i,
      ]

      for (const pattern of sqlInjectionPatterns) {
        if (pattern.test(cleanText)) {
          return { valid: false, error: 'Text contains potentially malicious content' }
        }
      }

      return { valid: true, cleanText }
    }

    it('should sanitize normal text', () => {
      const result = sanitizeText('Hello world!')
      expect(result.valid).toBe(true)
      expect(result.cleanText).toBe('Hello world!')
    })

    it('should strip HTML tags', () => {
      const result = sanitizeText('Hello <script>alert("xss")</script> world!')
      expect(result.valid).toBe(true)
      expect(result.cleanText).toBe('Hello alert("xss") world!')
    })

    it('should reject text that is too long', () => {
      const longText = 'a'.repeat(10001)
      const result = sanitizeText(longText)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Text exceeds maximum length of 10000')
    })

    it('should reject SQL injection attempts', () => {
      expect(sanitizeText('SELECT * FROM users').valid).toBe(false)
      expect(sanitizeText("'; DROP TABLE users; --").valid).toBe(false)
      expect(sanitizeText('1 OR name=admin').valid).toBe(false)
      expect(sanitizeText('UNION SELECT password FROM users').valid).toBe(false)
    })

    it('should handle empty or invalid inputs', () => {
      expect(sanitizeText('').valid).toBe(false)
      expect(sanitizeText(null).valid).toBe(false)
      expect(sanitizeText(123).valid).toBe(false)
    })
  })

  describe('Contract Status Validation', () => {
    const validateStatusTransition = (currentStatus, newStatus) => {
      const validTransitions = {
        draft: ['pending_signatures', 'cancelled'],
        pending_signatures: ['pending_funding', 'draft', 'cancelled'],
        pending_funding: ['active', 'cancelled'],
        active: ['pending_delivery', 'cancelled', 'disputed'],
        pending_delivery: ['in_review', 'active', 'disputed'],
        in_review: ['revision_requested', 'pending_completion', 'disputed'],
        revision_requested: ['active', 'disputed'],
        pending_completion: ['completed', 'disputed'],
        completed: [],
        cancelled: [],
        disputed: ['active', 'cancelled'],
      }

      const allowedTransitions = validTransitions[currentStatus] || []
      return allowedTransitions.includes(newStatus)
    }

    it('should allow valid status transitions', () => {
      expect(validateStatusTransition('draft', 'pending_signatures')).toBe(true)
      expect(validateStatusTransition('pending_signatures', 'pending_funding')).toBe(true)
      expect(validateStatusTransition('pending_funding', 'active')).toBe(true)
      expect(validateStatusTransition('active', 'pending_delivery')).toBe(true)
      expect(validateStatusTransition('pending_delivery', 'in_review')).toBe(true)
      expect(validateStatusTransition('in_review', 'pending_completion')).toBe(true)
      expect(validateStatusTransition('pending_completion', 'completed')).toBe(true)
    })

    it('should reject invalid status transitions', () => {
      expect(validateStatusTransition('draft', 'completed')).toBe(false)
      expect(validateStatusTransition('completed', 'draft')).toBe(false)
      expect(validateStatusTransition('cancelled', 'active')).toBe(false)
      expect(validateStatusTransition('active', 'draft')).toBe(false)
    })

    it('should handle disputed states', () => {
      expect(validateStatusTransition('active', 'disputed')).toBe(true)
      expect(validateStatusTransition('disputed', 'active')).toBe(true)
      expect(validateStatusTransition('disputed', 'cancelled')).toBe(true)
    })
  })
})