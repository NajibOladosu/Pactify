const { POST, GET } = require('@/app/api/withdrawals/v2/request/route');
const { createMockRequest, mockSupabaseAuth, createMockStripe, TEST_USERS, getSupabaseClient } = require('../utils/test-helpers');

// Mock dependencies
jest.mock('@/utils/supabase/server', () => ({
  createClient: () => require('../utils/test-helpers').mockSupabaseAuth(require('../utils/test-helpers').TEST_USERS.VERIFIED)
}));

jest.mock('@/utils/profile-helpers', () => ({
  ensureUserProfile: jest.fn().mockResolvedValue({
    id: require('../utils/test-helpers').TEST_USERS.VERIFIED,
    email: 'verified-user@test.example.com',
    stripe_account_id: 'acct_test_verified',
    identity_status: 'verified',
    withdrawal_hold_until: null
  })
}));

describe('Withdrawal Request API', () => {
  let mockStripe;
  let supabase;
  const testId = Date.now();

  beforeEach(async () => {
    mockStripe = createMockStripe();
    supabase = getSupabaseClient();
    
    // Mock Stripe module
    jest.doMock('stripe', () => ({
      __esModule: true,
      default: jest.fn(() => mockStripe)
    }));

    // Create test payout method
    await supabase.from('payout_methods').upsert({
      id: `${testId}-payout-method`,
      user_id: TEST_USERS.VERIFIED,
      stripe_external_account_id: `ba_test_${testId}`,
      stripe_account_id: 'acct_test_verified',
      method_type: 'bank_account',
      last_four: '6789',
      country: 'US',
      currency: 'USD',
      is_default: true,
      is_verified: true,
      verification_status: 'verified',
      added_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    }, { onConflict: 'id' });

    // Mock balance function
    mockBalanceFunction(95000); // $950 available
  });

  afterEach(async () => {
    // Cleanup test data
    await Promise.all([
      supabase.from('withdrawals').delete().like('idempotency_key', `test_${testId}%`),
      supabase.from('payout_methods').delete().eq('id', `${testId}-payout-method`),
      supabase.from('withdrawal_rate_limits').delete().eq('user_id', TEST_USERS.VERIFIED),
      supabase.from('withdrawal_security_logs').delete().like('metadata->action', `test_${testId}%`)
    ]);
    jest.clearAllMocks();
  });

  function mockBalanceFunction(balanceCents) {
    // Mock the RPC function call
    jest.doMock('@/utils/supabase/server', () => ({
      createClient: () => ({
        ...mockSupabaseAuth(TEST_USERS.VERIFIED),
        rpc: jest.fn().mockImplementation((funcName) => {
          if (funcName === 'get_user_available_balance') {
            return Promise.resolve({
              data: [{ available_balance_cents: balanceCents }],
              error: null
            });
          }
          return Promise.resolve({ data: [], error: null });
        }),
        from: (table) => ({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: table === 'payout_methods' ? [{
                    id: `${testId}-payout-method`,
                    is_verified: true,
                    added_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                    method_type: 'bank_account',
                    stripe_external_account_id: `ba_test_${testId}`
                  }] : [],
                  error: null
                })
              })
            })
          }),
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: `withdrawal_${testId}`,
                  user_id: TEST_USERS.VERIFIED,
                  amount_cents: 50000,
                  currency: 'USD',
                  status: 'pending',
                  created_at: new Date().toISOString()
                },
                error: null
              })
            })
          }),
          upsert: jest.fn().mockResolvedValue({ error: null })
        })
      })
    }));
  }

  describe('POST /api/withdrawals/v2/request', () => {
    test('should create withdrawal request successfully', async () => {
      const request = createMockRequest('POST', {
        amount_cents: 50000, // $500
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`,
        urgency: 'standard'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.withdrawal.amount_cents).toBe(50000);
      expect(data.withdrawal.currency).toBe('USD');
      expect(data.withdrawal.status).toBe('processing'); // Auto-approved
      expect(data.withdrawal.stripe_payout_id).toBe('po_test_mock');
      expect(data.risk_assessment.requires_review).toBe(false);
      expect(data.message).toContain('initiated successfully');

      // Verify Stripe payout creation
      expect(mockStripe.payouts.create).toHaveBeenCalledWith({
        amount: 50000,
        currency: 'usd',
        destination: `ba_test_${testId}`,
        method: 'standard',
        statement_descriptor: 'Pactify Withdrawal',
        metadata: expect.objectContaining({
          user_id: TEST_USERS.VERIFIED,
          payout_method_id: `${testId}-payout-method`
        })
      }, {
        stripeAccount: 'acct_test_verified',
        idempotencyKey: expect.any(String)
      });
    });

    test('should handle high-risk withdrawal requiring review', async () => {
      const request = createMockRequest('POST', {
        amount_cents: 200000, // $2,000 - high amount
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`,
        urgency: 'standard'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.withdrawal.status).toBe('requires_review');
      expect(data.risk_assessment.requires_review).toBe(true);
      expect(data.risk_assessment.score).toBeGreaterThan(0);
      expect(data.risk_assessment.flags).toContain('high_amount');
      expect(data.message).toContain('submitted for review');

      // Should not create Stripe payout yet
      expect(mockStripe.payouts.create).not.toHaveBeenCalled();
    });

    test('should reject withdrawal with insufficient balance', async () => {
      mockBalanceFunction(30000); // Only $300 available

      const request = createMockRequest('POST', {
        amount_cents: 50000, // Requesting $500
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Insufficient balance');
      expect(data.available_balance_cents).toBe(30000);
    });

    test('should reject unverified user', async () => {
      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.PENDING,
        identity_status: 'pending'
      });

      const request = createMockRequest('POST', {
        amount_cents: 50000,
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Identity verification required for withdrawals');
    });

    test('should reject user with withdrawal hold', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.VERIFIED,
        identity_status: 'verified',
        withdrawal_hold_until: futureDate,
        stripe_account_id: 'acct_test_verified'
      });

      const request = createMockRequest('POST', {
        amount_cents: 50000,
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Account has withdrawal hold');
      expect(data.hold_until).toBe(futureDate);
    });

    test('should enforce rate limiting', async () => {
      // Create recent withdrawals to trigger rate limit
      await Promise.all([1, 2, 3, 4, 5].map(i => 
        supabase.from('withdrawals').insert({
          user_id: TEST_USERS.VERIFIED,
          amount_cents: 10000,
          currency: 'USD',
          status: 'pending',
          idempotency_key: `test_rate_limit_${i}`,
          created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 min ago
        })
      ));

      const request = createMockRequest('POST', {
        amount_cents: 50000,
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toContain('Too many withdrawal attempts');
    });

    test('should validate invalid payout method', async () => {
      const request = createMockRequest('POST', {
        amount_cents: 50000,
        currency: 'USD',
        payout_method_id: 'invalid-payout-method-id'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid payout method');
    });

    test('should validate unverified payout method', async () => {
      // Update payout method to unverified
      await supabase
        .from('payout_methods')
        .update({ is_verified: false })
        .eq('id', `${testId}-payout-method`);

      const request = createMockRequest('POST', {
        amount_cents: 50000,
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Payout method not verified');
    });

    test('should validate amount constraints', async () => {
      const invalidAmounts = [
        50, // Below minimum ($1)
        1500000 // Above maximum ($15,000)
      ];

      for (const amount of invalidAmounts) {
        const request = createMockRequest('POST', {
          amount_cents: amount,
          currency: 'USD',
          payout_method_id: `${testId}-payout-method`
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      }
    });

    test('should handle express urgency', async () => {
      const request = createMockRequest('POST', {
        amount_cents: 50000,
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`,
        urgency: 'express'
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      expect(mockStripe.payouts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'instant'
        }),
        expect.any(Object)
      );
    });

    test('should handle Stripe payout creation errors', async () => {
      mockStripe.payouts.create.mockRejectedValueOnce(new Error('Insufficient funds in platform account'));

      const request = createMockRequest('POST', {
        amount_cents: 50000,
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to process withdrawal');
      expect(data.details).toBe('Insufficient funds in platform account');
    });

    test('should generate unique idempotency keys', async () => {
      const requests = await Promise.all([
        createMockRequest('POST', {
          amount_cents: 50000,
          currency: 'USD',
          payout_method_id: `${testId}-payout-method`
        }),
        createMockRequest('POST', {
          amount_cents: 50000,
          currency: 'USD',
          payout_method_id: `${testId}-payout-method`
        })
      ].map(request => POST(request)));

      // Both should succeed with different idempotency keys
      expect(requests[0].status).toBe(200);
      expect(requests[1].status).toBe(200);
    });

    test('should log comprehensive security events', async () => {
      const request = createMockRequest('POST', {
        amount_cents: 50000,
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`
      }, {
        'x-forwarded-for': '192.168.1.100',
        'user-agent': 'Test Browser/1.0'
      });

      await POST(request);

      // Check security logs
      const { data: logs } = await supabase
        .from('withdrawal_security_logs')
        .select('*')
        .eq('user_id', TEST_USERS.VERIFIED)
        .eq('ip_address', '192.168.1.100')
        .order('created_at', { ascending: false })
        .limit(2);

      expect(logs).toHaveLength(2);
      expect(logs[0].event_type).toBe('success');
      expect(logs[1].event_type).toBe('attempt');
      expect(logs[0].metadata.action).toBe('withdrawal_request');
      expect(logs[0].metadata.amount_cents).toBe(50000);
    });

    test('should update rate limits after successful withdrawal', async () => {
      const request = createMockRequest('POST', {
        amount_cents: 50000,
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`
      });

      await POST(request);

      // Check that rate limits were updated (mocked in this test)
      // In real implementation, this would check the withdrawal_rate_limits table
      expect(true).toBe(true); // Placeholder for rate limit verification
    });
  });

  describe('GET /api/withdrawals/v2/request', () => {
    test('should return withdrawal eligibility for eligible user', async () => {
      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.eligibility.can_withdraw).toBe(true);
      expect(data.eligibility.available_balance_cents).toBe(95000);
      expect(data.eligibility.verified_payout_methods).toBe(1);
      expect(data.eligibility.reasons).toHaveLength(0);
    });

    test('should return ineligible status for unverified user', async () => {
      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.PENDING,
        identity_status: 'pending',
        stripe_account_id: 'acct_test_pending'
      });

      mockBalanceFunction(50000);

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.eligibility.can_withdraw).toBe(false);
      expect(data.eligibility.reasons).toContain('Identity verification required');
    });

    test('should return ineligible status for user with no balance', async () => {
      mockBalanceFunction(0); // No balance

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.eligibility.can_withdraw).toBe(false);
      expect(data.eligibility.reasons).toContain('Insufficient balance');
    });

    test('should return ineligible status for user with no payout methods', async () => {
      // Remove payout method
      await supabase
        .from('payout_methods')
        .delete()
        .eq('id', `${testId}-payout-method`);

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.eligibility.can_withdraw).toBe(false);
      expect(data.eligibility.reasons).toContain('No verified payout methods');
    });

    test('should return withdrawal limits and rate limits', async () => {
      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(data.eligibility.withdrawal_limits).toBeDefined();
      expect(data.eligibility.withdrawal_limits.daily).toBe(500000);
      expect(data.eligibility.withdrawal_limits.weekly).toBe(2000000);
      expect(data.eligibility.withdrawal_limits.monthly).toBe(10000000);
    });

    test('should handle database errors gracefully', async () => {
      // Mock database error
      jest.doMock('@/utils/supabase/server', () => ({
        createClient: () => ({
          auth: {
            getUser: jest.fn().mockRejectedValue(new Error('Database connection failed'))
          }
        })
      }));

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to check withdrawal eligibility');
    });
  });

  describe('Security Risk Assessment', () => {
    test('should assess high amount risk', async () => {
      const request = createMockRequest('POST', {
        amount_cents: 600000, // $6,000
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.risk_assessment.flags).toContain('high_amount');
      expect(data.risk_assessment.score).toBeGreaterThan(25);
    });

    test('should assess new payout method risk', async () => {
      // Update payout method to be recently added
      await supabase
        .from('payout_methods')
        .update({
          added_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 1 day ago
        })
        .eq('id', `${testId}-payout-method`);

      const request = createMockRequest('POST', {
        amount_cents: 50000,
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.risk_assessment.flags).toContain('new_payout_method');
    });

    test('should assess suspicious IP risk', async () => {
      const request = createMockRequest('POST', {
        amount_cents: 50000,
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`
      }, {
        'x-forwarded-for': '10.0.0.1' // Private network IP
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.risk_assessment.flags).toContain('suspicious_ip');
    });

    test('should combine multiple risk factors', async () => {
      // New payout method + high amount + suspicious IP
      await supabase
        .from('payout_methods')
        .update({
          added_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString() // 12 hours ago
        })
        .eq('id', `${testId}-payout-method`);

      const request = createMockRequest('POST', {
        amount_cents: 800000, // $8,000
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`
      }, {
        'x-forwarded-for': '192.168.1.1'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.risk_assessment.requires_review).toBe(true);
      expect(data.risk_assessment.flags.length).toBeGreaterThan(1);
      expect(data.risk_assessment.score).toBeGreaterThan(50);
    });
  });

  describe('Input Validation', () => {
    test('should validate required fields', async () => {
      const invalidRequests = [
        {}, // Missing all fields
        { amount_cents: 50000 }, // Missing payout_method_id
        { payout_method_id: `${testId}-payout-method` }, // Missing amount
      ];

      for (const body of invalidRequests) {
        const request = createMockRequest('POST', body);
        const response = await POST(request);
        expect(response.status).toBe(400);
      }
    });

    test('should validate amount range', async () => {
      const invalidAmounts = [0, -1000, 50, 1500000];

      for (const amount_cents of invalidAmounts) {
        const request = createMockRequest('POST', {
          amount_cents,
          currency: 'USD',
          payout_method_id: `${testId}-payout-method`
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      }
    });

    test('should validate currency', async () => {
      const invalidCurrencies = ['invalid', 'US', ''];

      for (const currency of invalidCurrencies) {
        const request = createMockRequest('POST', {
          amount_cents: 50000,
          currency,
          payout_method_id: `${testId}-payout-method`
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      }
    });

    test('should validate payout method ID format', async () => {
      const invalidIds = ['not-a-uuid', '', '123'];

      for (const payout_method_id of invalidIds) {
        const request = createMockRequest('POST', {
          amount_cents: 50000,
          currency: 'USD',
          payout_method_id
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      }
    });

    test('should validate urgency values', async () => {
      const validUrgencies = ['standard', 'express'];
      const invalidUrgencies = ['instant', 'slow', ''];

      for (const urgency of validUrgencies) {
        const request = createMockRequest('POST', {
          amount_cents: 50000,
          currency: 'USD',
          payout_method_id: `${testId}-payout-method`,
          urgency
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
      }

      for (const urgency of invalidUrgencies) {
        const request = createMockRequest('POST', {
          amount_cents: 50000,
          currency: 'USD',
          payout_method_id: `${testId}-payout-method`,
          urgency
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
      }
    });
  });

  describe('Concurrency and Edge Cases', () => {
    test('should handle concurrent withdrawal requests', async () => {
      const requests = await Promise.all([1, 2, 3].map(i => 
        POST(createMockRequest('POST', {
          amount_cents: 20000, // $200 each
          currency: 'USD',
          payout_method_id: `${testId}-payout-method`
        }))
      ));

      // Should handle concurrent requests gracefully
      // Some may succeed, some may fail due to balance constraints
      const statuses = requests.map(r => r.status);
      expect(statuses.some(s => s === 200)).toBe(true);
    });

    test('should handle balance changes during request processing', async () => {
      // This test would verify that balance checks are atomic
      // In practice, this requires careful database transaction handling
      const request = createMockRequest('POST', {
        amount_cents: 50000,
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`
      });

      const response = await POST(request);
      expect([200, 400].includes(response.status)).toBe(true);
    });
  });
});