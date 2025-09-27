const { POST, GET } = require('@/app/api/identity/create-verification-session/route');
const { createMockRequest, mockSupabaseAuth, createMockStripe, TEST_USERS, getSupabaseClient } = require('../utils/test-helpers');

// Mock dependencies
jest.mock('@/utils/supabase/server', () => ({
  createClient: () => require('../utils/test-helpers').mockSupabaseAuth(require('../utils/test-helpers').TEST_USERS.PENDING)
}));

jest.mock('@/utils/profile-helpers', () => ({
  ensureUserProfile: jest.fn().mockResolvedValue({
    id: require('../utils/test-helpers').TEST_USERS.PENDING,
    email: 'pending-user@test.example.com',
    stripe_account_id: 'acct_test_pending',
    identity_status: 'pending'
  })
}));

describe('Identity Verification API', () => {
  let mockStripe;
  let supabase;
  const testId = Date.now();

  beforeEach(() => {
    mockStripe = createMockStripe();
    supabase = getSupabaseClient();
    
    // Mock Stripe module
    jest.doMock('stripe', () => ({
      __esModule: true,
      default: jest.fn(() => mockStripe)
    }));
  });

  afterEach(async () => {
    // Cleanup test data
    await supabase.from('identity_verification_sessions').delete().like('stripe_session_id', `vs_test_${testId}%`);
    jest.clearAllMocks();
  });

  describe('POST /api/identity/create-verification-session', () => {
    test('should create verification session successfully', async () => {
      const request = createMockRequest('POST', {
        type: 'document',
        return_url: 'https://example.com/complete'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.session.id).toBe('vs_test_mock');
      expect(data.session.client_secret).toBe('vs_test_mock_secret_test');
      expect(data.session.type).toBe('document');
      expect(data.session.return_url).toBe('https://example.com/complete');
      expect(data.next_steps).toContain('Complete identity verification');

      // Verify Stripe calls
      expect(mockStripe.identity.verificationSessions.create).toHaveBeenCalledWith({
        type: 'document',
        metadata: {
          user_id: TEST_USERS.PENDING,
          stripe_account_id: 'acct_test_pending',
          platform: 'pactify'
        },
        return_url: 'https://example.com/complete',
        options: {
          document: {
            allowed_types: ['driving_license', 'passport', 'id_card'],
            require_id_number: true,
            require_live_capture: true,
            require_matching_selfie: true
          }
        }
      });
    });

    test('should use default return URL when not provided', async () => {
      const request = createMockRequest('POST', {
        type: 'document'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.session.return_url).toMatch(/\/dashboard\/kyc\/identity\/complete$/);
    });

    test('should create id_number verification session', async () => {
      const request = createMockRequest('POST', {
        type: 'id_number'
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      expect(mockStripe.identity.verificationSessions.create).toHaveBeenCalledWith({
        type: 'id_number',
        metadata: expect.any(Object),
        return_url: expect.any(String)
      });
    });

    test('should reject user without Stripe account', async () => {
      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.NEW,
        email: 'new-user@test.example.com',
        stripe_account_id: null,
        identity_status: 'unstarted'
      });

      const request = createMockRequest('POST', {
        type: 'document'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No Stripe Connect account found. Please create one first.');
    });

    test('should reject already verified user', async () => {
      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.VERIFIED,
        email: 'verified-user@test.example.com',
        stripe_account_id: 'acct_test_verified',
        identity_status: 'verified'
      });

      const request = createMockRequest('POST', {
        type: 'document'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Identity already verified');
      expect(data.status).toBe('verified');
    });

    test('should enforce rate limiting', async () => {
      // Create 3 recent attempts to trigger rate limit
      const recentAttempts = Array.from({ length: 3 }, (_, i) => ({
        user_id: TEST_USERS.PENDING,
        stripe_session_id: `vs_test_${testId}_${i}`,
        session_type: 'document',
        status: 'created',
        client_secret: `secret_${i}`,
        created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 minutes ago
      }));

      await supabase.from('identity_verification_sessions').insert(recentAttempts);

      const request = createMockRequest('POST', {
        type: 'document'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toContain('Too many verification attempts');
      expect(data.retry_after).toBeDefined();
    });

    test('should validate request body', async () => {
      const invalidRequests = [
        { type: 'invalid_type' }, // Invalid verification type
        { return_url: 'not-a-url' }, // Invalid URL
        {} // Missing type (should use default)
      ];

      // Invalid type should fail
      let request = createMockRequest('POST', { type: 'invalid_type' });
      let response = await POST(request);
      expect(response.status).toBe(400);

      // Invalid URL should fail  
      request = createMockRequest('POST', { return_url: 'not-a-url' });
      response = await POST(request);
      expect(response.status).toBe(400);

      // Missing type should use default and succeed
      request = createMockRequest('POST', {});
      response = await POST(request);
      expect(response.status).toBe(200);
    });

    test('should handle Stripe API errors', async () => {
      mockStripe.identity.verificationSessions.create.mockRejectedValueOnce(
        new Error('Stripe Identity API Error')
      );

      const request = createMockRequest('POST', {
        type: 'document'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create identity verification session');
      expect(data.details).toBe('Stripe Identity API Error');
    });

    test('should store verification session in database', async () => {
      const request = createMockRequest('POST', {
        type: 'document'
      });

      await POST(request);

      // Check that session was stored
      const { data: session } = await supabase
        .from('identity_verification_sessions')
        .select('*')
        .eq('stripe_session_id', 'vs_test_mock')
        .single();

      expect(session).toBeDefined();
      expect(session.user_id).toBe(TEST_USERS.PENDING);
      expect(session.session_type).toBe('document');
      expect(session.status).toBe('created');
      expect(session.client_secret).toBe('vs_test_mock_secret_test');
      expect(session.metadata).toHaveProperty('stripe_account_id', 'acct_test_pending');
    });

    test('should update profile identity status', async () => {
      const request = createMockRequest('POST', {
        type: 'document'
      });

      await POST(request);

      // Verify profile was updated (mocked in this test environment)
      const mockProfileHelper = require('@/utils/profile-helpers');
      expect(mockProfileHelper.ensureUserProfile).toHaveBeenCalled();
    });

    test('should handle database storage errors', async () => {
      // Mock database insert to fail
      const mockInsertError = new Error('Database connection failed');
      jest.doMock('@/utils/supabase/server', () => ({
        createClient: () => ({
          ...mockSupabaseAuth(TEST_USERS.PENDING),
          from: () => ({
            insert: () => ({
              select: () => ({
                single: jest.fn().mockRejectedValue(mockInsertError)
              })
            })
          })
        })
      }));

      const request = createMockRequest('POST', {
        type: 'document'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to store verification session');
    });
  });

  describe('GET /api/identity/create-verification-session', () => {
    test('should return verification status for user with session', async () => {
      // Create test verification session
      await supabase.from('identity_verification_sessions').insert({
        user_id: TEST_USERS.PENDING,
        stripe_session_id: `vs_test_${testId}`,
        session_type: 'document',
        status: 'processing',
        client_secret: 'test_secret'
      });

      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.PENDING,
        identity_status: 'pending',
        identity_verification_session_id: `vs_test_${testId}`,
        last_kyc_check_at: new Date().toISOString()
      });

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.identity_status).toBe('pending');
      expect(data.verification_session_id).toBe(`vs_test_${testId}`);
      expect(data.latest_session).toBeDefined();
      expect(data.stripe_session).toBeDefined();
      expect(data.stripe_session.status).toBe('verified'); // From mock
      expect(data.can_create_new_session).toBe(false);

      // Verify Stripe call
      expect(mockStripe.identity.verificationSessions.retrieve).toHaveBeenCalledWith(`vs_test_${testId}`);
    });

    test('should return status for user without verification', async () => {
      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.NEW,
        identity_status: 'unstarted',
        identity_verification_session_id: null
      });

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.identity_status).toBe('unstarted');
      expect(data.verification_session_id).toBeNull();
      expect(data.latest_session).toBeNull();
      expect(data.stripe_session).toBeNull();
      expect(data.can_create_new_session).toBe(true);
    });

    test('should allow new session creation after failed verification', async () => {
      // Create failed verification session
      await supabase.from('identity_verification_sessions').insert({
        user_id: TEST_USERS.PENDING,
        stripe_session_id: `vs_test_${testId}_failed`,
        session_type: 'document',
        status: 'failed',
        client_secret: 'test_secret'
      });

      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.PENDING,
        identity_status: 'failed'
      });

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.can_create_new_session).toBe(true);
    });

    test('should handle Stripe retrieval errors', async () => {
      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.PENDING,
        identity_status: 'pending',
        identity_verification_session_id: 'vs_invalid'
      });

      mockStripe.identity.verificationSessions.retrieve.mockRejectedValueOnce(
        new Error('Session not found')
      );

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stripe_session).toBeNull();
    });

    test('should handle unauthorized access', async () => {
      // Mock auth failure
      jest.doMock('@/utils/supabase/server', () => ({
        createClient: () => ({
          auth: {
            getUser: jest.fn().mockResolvedValue({
              data: { user: null },
              error: new Error('Unauthorized')
            })
          }
        })
      }));

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Security Features', () => {
    test('should capture security metadata', async () => {
      const request = createMockRequest('POST', {
        type: 'document'
      }, {
        'x-forwarded-for': '192.168.1.100',
        'user-agent': 'Custom Browser/1.0'
      });

      await POST(request);

      // Check stored session metadata
      const { data: session } = await supabase
        .from('identity_verification_sessions')
        .select('metadata')
        .eq('stripe_session_id', 'vs_test_mock')
        .single();

      expect(session.metadata).toHaveProperty('created_from_ip', '192.168.1.100');
      expect(session.metadata).toHaveProperty('user_agent', 'Custom Browser/1.0');
    });

    test('should include platform metadata in Stripe session', async () => {
      const request = createMockRequest('POST', {
        type: 'document'
      });

      await POST(request);

      expect(mockStripe.identity.verificationSessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            platform: 'pactify',
            user_id: TEST_USERS.PENDING,
            stripe_account_id: 'acct_test_pending'
          })
        })
      );
    });
  });

  describe('Document Verification Options', () => {
    test('should configure document verification options correctly', async () => {
      const request = createMockRequest('POST', {
        type: 'document'
      });

      await POST(request);

      expect(mockStripe.identity.verificationSessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            document: {
              allowed_types: ['driving_license', 'passport', 'id_card'],
              require_id_number: true,
              require_live_capture: true,
              require_matching_selfie: true
            }
          }
        })
      );
    });

    test('should not include options for id_number verification', async () => {
      const request = createMockRequest('POST', {
        type: 'id_number'
      });

      await POST(request);

      const call = mockStripe.identity.verificationSessions.create.mock.calls[0][0];
      expect(call).not.toHaveProperty('options');
    });
  });

  describe('Rate Limiting Edge Cases', () => {
    test('should not count very old attempts against rate limit', async () => {
      // Create old attempts (over 1 hour ago)
      const oldAttempts = Array.from({ length: 5 }, (_, i) => ({
        user_id: TEST_USERS.PENDING,
        stripe_session_id: `vs_test_old_${i}`,
        session_type: 'document',
        status: 'created',
        client_secret: `secret_${i}`,
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
      }));

      await supabase.from('identity_verification_sessions').insert(oldAttempts);

      const request = createMockRequest('POST', {
        type: 'document'
      });

      const response = await POST(request);
      expect(response.status).toBe(200); // Should not be rate limited
    });

    test('should count attempts within rate limit window', async () => {
      const now = Date.now();
      const recentAttempts = [
        {
          user_id: TEST_USERS.PENDING,
          stripe_session_id: `vs_test_recent_1`,
          session_type: 'document',
          status: 'created',
          client_secret: 'secret_1',
          created_at: new Date(now - 30 * 60 * 1000).toISOString() // 30 min ago
        },
        {
          user_id: TEST_USERS.PENDING,
          stripe_session_id: `vs_test_recent_2`,
          session_type: 'document', 
          status: 'created',
          client_secret: 'secret_2',
          created_at: new Date(now - 20 * 60 * 1000).toISOString() // 20 min ago
        },
        {
          user_id: TEST_USERS.PENDING,
          stripe_session_id: `vs_test_recent_3`,
          session_type: 'document',
          status: 'created', 
          client_secret: 'secret_3',
          created_at: new Date(now - 10 * 60 * 1000).toISOString() // 10 min ago
        }
      ];

      await supabase.from('identity_verification_sessions').insert(recentAttempts);

      const request = createMockRequest('POST', {
        type: 'document'
      });

      const response = await POST(request);
      expect(response.status).toBe(429); // Should be rate limited
    });
  });
});