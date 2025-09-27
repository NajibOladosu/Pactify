// Mock dependencies first
jest.mock('@/utils/supabase/server', () => ({
  createClient: () => {
    const { mockSupabaseAuth, TEST_USERS } = require('../utils/test-helpers');
    return mockSupabaseAuth(TEST_USERS.NEW);
  }
}));

jest.mock('@/utils/profile-helpers', () => ({
  ensureUserProfile: jest.fn().mockImplementation(() => {
    const { TEST_USERS } = require('../utils/test-helpers');
    return Promise.resolve({
      id: TEST_USERS.NEW,
      email: 'new-user@test.example.com',
      stripe_account_id: null,
      identity_status: 'unstarted'
    });
  })
}));

const { createMockRequest, mockSupabaseAuth, createMockStripe, TEST_USERS, getSupabaseClient } = require('../utils/test-helpers');
const { POST, GET } = require('@/app/api/connect/v2/create-account/route');

describe('Connect Account Creation API', () => {
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
    await supabase.from('withdrawal_security_logs').delete().like('metadata->action', `test_${testId}%`);
    jest.clearAllMocks();
  });

  describe('POST /api/connect/v2/create-account', () => {
    test('should create Connect account successfully', async () => {
      const request = createMockRequest('POST', {
        country: 'US',
        business_type: 'individual'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.accountId).toBe('acct_test_mock');
      expect(data.onboardingUrl).toMatch(/connect\.stripe\.com/);
      expect(data.account).toHaveProperty('id');
      expect(data.account).toHaveProperty('type', 'express');
      expect(data.next_steps).toContain('Complete Stripe onboarding');

      // Verify Stripe calls
      expect(mockStripe.accounts.create).toHaveBeenCalledWith({
        type: 'express',
        country: 'US',
        email: 'new-user@test.example.com',
        capabilities: {
          transfers: { requested: true }
        },
        business_type: 'individual',
        tos_acceptance: expect.objectContaining({
          ip: '127.0.0.1',
          user_agent: 'Jest Test Runner'
        }),
        metadata: expect.objectContaining({
          platform_user_id: TEST_USERS.NEW,
          account_purpose: 'freelancer_escrow'
        }),
        settings: {
          payouts: {
            schedule: {
              interval: 'manual'
            }
          }
        }
      });

      expect(mockStripe.accountLinks.create).toHaveBeenCalledWith({
        account: 'acct_test_mock',
        refresh_url: expect.stringContaining('/dashboard/kyc/onboarding/refresh'),
        return_url: expect.stringContaining('/dashboard/kyc/onboarding/complete'),
        type: 'account_onboarding',
        collect: 'eventually_due'
      });
    });

    test('should handle user with existing account', async () => {
      // Mock user with existing account
      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.VERIFIED,
        email: 'verified-user@test.example.com',
        stripe_account_id: 'acct_existing',
        identity_status: 'verified'
      });

      const request = createMockRequest('POST', {
        country: 'US',
        business_type: 'individual'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('User already has a connected account');
      expect(data.accountId).toBe('acct_existing');
      expect(data.status).toBe('verified');
    });

    test('should enforce rate limiting', async () => {
      // Create recent security log to trigger rate limit
      await supabase.from('withdrawal_security_logs').insert({
        user_id: TEST_USERS.NEW,
        event_type: 'attempt',
        ip_address: '127.0.0.1',
        metadata: { action: 'create_connect_account' },
        created_at: new Date().toISOString()
      });

      const request = createMockRequest('POST', {
        country: 'US',
        business_type: 'individual'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toContain('Account creation attempted too recently');
      expect(data.retry_after).toBeDefined();
    });

    test('should validate request body', async () => {
      const invalidRequests = [
        { country: 'INVALID' }, // Invalid country code
        { business_type: 'invalid' }, // Invalid business type
        {} // Missing required fields
      ];

      for (const body of invalidRequests) {
        const request = createMockRequest('POST', body);
        const response = await POST(request);
        
        expect(response.status).toBe(400);
      }
    });

    test('should handle Stripe API errors', async () => {
      mockStripe.accounts.create.mockRejectedValueOnce(new Error('Stripe API Error'));

      const request = createMockRequest('POST', {
        country: 'US',
        business_type: 'individual'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create Stripe Connect account');
      expect(data.details).toBe('Stripe API Error');
    });

    test('should cleanup Stripe account on database failure', async () => {
      // Mock profile update to fail
      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.NEW,
        email: 'new-user@test.example.com',
        stripe_account_id: null,
        identity_status: 'unstarted'
      });

      // Mock Supabase update to fail
      const mockUpdate = jest.fn().mockRejectedValueOnce(new Error('Database error'));
      jest.doMock('@/utils/supabase/server', () => ({
        createClient: () => ({
          ...mockSupabaseAuth(TEST_USERS.NEW),
          from: () => ({
            update: mockUpdate
          })
        })
      }));

      const request = createMockRequest('POST', {
        country: 'US',
        business_type: 'individual'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to save account information');
      
      // Verify cleanup was attempted
      expect(mockStripe.accounts.del).toHaveBeenCalledWith('acct_test_mock');
    });

    test('should log security events', async () => {
      const request = createMockRequest('POST', {
        country: 'US',
        business_type: 'individual'
      });

      await POST(request);

      // Check that security logs were created
      const { data: logs } = await supabase
        .from('withdrawal_security_logs')
        .select('*')
        .eq('user_id', TEST_USERS.NEW)
        .eq('ip_address', '127.0.0.1')
        .order('created_at', { ascending: false })
        .limit(2);

      expect(logs).toHaveLength(2);
      expect(logs[0].event_type).toBe('success');
      expect(logs[1].event_type).toBe('attempt');
      expect(logs[0].metadata.action).toBe('create_connect_account');
    });
  });

  describe('GET /api/connect/v2/create-account', () => {
    test('should return account status for user without account', async () => {
      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.has_account).toBe(false);
      expect(data.identity_status).toBe('unstarted');
      expect(data.next_steps).toContain('Create Stripe Connect account');
    });

    test('should return account status for user with account', async () => {
      // Mock user with existing account
      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.VERIFIED,
        stripe_account_id: 'acct_test_verified',
        stripe_account_type: 'express',
        identity_status: 'verified',
        withdrawal_hold_until: null
      });

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.has_account).toBe(true);
      expect(data.account_id).toBe('acct_test_verified');
      expect(data.account_type).toBe('express');
      expect(data.identity_status).toBe('verified');
      expect(data.payouts_enabled).toBe(true);
      expect(data.withdrawal_ready).toBe(true);

      // Verify Stripe call
      expect(mockStripe.accounts.retrieve).toHaveBeenCalledWith('acct_test_verified');
    });

    test('should return account status with withdrawal hold', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      
      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.VERIFIED,
        stripe_account_id: 'acct_test_verified',
        stripe_account_type: 'express',
        identity_status: 'verified',
        withdrawal_hold_until: futureDate
      });

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.withdrawal_ready).toBe(false);
      expect(data.withdrawal_hold_until).toBe(futureDate);
    });

    test('should handle Stripe API errors in account retrieval', async () => {
      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.VERIFIED,
        stripe_account_id: 'acct_test_invalid',
        identity_status: 'verified'
      });

      mockStripe.accounts.retrieve.mockRejectedValueOnce(new Error('Account not found'));

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to check account status');
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

  describe('Input Validation', () => {
    test('should validate country codes', async () => {
      const validCountries = ['US', 'CA', 'GB', 'AU', 'DE', 'FR'];
      
      for (const country of validCountries) {
        mockStripe.accounts.create.mockClear();
        
        const request = createMockRequest('POST', {
          country,
          business_type: 'individual'
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
        expect(mockStripe.accounts.create).toHaveBeenCalledWith(
          expect.objectContaining({ country })
        );
      }
    });

    test('should validate business types', async () => {
      const validTypes = ['individual', 'company'];
      
      for (const business_type of validTypes) {
        mockStripe.accounts.create.mockClear();
        
        const request = createMockRequest('POST', {
          country: 'US',
          business_type
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
        expect(mockStripe.accounts.create).toHaveBeenCalledWith(
          expect.objectContaining({ business_type })
        );
      }
    });

    test('should apply default values', async () => {
      const request = createMockRequest('POST', {}); // Empty body

      const response = await POST(request);
      expect(response.status).toBe(200);
      
      expect(mockStripe.accounts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          country: 'US', // Default value
          business_type: 'individual' // Default value
        })
      );
    });
  });

  describe('Security Features', () => {
    test('should capture security context', async () => {
      const request = createMockRequest('POST', {
        country: 'US',
        business_type: 'individual'
      }, {
        'x-forwarded-for': '192.168.1.100',
        'user-agent': 'Custom Browser/1.0'
      });

      await POST(request);

      expect(mockStripe.accounts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            ip_address: '192.168.1.100',
            user_agent: 'Custom Browser/1.0'
          })
        })
      );
    });

    test('should set secure payout settings', async () => {
      const request = createMockRequest('POST', {
        country: 'US',
        business_type: 'individual'
      });

      await POST(request);

      expect(mockStripe.accounts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: {
            payouts: {
              schedule: {
                interval: 'manual'
              }
            }
          }
        })
      );
    });
  });
});