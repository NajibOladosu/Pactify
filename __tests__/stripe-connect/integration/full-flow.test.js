const { POST: createAccount, GET: getAccountStatus } = require('@/app/api/connect/v2/create-account/route');
const { POST: createVerification, GET: getVerificationStatus } = require('@/app/api/identity/create-verification-session/route');
const { POST: addPayoutMethod, GET: getPayoutMethods } = require('@/app/api/payout-methods/route');
const { POST: requestWithdrawal, GET: getWithdrawalEligibility } = require('@/app/api/withdrawals/v2/request/route');
const { POST: handleWebhook } = require('@/app/api/webhooks/stripe/v2/route');
const { createMockRequest, mockSupabaseAuth, createMockStripe, TEST_USERS, getSupabaseClient } = require('../utils/test-helpers');
const crypto = require('crypto');

// Mock dependencies
jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn()
}));

jest.mock('@/utils/profile-helpers', () => ({
  ensureUserProfile: jest.fn()
}));

describe('Stripe Connect Integration Flow', () => {
  let mockStripe;
  let supabase;
  const testId = Date.now();
  const webhookSecret = 'whsec_test_integration_secret';
  
  // Test user data
  const testUser = {
    id: `integration_user_${testId}`,
    email: `integration_${testId}@test.example.com`
  };

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    
    mockStripe = createMockStripe();
    supabase = getSupabaseClient();
    
    // Mock Stripe module
    jest.doMock('stripe', () => ({
      __esModule: true,
      default: jest.fn(() => mockStripe)
    }));

    // Setup mock Supabase client
    const { createClient } = require('@/utils/supabase/server');
    createClient.mockReturnValue(supabase);

    // Create test user profile
    await supabase.from('profiles').upsert({
      id: testUser.id,
      email: testUser.email,
      created_at: new Date().toISOString(),
      identity_status: 'unstarted',
      stripe_account_id: null
    }, { onConflict: 'id' });
  });

  afterAll(async () => {
    // Cleanup test data
    await Promise.all([
      supabase.from('withdrawals').delete().like('idempotency_key', `integration_${testId}%`),
      supabase.from('payout_methods').delete().like('stripe_external_account_id', `ba_integration_${testId}%`),
      supabase.from('identity_verification_sessions').delete().like('stripe_session_id', `vs_integration_${testId}%`),
      supabase.from('withdrawal_security_logs').delete().like('metadata->test_id', testId.toString()),
      supabase.from('profiles').delete().eq('id', testUser.id)
    ]);
    
    delete process.env.STRIPE_WEBHOOK_SECRET;
    jest.clearAllMocks();
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Setup profile helper mock
    const mockProfileHelper = require('@/utils/profile-helpers');
    mockProfileHelper.ensureUserProfile.mockImplementation(async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', testUser.id).single();
      return data;
    });
  });

  function createWebhookRequest(eventType, data, accountId = null) {
    const event = {
      id: `evt_integration_${testId}_${Date.now()}`,
      object: 'event',
      created: Math.floor(Date.now() / 1000),
      type: eventType,
      data: { object: data },
      ...(accountId && { account: accountId })
    };

    const payload = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    return createMockRequest('POST', payload, {
      'stripe-signature': `t=${timestamp},v1=${signature}`
    });
  }

  function mockSupabaseForUser(userId) {
    jest.doMock('@/utils/supabase/server', () => ({
      createClient: () => mockSupabaseAuth(userId)
    }));
  }

  describe('Complete User Onboarding Flow', () => {
    test('should complete full onboarding flow: account → identity → payout method → withdrawal', async () => {
      const stripeAccountId = `acct_integration_${testId}`;
      const verificationSessionId = `vs_integration_${testId}`;
      const payoutMethodId = `ba_integration_${testId}`;
      const withdrawalId = `withdrawal_integration_${testId}`;

      // Mock auth for test user
      mockSupabaseForUser(testUser.id);

      // STEP 1: Create Stripe Connect account
      console.log('Step 1: Creating Stripe Connect account...');
      
      mockStripe.accounts.create.mockResolvedValueOnce({
        id: stripeAccountId,
        object: 'account',
        type: 'express',
        email: testUser.email,
        charges_enabled: false,
        payouts_enabled: false,
        requirements: {
          currently_due: ['external_account', 'tos_acceptance'],
          past_due: [],
          pending_verification: []
        }
      });

      mockStripe.accountLinks.create.mockResolvedValueOnce({
        object: 'account_link',
        url: `https://connect.stripe.com/setup/e/${stripeAccountId}`,
        created: Math.floor(Date.now() / 1000),
        expires_at: Math.floor(Date.now() / 1000) + 1800
      });

      const createAccountRequest = createMockRequest('POST', {
        country: 'US',
        business_type: 'individual'
      });

      const createAccountResponse = await createAccount(createAccountRequest);
      const accountData = await createAccountResponse.json();

      expect(createAccountResponse.status).toBe(200);
      expect(accountData.success).toBe(true);
      expect(accountData.accountId).toBe(stripeAccountId);

      // Verify account was stored in database
      const { data: profile1 } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', testUser.id)
        .single();

      expect(profile1.stripe_account_id).toBe(stripeAccountId);
      expect(profile1.stripe_account_type).toBe('express');

      // STEP 2: Complete account onboarding via webhook
      console.log('Step 2: Simulating account onboarding completion...');
      
      const accountUpdateWebhook = createWebhookRequest('account.updated', {
        id: stripeAccountId,
        object: 'account',
        type: 'express',
        charges_enabled: true,
        payouts_enabled: true,
        capabilities: {
          transfers: 'active'
        },
        requirements: {
          currently_due: [],
          past_due: [],
          pending_verification: []
        }
      }, stripeAccountId);

      const webhookResponse1 = await handleWebhook(accountUpdateWebhook);
      expect(webhookResponse1.status).toBe(200);

      // STEP 3: Create identity verification session
      console.log('Step 3: Creating identity verification session...');
      
      mockStripe.identity.verificationSessions.create.mockResolvedValueOnce({
        id: verificationSessionId,
        object: 'identity.verification_session',
        client_secret: `${verificationSessionId}_secret_test`,
        type: 'document',
        status: 'requires_input',
        url: `https://js.stripe.com/v3/identity/${verificationSessionId}`,
        return_url: `https://example.com/dashboard/kyc/identity/complete`,
        options: {
          document: {
            allowed_types: ['driving_license', 'passport', 'id_card'],
            require_id_number: true,
            require_live_capture: true,
            require_matching_selfie: true
          }
        }
      });

      const createVerificationRequest = createMockRequest('POST', {
        type: 'document',
        return_url: 'https://example.com/complete'
      });

      const verificationResponse = await createVerification(createVerificationRequest);
      const verificationData = await verificationResponse.json();

      expect(verificationResponse.status).toBe(200);
      expect(verificationData.success).toBe(true);
      expect(verificationData.session.id).toBe(verificationSessionId);

      // Update profile status to pending
      await supabase
        .from('profiles')
        .update({ 
          identity_status: 'pending',
          identity_verification_session_id: verificationSessionId 
        })
        .eq('id', testUser.id);

      // STEP 4: Complete identity verification via webhook
      console.log('Step 4: Simulating identity verification completion...');
      
      const identityWebhook = createWebhookRequest('identity.verification_session.verified', {
        id: verificationSessionId,
        object: 'identity.verification_session',
        status: 'verified',
        type: 'document',
        verified_outputs: {
          first_name: 'John',
          last_name: 'Doe',
          dob: { day: 1, month: 1, year: 1990 },
          id_number: 'XXX-XX-1234'
        }
      });

      const webhookResponse2 = await handleWebhook(identityWebhook);
      expect(webhookResponse2.status).toBe(200);

      // Verify identity status updated
      const { data: profile2 } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', testUser.id)
        .single();

      expect(profile2.identity_status).toBe('verified');

      // STEP 5: Add payout method
      console.log('Step 5: Adding payout method...');
      
      mockStripe.accounts.createExternalAccount.mockResolvedValueOnce({
        id: payoutMethodId,
        object: 'bank_account',
        account: stripeAccountId,
        last4: '6789',
        bank_name: 'Test Bank',
        country: 'US',
        currency: 'usd',
        status: 'new'
      });

      const addPayoutRequest = createMockRequest('POST', {
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

      const payoutResponse = await addPayoutMethod(addPayoutRequest);
      const payoutData = await payoutResponse.json();

      expect(payoutResponse.status).toBe(200);
      expect(payoutData.success).toBe(true);
      expect(payoutData.payout_method.type).toBe('bank_account');

      // STEP 6: Verify payout method via webhook
      console.log('Step 6: Simulating payout method verification...');
      
      const payoutMethodWebhook = createWebhookRequest('account.external_account.updated', {
        id: payoutMethodId,
        object: 'bank_account',
        account: stripeAccountId,
        status: 'verified'
      }, stripeAccountId);

      const webhookResponse3 = await handleWebhook(payoutMethodWebhook);
      expect(webhookResponse3.status).toBe(200);

      // Wait for 72-hour hold to pass (simulate by updating database)
      await supabase
        .from('profiles')
        .update({ withdrawal_hold_until: null })
        .eq('id', testUser.id);

      await supabase
        .from('payout_methods')
        .update({ 
          is_verified: true, 
          verification_status: 'verified',
          added_at: new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString() // 73 hours ago
        })
        .eq('stripe_external_account_id', payoutMethodId);

      // STEP 7: Check withdrawal eligibility
      console.log('Step 7: Checking withdrawal eligibility...');
      
      // Mock balance function
      jest.doMock('@/utils/supabase/server', () => ({
        createClient: () => ({
          ...mockSupabaseAuth(testUser.id),
          rpc: jest.fn().mockImplementation((funcName) => {
            if (funcName === 'get_user_available_balance') {
              return Promise.resolve({
                data: [{ available_balance_cents: 200000 }], // $2,000 available
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
                      added_at: new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString(),
                      method_type: 'bank_account',
                      stripe_external_account_id: payoutMethodId
                    }] : [],
                    error: null
                  })
                })
              })
            })
          })
        })
      }));

      const eligibilityRequest = createMockRequest('GET');
      const eligibilityResponse = await getWithdrawalEligibility(eligibilityRequest);
      const eligibilityData = await eligibilityResponse.json();

      expect(eligibilityResponse.status).toBe(200);
      expect(eligibilityData.eligibility.can_withdraw).toBe(true);
      expect(eligibilityData.eligibility.available_balance_cents).toBe(200000);

      // STEP 8: Request withdrawal
      console.log('Step 8: Requesting withdrawal...');
      
      mockStripe.payouts.create.mockResolvedValueOnce({
        id: `po_integration_${testId}`,
        object: 'payout',
        amount: 150000,
        currency: 'usd',
        status: 'pending',
        method: 'standard',
        destination: payoutMethodId
      });

      // Mock database operations for withdrawal
      jest.doMock('@/utils/supabase/server', () => ({
        createClient: () => ({
          ...mockSupabaseAuth(testUser.id),
          rpc: jest.fn().mockImplementation((funcName) => {
            if (funcName === 'get_user_available_balance') {
              return Promise.resolve({
                data: [{ available_balance_cents: 200000 }],
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
                      added_at: new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString(),
                      method_type: 'bank_account',
                      stripe_external_account_id: payoutMethodId
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
                    id: withdrawalId,
                    user_id: testUser.id,
                    amount_cents: 150000,
                    currency: 'USD',
                    status: 'processing',
                    stripe_payout_id: `po_integration_${testId}`,
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

      const withdrawalRequest = createMockRequest('POST', {
        amount_cents: 150000, // $1,500
        currency: 'USD',
        payout_method_id: `${testId}-payout-method`,
        urgency: 'standard'
      });

      const withdrawalResponse = await requestWithdrawal(withdrawalRequest);
      const withdrawalData = await withdrawalResponse.json();

      expect(withdrawalResponse.status).toBe(200);
      expect(withdrawalData.success).toBe(true);
      expect(withdrawalData.withdrawal.amount_cents).toBe(150000);
      expect(withdrawalData.withdrawal.status).toBe('processing');

      // STEP 9: Complete withdrawal via webhook
      console.log('Step 9: Simulating withdrawal completion...');
      
      const payoutWebhook = createWebhookRequest('payout.paid', {
        id: `po_integration_${testId}`,
        object: 'payout',
        amount: 150000,
        currency: 'usd',
        status: 'paid',
        method: 'standard',
        arrival_date: Math.floor(Date.now() / 1000) + 86400,
        metadata: {
          user_id: testUser.id,
          withdrawal_id: withdrawalId
        }
      }, stripeAccountId);

      const webhookResponse4 = await handleWebhook(payoutWebhook);
      expect(webhookResponse4.status).toBe(200);

      console.log('✅ Full integration flow completed successfully!');
    }, 30000); // 30 second timeout for this comprehensive test
  });

  describe('Error Recovery Flows', () => {
    test('should handle identity verification failure and retry', async () => {
      const stripeAccountId = `acct_integration_retry_${testId}`;
      const sessionId1 = `vs_integration_failed_${testId}`;
      const sessionId2 = `vs_integration_retry_${testId}`;

      mockSupabaseForUser(testUser.id);

      // Set up account first
      await supabase
        .from('profiles')
        .update({ 
          stripe_account_id: stripeAccountId,
          identity_status: 'pending',
          identity_verification_session_id: sessionId1
        })
        .eq('id', testUser.id);

      // Simulate failed identity verification
      const failedWebhook = createWebhookRequest('identity.verification_session.requires_input', {
        id: sessionId1,
        object: 'identity.verification_session',
        status: 'requires_input',
        last_error: {
          code: 'document_unverified_other',
          reason: 'Document could not be verified'
        }
      });

      const webhookResponse1 = await handleWebhook(failedWebhook);
      expect(webhookResponse1.status).toBe(200);

      // Create new verification session for retry
      mockStripe.identity.verificationSessions.create.mockResolvedValueOnce({
        id: sessionId2,
        object: 'identity.verification_session',
        client_secret: `${sessionId2}_secret_test`,
        type: 'document',
        status: 'requires_input'
      });

      const retryRequest = createMockRequest('POST', {
        type: 'document'
      });

      const retryResponse = await createVerification(retryRequest);
      const retryData = await retryResponse.json();

      expect(retryResponse.status).toBe(200);
      expect(retryData.success).toBe(true);
      expect(retryData.session.id).toBe(sessionId2);

      // Simulate successful verification on retry
      const successWebhook = createWebhookRequest('identity.verification_session.verified', {
        id: sessionId2,
        object: 'identity.verification_session',
        status: 'verified',
        type: 'document'
      });

      const webhookResponse2 = await handleWebhook(successWebhook);
      expect(webhookResponse2.status).toBe(200);
    });

    test('should handle payout failure and account for returned funds', async () => {
      const stripeAccountId = `acct_integration_failure_${testId}`;
      const payoutId = `po_integration_failed_${testId}`;
      const withdrawalId = `withdrawal_failed_${testId}`;

      // Set up verified user
      await supabase
        .from('profiles')
        .update({ 
          stripe_account_id: stripeAccountId,
          identity_status: 'verified'
        })
        .eq('id', testUser.id);

      // Create withdrawal record
      await supabase.from('withdrawals').insert({
        id: withdrawalId,
        user_id: testUser.id,
        amount_cents: 100000,
        currency: 'USD',
        status: 'processing',
        stripe_payout_id: payoutId,
        idempotency_key: `integration_failed_${testId}`
      });

      // Simulate payout failure
      const failedPayoutWebhook = createWebhookRequest('payout.failed', {
        id: payoutId,
        object: 'payout',
        amount: 100000,
        currency: 'usd',
        status: 'failed',
        failure_code: 'account_closed',
        failure_message: 'The bank account has been closed',
        metadata: {
          user_id: testUser.id,
          withdrawal_id: withdrawalId
        }
      }, stripeAccountId);

      const webhookResponse = await handleWebhook(failedPayoutWebhook);
      expect(webhookResponse.status).toBe(200);

      // Verify withdrawal was marked as failed
      const { data: withdrawal } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('id', withdrawalId)
        .single();

      expect(withdrawal.status).toBe('failed');
      expect(withdrawal.failure_reason).toBe('account_closed');
    });
  });

  describe('Multi-User Scenarios', () => {
    test('should handle concurrent users without interference', async () => {
      const user1Id = `concurrent_user_1_${testId}`;
      const user2Id = `concurrent_user_2_${testId}`;
      
      // Create two test users
      await Promise.all([
        supabase.from('profiles').upsert({
          id: user1Id,
          email: `user1_${testId}@test.example.com`,
          identity_status: 'unstarted'
        }, { onConflict: 'id' }),
        supabase.from('profiles').upsert({
          id: user2Id,
          email: `user2_${testId}@test.example.com`,
          identity_status: 'unstarted'
        }, { onConflict: 'id' })
      ]);

      // Setup mocks for both users
      const mockProfileHelper = require('@/utils/profile-helpers');
      mockProfileHelper.ensureUserProfile
        .mockResolvedValueOnce({ id: user1Id, email: `user1_${testId}@test.example.com` })
        .mockResolvedValueOnce({ id: user2Id, email: `user2_${testId}@test.example.com` });

      // Create accounts for both users concurrently
      mockStripe.accounts.create
        .mockResolvedValueOnce({
          id: `acct_user1_${testId}`,
          object: 'account',
          type: 'express',
          email: `user1_${testId}@test.example.com`
        })
        .mockResolvedValueOnce({
          id: `acct_user2_${testId}`,
          object: 'account',
          type: 'express',
          email: `user2_${testId}@test.example.com`
        });

      mockStripe.accountLinks.create
        .mockResolvedValue({
          object: 'account_link',
          url: 'https://connect.stripe.com/setup/test',
          created: Math.floor(Date.now() / 1000),
          expires_at: Math.floor(Date.now() / 1000) + 1800
        });

      const requests = [
        createMockRequest('POST', { country: 'US', business_type: 'individual' }),
        createMockRequest('POST', { country: 'CA', business_type: 'individual' })
      ];

      const responses = await Promise.all([
        createAccount(requests[0]),
        createAccount(requests[1])
      ]);

      expect(responses[0].status).toBe(200);
      expect(responses[1].status).toBe(200);

      const data1 = await responses[0].json();
      const data2 = await responses[1].json();

      expect(data1.accountId).toBe(`acct_user1_${testId}`);
      expect(data2.accountId).toBe(`acct_user2_${testId}`);

      // Cleanup
      await Promise.all([
        supabase.from('profiles').delete().eq('id', user1Id),
        supabase.from('profiles').delete().eq('id', user2Id)
      ]);
    });
  });

  describe('Rate Limiting Integration', () => {
    test('should enforce rate limits across multiple API endpoints', async () => {
      mockSupabaseForUser(testUser.id);

      // Create multiple rapid requests to trigger rate limiting
      const rapidRequests = Array.from({ length: 6 }, () => 
        createMockRequest('POST', { country: 'US', business_type: 'individual' })
      );

      const responses = await Promise.all(
        rapidRequests.map(request => createAccount(request))
      );

      // At least some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Data Consistency', () => {
    test('should maintain data consistency across webhooks and API calls', async () => {
      const accountId = `acct_consistency_${testId}`;
      const sessionId = `vs_consistency_${testId}`;

      mockSupabaseForUser(testUser.id);

      // Create account
      await supabase
        .from('profiles')
        .update({ 
          stripe_account_id: accountId,
          identity_status: 'pending',
          identity_verification_session_id: sessionId
        })
        .eq('id', testUser.id);

      // Process webhook
      const webhook = createWebhookRequest('identity.verification_session.verified', {
        id: sessionId,
        object: 'identity.verification_session',
        status: 'verified'
      });

      await handleWebhook(webhook);

      // Check API status matches webhook updates
      mockStripe.accounts.retrieve.mockResolvedValueOnce({
        id: accountId,
        object: 'account',
        charges_enabled: true,
        payouts_enabled: true
      });

      const statusRequest = createMockRequest('GET');
      const statusResponse = await getAccountStatus(statusRequest);
      const statusData = await statusResponse.json();

      expect(statusResponse.status).toBe(200);
      expect(statusData.identity_status).toBe('verified');
      expect(statusData.account_id).toBe(accountId);
    });
  });
});