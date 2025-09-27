const { POST, GET } = require('@/app/api/payout-methods/route');
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
    identity_status: 'verified'
  })
}));

describe('Payout Methods API', () => {
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
    await supabase.from('payout_methods').delete().like('stripe_external_account_id', `ba_test_${testId}%`);
    await supabase.from('withdrawal_security_logs').delete().like('metadata->action', `test_${testId}%`);
    jest.clearAllMocks();
  });

  describe('POST /api/payout-methods', () => {
    test('should add bank account successfully', async () => {
      const request = createMockRequest('POST', {
        type: 'bank_account',
        bank_account: {
          country: 'US',
          currency: 'USD',
          account_holder_name: 'John Doe',
          account_holder_type: 'individual',
          routing_number: '110000000',
          account_number: '000123456789'
        },
        make_default: true
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.payout_method.type).toBe('bank_account');
      expect(data.payout_method.last_four).toBe('6789');
      expect(data.payout_method.bank_name).toBe('Test Bank');
      expect(data.payout_method.is_default).toBe(true);
      expect(data.withdrawal_hold_until).toBeDefined();
      expect(data.message).toContain('72-hour security hold');

      // Verify Stripe calls
      expect(mockStripe.accounts.createExternalAccount).toHaveBeenCalledWith(
        'acct_test_verified',
        {
          external_account: {
            object: 'bank_account',
            country: 'US',
            currency: 'USD',
            account_holder_name: 'John Doe',
            account_holder_type: 'individual',
            routing_number: '110000000',
            account_number: '000123456789'
          }
        }
      );
    });

    test('should add debit card successfully', async () => {
      mockStripe.accounts.createExternalAccount.mockResolvedValueOnce({
        id: 'card_test_mock',
        object: 'card',
        last4: '4242',
        name: 'John Doe',
        country: 'US',
        currency: 'usd'
      });

      const request = createMockRequest('POST', {
        type: 'debit_card',
        debit_card: {
          number: '4242424242424242',
          exp_month: 12,
          exp_year: 2025,
          cvc: '123'
        },
        make_default: false
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.payout_method.type).toBe('debit_card');
      expect(data.payout_method.last_four).toBe('4242');
      expect(data.payout_method.is_default).toBe(false);

      expect(mockStripe.accounts.createExternalAccount).toHaveBeenCalledWith(
        'acct_test_verified',
        {
          external_account: {
            object: 'card',
            number: '4242424242424242',
            exp_month: 12,
            exp_year: 2025,
            cvc: '123'
          }
        }
      );
    });

    test('should reject user without verified identity', async () => {
      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.PENDING,
        stripe_account_id: 'acct_test_pending',
        identity_status: 'pending'
      });

      const request = createMockRequest('POST', {
        type: 'bank_account',
        bank_account: {
          country: 'US',
          currency: 'USD',
          account_holder_name: 'John Doe',
          routing_number: '110000000',
          account_number: '000123456789'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Identity verification required before adding payout methods.');
    });

    test('should reject user without Stripe account', async () => {
      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.NEW,
        stripe_account_id: null,
        identity_status: 'unstarted'
      });

      const request = createMockRequest('POST', {
        type: 'bank_account',
        bank_account: {
          country: 'US',
          currency: 'USD',
          account_holder_name: 'John Doe',
          routing_number: '110000000',
          account_number: '000123456789'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No Stripe Connect account found. Please create one first.');
    });

    test('should validate request body structure', async () => {
      const invalidRequests = [
        {
          type: 'bank_account'
          // Missing bank_account details
        },
        {
          type: 'debit_card'
          // Missing debit_card details
        },
        {
          type: 'invalid_type',
          bank_account: {}
        },
        {
          type: 'bank_account',
          bank_account: {
            country: 'INVALID', // Invalid country code
            currency: 'USD',
            account_holder_name: 'John Doe',
            routing_number: '110000000',
            account_number: '000123456789'
          }
        }
      ];

      for (const body of invalidRequests) {
        const request = createMockRequest('POST', body);
        const response = await POST(request);
        expect(response.status).toBe(400);
      }
    });

    test('should enforce 72-hour hold period', async () => {
      const beforeHold = Date.now();
      
      const request = createMockRequest('POST', {
        type: 'bank_account',
        bank_account: {
          country: 'US',
          currency: 'USD',
          account_holder_name: 'John Doe',
          routing_number: '110000000',
          account_number: '000123456789'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      const holdUntil = new Date(data.withdrawal_hold_until).getTime();
      const expectedHold = beforeHold + (72 * 60 * 60 * 1000);
      
      expect(holdUntil).toBeGreaterThanOrEqual(expectedHold - 1000); // Allow 1s tolerance
      expect(holdUntil).toBeLessThanOrEqual(expectedHold + 1000);
    });

    test('should make method default when requested', async () => {
      // First, create a non-default method
      await supabase.from('payout_methods').insert({
        id: `${testId}-existing`,
        user_id: TEST_USERS.VERIFIED,
        stripe_external_account_id: `ba_test_${testId}_existing`,
        stripe_account_id: 'acct_test_verified',
        method_type: 'bank_account',
        country: 'US',
        currency: 'USD',
        is_default: true,
        is_verified: true
      });

      const request = createMockRequest('POST', {
        type: 'bank_account',
        bank_account: {
          country: 'US',
          currency: 'USD',
          account_holder_name: 'John Doe',
          routing_number: '110000000',
          account_number: '000123456789'
        },
        make_default: true
      });

      await POST(request);

      // Check that previous default was updated
      const { data: existingMethod } = await supabase
        .from('payout_methods')
        .select('is_default')
        .eq('id', `${testId}-existing`)
        .single();

      expect(existingMethod.is_default).toBe(false);
    });

    test('should handle Stripe API errors', async () => {
      mockStripe.accounts.createExternalAccount.mockRejectedValueOnce(
        new Error('Invalid bank account')
      );

      const request = createMockRequest('POST', {
        type: 'bank_account',
        bank_account: {
          country: 'US',
          currency: 'USD',
          account_holder_name: 'John Doe',
          routing_number: '110000000',
          account_number: '000123456789'
        }
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Failed to add payout method');
      expect(data.details).toBe('Invalid bank account');
    });

    test('should cleanup Stripe account on database failure', async () => {
      // Mock database insert to fail
      jest.doMock('@/utils/supabase/server', () => ({
        createClient: () => ({
          ...mockSupabaseAuth(TEST_USERS.VERIFIED),
          from: (table) => {
            if (table === 'payout_methods') {
              return {
                insert: () => ({
                  select: () => ({
                    single: jest.fn().mockRejectedValue(new Error('Database error'))
                  })
                }),
                update: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ error: null })
                })
              };
            }
            return {
              insert: jest.fn().mockResolvedValue({ error: null }),
              update: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ error: null })
              })
            };
          }
        })
      }));

      const request = createMockRequest('POST', {
        type: 'bank_account',
        bank_account: {
          country: 'US',
          currency: 'USD',
          account_holder_name: 'John Doe',
          routing_number: '110000000',
          account_number: '000123456789'
        }
      });

      const response = await POST(request);
      expect(response.status).toBe(500);

      // Verify cleanup was attempted
      expect(mockStripe.accounts.deleteExternalAccount).toHaveBeenCalledWith(
        'acct_test_verified',
        'ba_test_mock'
      );
    });

    test('should log security events', async () => {
      const request = createMockRequest('POST', {
        type: 'bank_account',
        bank_account: {
          country: 'US',
          currency: 'USD',
          account_holder_name: 'John Doe',
          routing_number: '110000000',
          account_number: '000123456789'
        }
      });

      await POST(request);

      // Check security logs
      const { data: logs } = await supabase
        .from('withdrawal_security_logs')
        .select('*')
        .eq('user_id', TEST_USERS.VERIFIED)
        .eq('ip_address', '127.0.0.1')
        .order('created_at', { ascending: false })
        .limit(2);

      expect(logs).toHaveLength(2);
      expect(logs[0].event_type).toBe('success');
      expect(logs[1].event_type).toBe('attempt');
      expect(logs[0].metadata.action).toBe('add_payout_method');
    });
  });

  describe('GET /api/payout-methods', () => {
    beforeEach(async () => {
      // Create test payout methods
      await supabase.from('payout_methods').insert([
        {
          id: `${testId}-1`,
          user_id: TEST_USERS.VERIFIED,
          stripe_external_account_id: `ba_test_${testId}_1`,
          stripe_account_id: 'acct_test_verified',
          method_type: 'bank_account',
          last_four: '1234',
          bank_name: 'Test Bank 1',
          country: 'US',
          currency: 'USD',
          is_default: true,
          is_verified: true,
          verification_status: 'verified',
          added_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: `${testId}-2`,
          user_id: TEST_USERS.VERIFIED,
          stripe_external_account_id: `card_test_${testId}_2`,
          stripe_account_id: 'acct_test_verified',
          method_type: 'debit_card',
          last_four: '4242',
          country: 'US',
          currency: 'USD',
          is_default: false,
          is_verified: false,
          verification_status: 'pending',
          added_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() // 1 hour ago
        }
      ]);
    });

    test('should list user payout methods', async () => {
      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.payout_methods).toHaveLength(2);

      const bankAccount = data.payout_methods.find(m => m.type === 'bank_account');
      const debitCard = data.payout_methods.find(m => m.type === 'debit_card');

      expect(bankAccount).toBeDefined();
      expect(bankAccount.last_four).toBe('1234');
      expect(bankAccount.bank_name).toBe('Test Bank 1');
      expect(bankAccount.is_default).toBe(true);
      expect(bankAccount.is_verified).toBe(true);

      expect(debitCard).toBeDefined();
      expect(debitCard.last_four).toBe('4242');
      expect(debitCard.is_default).toBe(false);
      expect(debitCard.is_verified).toBe(false);
    });

    test('should return withdrawal eligibility status', async () => {
      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('can_withdraw');
      expect(data).toHaveProperty('withdrawal_hold_until');
      expect(data).toHaveProperty('default_payout_method_id');
    });

    test('should show withdrawal hold when recent method added', async () => {
      // Update profile with recent hold
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      await supabase
        .from('profiles')
        .update({ withdrawal_hold_until: futureDate })
        .eq('id', TEST_USERS.VERIFIED);

      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile.mockResolvedValueOnce({
        id: TEST_USERS.VERIFIED,
        withdrawal_hold_until: futureDate
      });

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(data.can_withdraw).toBe(false);
      expect(data.withdrawal_hold_until).toBe(futureDate);
    });

    test('should handle user with no payout methods', async () => {
      // Use different user with no methods
      jest.doMock('@/utils/supabase/server', () => ({
        createClient: () => mockSupabaseAuth(TEST_USERS.NEW)
      }));

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.payout_methods).toHaveLength(0);
      expect(data.default_payout_method_id).toBeNull();
    });

    test('should handle database errors', async () => {
      // Mock database select to fail
      jest.doMock('@/utils/supabase/server', () => ({
        createClient: () => ({
          ...mockSupabaseAuth(TEST_USERS.VERIFIED),
          from: () => ({
            select: () => ({
              eq: () => ({
                order: jest.fn().mockRejectedValue(new Error('Database error'))
              })
            })
          })
        })
      }));

      const request = createMockRequest('GET');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch payout methods');
    });
  });

  describe('Input Validation', () => {
    test('should validate bank account fields', async () => {
      const validBankAccount = {
        type: 'bank_account',
        bank_account: {
          country: 'US',
          currency: 'USD',
          account_holder_name: 'John Doe',
          account_holder_type: 'individual',
          routing_number: '110000000',
          account_number: '000123456789'
        }
      };

      const request = createMockRequest('POST', validBankAccount);
      const response = await POST(request);
      expect(response.status).toBe(200);

      // Test with company type
      validBankAccount.bank_account.account_holder_type = 'company';
      const request2 = createMockRequest('POST', validBankAccount);
      const response2 = await POST(request2);
      expect(response2.status).toBe(200);
    });

    test('should validate debit card fields', async () => {
      mockStripe.accounts.createExternalAccount.mockResolvedValueOnce({
        id: 'card_test_mock',
        object: 'card',
        last4: '4242',
        country: 'US',
        currency: 'usd'
      });

      const validDebitCard = {
        type: 'debit_card',
        debit_card: {
          number: '4242424242424242',
          exp_month: 12,
          exp_year: 2025,
          cvc: '123'
        }
      };

      const request = createMockRequest('POST', validDebitCard);
      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    test('should reject invalid card numbers', async () => {
      const invalidCard = {
        type: 'debit_card',
        debit_card: {
          number: '1234', // Too short
          exp_month: 12,
          exp_year: 2025,
          cvc: '123'
        }
      };

      const request = createMockRequest('POST', invalidCard);
      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    test('should reject invalid expiry dates', async () => {
      const invalidCard = {
        type: 'debit_card',
        debit_card: {
          number: '4242424242424242',
          exp_month: 13, // Invalid month
          exp_year: 2025,
          cvc: '123'
        }
      };

      const request = createMockRequest('POST', invalidCard);
      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    test('should reject invalid CVC', async () => {
      const invalidCard = {
        type: 'debit_card',
        debit_card: {
          number: '4242424242424242',
          exp_month: 12,
          exp_year: 2025,
          cvc: '12' // Too short
        }
      };

      const request = createMockRequest('POST', invalidCard);
      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });

  describe('Security Features', () => {
    test('should capture IP and user agent', async () => {
      const request = createMockRequest('POST', {
        type: 'bank_account',
        bank_account: {
          country: 'US',
          currency: 'USD',
          account_holder_name: 'John Doe',
          routing_number: '110000000',
          account_number: '000123456789'
        }
      }, {
        'x-forwarded-for': '192.168.1.100',
        'user-agent': 'Custom Browser/1.0'
      });

      await POST(request);

      // Check stored metadata
      const { data: method } = await supabase
        .from('payout_methods')
        .select('metadata')
        .eq('stripe_external_account_id', 'ba_test_mock')
        .single();

      expect(method.metadata).toHaveProperty('created_from_ip', '192.168.1.100');
      expect(method.metadata).toHaveProperty('user_agent', 'Custom Browser/1.0');
    });

    test('should sanitize sensitive data in stored metadata', async () => {
      const request = createMockRequest('POST', {
        type: 'bank_account',
        bank_account: {
          country: 'US',
          currency: 'USD',
          account_holder_name: 'John Doe',
          routing_number: '110000000',
          account_number: '000123456789'
        }
      });

      await POST(request);

      const { data: method } = await supabase
        .from('payout_methods')
        .select('*')
        .eq('stripe_external_account_id', 'ba_test_mock')
        .single();

      // Verify sensitive data is not stored directly
      expect(method.metadata).not.toHaveProperty('account_number');
      expect(method.metadata).not.toHaveProperty('routing_number');
      expect(method.last_four).toBe('6789');
      expect(method.routing_number_last_four).toBeNull(); // Not set in mock
    });
  });
});