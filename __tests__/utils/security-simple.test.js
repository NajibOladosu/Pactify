// Simplified security utility tests
describe('Security Utility Tests', () => {
  
  describe('Input Validation', () => {
    const validateInput = (input, options = {}) => {
      const { required = false, minLength = 0, maxLength = 1000, pattern = null } = options
      
      // Required check
      if (required && (!input || input.trim() === '')) {
        return { isValid: false, error: 'This field is required' }
      }
      
      // Length checks
      if (input && input.length < minLength) {
        return { isValid: false, error: `Minimum length is ${minLength}` }
      }
      
      if (input && input.length > maxLength) {
        return { isValid: false, error: `Maximum length is ${maxLength}` }
      }
      
      // Pattern check
      if (input && pattern && !pattern.test(input)) {
        return { isValid: false, error: 'Invalid format' }
      }
      
      return { isValid: true, error: null }
    }

    it('should validate required fields', () => {
      const result1 = validateInput('', { required: true })
      expect(result1.isValid).toBe(false)
      expect(result1.error).toBe('This field is required')

      const result2 = validateInput('valid input', { required: true })
      expect(result2.isValid).toBe(true)
      expect(result2.error).toBeNull()
    })

    it('should validate field length', () => {
      const result1 = validateInput('ab', { minLength: 3 })
      expect(result1.isValid).toBe(false)
      expect(result1.error).toBe('Minimum length is 3')

      const result2 = validateInput('abc', { minLength: 3 })
      expect(result2.isValid).toBe(true)
      expect(result2.error).toBeNull()

      const longString = 'a'.repeat(1001)
      const result3 = validateInput(longString, { maxLength: 1000 })
      expect(result3.isValid).toBe(false)
      expect(result3.error).toBe('Maximum length is 1000')
    })

    it('should validate patterns', () => {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      
      const result1 = validateInput('invalid-email', { pattern: emailPattern })
      expect(result1.isValid).toBe(false)
      expect(result1.error).toBe('Invalid format')

      const result2 = validateInput('valid@email.com', { pattern: emailPattern })
      expect(result2.isValid).toBe(true)
      expect(result2.error).toBeNull()
    })
  })

  describe('Data Sanitization', () => {
    const sanitizeHtml = (input) => {
      if (!input) return ''
      // Remove HTML tags
      return input.replace(/<[^>]*>/g, '')
    }

    const sanitizeUrl = (input) => {
      if (!input) return ''
      // Only allow https URLs
      if (input.startsWith('https://')) {
        return input
      }
      return ''
    }

    it('should sanitize HTML input', () => {
      const input = '<script>alert("xss")</script>Hello World'
      const result = sanitizeHtml(input)
      expect(result).toBe('alert("xss")Hello World')
      expect(result).not.toContain('<script>')
    })

    it('should sanitize URLs', () => {
      const validUrl = 'https://example.com/file.pdf'
      const invalidUrl = 'http://example.com/file.pdf'
      
      expect(sanitizeUrl(validUrl)).toBe(validUrl)
      expect(sanitizeUrl(invalidUrl)).toBe('')
    })

    it('should handle empty inputs', () => {
      expect(sanitizeHtml('')).toBe('')
      expect(sanitizeHtml(null)).toBe('')
      expect(sanitizeUrl('')).toBe('')
      expect(sanitizeUrl(null)).toBe('')
    })
  })

  describe('Authentication Helpers', () => {
    const isAuthenticated = (user) => {
      return !!(user && user.id && user.email)
    }

    const hasPermission = (user, resource, action) => {
      if (!isAuthenticated(user)) {
        return false
      }

      // Admin has all permissions
      if (user.role === 'admin') {
        return true
      }

      // Resource-specific permissions
      if (resource === 'contract') {
        if (action === 'create' || action === 'read') {
          return true
        }
        if (action === 'update' || action === 'delete') {
          return user.role === 'client' || user.role === 'freelancer'
        }
      }

      return false
    }

    it('should check authentication status', () => {
      const authenticatedUser = { id: '123', email: 'user@example.com' }
      const unauthenticatedUser = null
      const incompleteUser = { id: '123' }

      expect(isAuthenticated(authenticatedUser)).toBe(true)
      expect(isAuthenticated(unauthenticatedUser)).toBe(false)
      expect(isAuthenticated(incompleteUser)).toBe(false)
    })

    it('should check user permissions', () => {
      const adminUser = { id: '1', email: 'admin@example.com', role: 'admin' }
      const clientUser = { id: '2', email: 'client@example.com', role: 'client' }
      const regularUser = { id: '3', email: 'user@example.com', role: 'user' }

      // Admin permissions
      expect(hasPermission(adminUser, 'contract', 'create')).toBe(true)
      expect(hasPermission(adminUser, 'contract', 'delete')).toBe(true)

      // Client permissions
      expect(hasPermission(clientUser, 'contract', 'create')).toBe(true)
      expect(hasPermission(clientUser, 'contract', 'update')).toBe(true)

      // Regular user permissions
      expect(hasPermission(regularUser, 'contract', 'create')).toBe(true)
      expect(hasPermission(regularUser, 'contract', 'update')).toBe(false)

      // Unauthenticated user permissions
      expect(hasPermission(null, 'contract', 'create')).toBe(false)
    })
  })

  describe('Rate Limiting', () => {
    const createRateLimiter = (maxRequests, windowMs) => {
      const requests = new Map()
      
      return (userId) => {
        const now = Date.now()
        const userRequests = requests.get(userId) || []
        
        // Remove old requests outside the window
        const validRequests = userRequests.filter(
          timestamp => now - timestamp < windowMs
        )
        
        // Check if limit exceeded
        if (validRequests.length >= maxRequests) {
          return { allowed: false, remaining: 0, resetTime: validRequests[0] + windowMs }
        }
        
        // Add current request
        validRequests.push(now)
        requests.set(userId, validRequests)
        
        return { 
          allowed: true, 
          remaining: maxRequests - validRequests.length,
          resetTime: now + windowMs
        }
      }
    }

    it('should allow requests within limit', () => {
      const limiter = createRateLimiter(3, 60000) // 3 requests per minute
      
      const result1 = limiter('user1')
      expect(result1.allowed).toBe(true)
      expect(result1.remaining).toBe(2)
      
      const result2 = limiter('user1')
      expect(result2.allowed).toBe(true)
      expect(result2.remaining).toBe(1)
      
      const result3 = limiter('user1')
      expect(result3.allowed).toBe(true)
      expect(result3.remaining).toBe(0)
    })

    it('should block requests over limit', () => {
      const limiter = createRateLimiter(2, 60000) // 2 requests per minute
      
      limiter('user2') // First request
      limiter('user2') // Second request
      
      const result = limiter('user2') // Third request (should be blocked)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('should handle different users separately', () => {
      const limiter = createRateLimiter(1, 60000) // 1 request per minute
      
      const result1 = limiter('user1')
      expect(result1.allowed).toBe(true)
      
      const result2 = limiter('user2')
      expect(result2.allowed).toBe(true)
      
      const result3 = limiter('user1') // Should be blocked for user1
      expect(result3.allowed).toBe(false)
      
      const result4 = limiter('user2') // Should be blocked for user2
      expect(result4.allowed).toBe(false)
    })
  })

  describe('Encryption Helpers', () => {
    const simpleHash = (input) => {
      if (!input) return ''
      // Simple hash simulation (not for production)
      let hash = 0
      for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash // Convert to 32-bit integer
      }
      return hash.toString(16)
    }

    const maskSensitiveData = (data, fieldsToMask = []) => {
      const masked = { ...data }
      fieldsToMask.forEach(field => {
        if (masked[field]) {
          masked[field] = '***MASKED***'
        }
      })
      return masked
    }

    it('should hash input consistently', () => {
      const input = 'password123'
      const hash1 = simpleHash(input)
      const hash2 = simpleHash(input)
      
      expect(hash1).toBe(hash2)
      expect(hash1).not.toBe(input)
    })

    it('should mask sensitive data', () => {
      const userData = {
        id: '123',
        email: 'user@example.com',
        password: 'secret123',
        creditCard: '1234-5678-9012-3456',
        name: 'John Doe',
      }

      const maskedData = maskSensitiveData(userData, ['password', 'creditCard'])
      
      expect(maskedData.id).toBe('123')
      expect(maskedData.email).toBe('user@example.com')
      expect(maskedData.name).toBe('John Doe')
      expect(maskedData.password).toBe('***MASKED***')
      expect(maskedData.creditCard).toBe('***MASKED***')
    })

    it('should handle empty or null inputs', () => {
      expect(simpleHash('')).toBe('')
      expect(simpleHash(null)).toBe('')
      
      const emptyData = {}
      const maskedEmpty = maskSensitiveData(emptyData, ['password'])
      expect(maskedEmpty).toEqual({})
    })
  })
})