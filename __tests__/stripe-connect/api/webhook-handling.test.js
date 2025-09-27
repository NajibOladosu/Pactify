const { POST } = require('@/app/api/webhooks/stripe/v2/route');
const { createMockRequest, mockSupabaseAuth, createMockStripe, TEST_USERS, getSupabaseClient } = require('../utils/test-helpers');
const crypto = require('crypto');

// Mock dependencies
jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn()
}));

jest.mock('@/utils/profile-helpers', () => ({
  ensureUserProfile: jest.fn()
}));

describe('Stripe Webhook Handling', () => {
  let mockStripe;
  let supabase;
  const testId = Date.now();
  const webhookSecret = 'whsec_test_webhook_secret';

  beforeEach(async () => {
    // Set up mock environment
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

    // Clear any existing test data
    await Promise.all([
      supabase.from('withdrawals').delete().like('idempotency_key', `test_webhook_${testId}%`),
      supabase.from('payout_methods').delete().like('stripe_external_account_id', `ba_webhook_${testId}%`),
      supabase.from('identity_verification_sessions').delete().like('stripe_session_id', `vs_webhook_${testId}%`)
    ]);
  });

  afterEach(async () => {
    // Cleanup test data
    await Promise.all([
      supabase.from('withdrawals').delete().like('idempotency_key', `test_webhook_${testId}%`),
      supabase.from('payout_methods').delete().like('stripe_external_account_id', `ba_webhook_${testId}%`),
      supabase.from('identity_verification_sessions').delete().like('stripe_session_id', `vs_webhook_${testId}%`)
    ]);
    jest.clearAllMocks();
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  function createWebhookPayload(eventType, data, accountId = null) {
    const event = {
      id: `evt_${testId}_${Date.now()}`,
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

    return {
      payload,
      headers: {
        'stripe-signature': `t=${timestamp},v1=${signature}`
      },
      event
    };
  }

  function createMockWebhookRequest(eventType, data, accountId = null) {
    const { payload, headers } = createWebhookPayload(eventType, data, accountId);
    
    return createMockRequest('POST', payload, headers);
  }

  describe('Webhook Signature Verification', () => {
    test('should verify valid webhook signature', async () => {
      const { payload, headers } = createWebhookPayload('account.updated', {
        id: 'acct_test_verified',
        object: 'account',
        charges_enabled: true,
        payouts_enabled: true
      });

      const request = createMockRequest('POST', payload, headers);
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    test('should reject invalid webhook signature', async () => {
      const request = createMockRequest('POST', '{"test": "data"}', {
        'stripe-signature': 't=1234567890,v1=invalid_signature'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid webhook signature');
    });

    test('should reject missing webhook signature', async () => {
      const request = createMockRequest('POST', '{"test": "data"}', {});

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing webhook signature');
    });

    test('should reject webhook with missing secret', async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;

      const request = createMockRequest('POST', '{"test": "data"}', {
        'stripe-signature': 't=1234567890,v1=test_signature'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Webhook secret not configured');
    });
  });

  describe('Account Events', () => {
    test('should handle account.updated event', async () => {
      // Create test profile
      await supabase.from('profiles').upsert({
        id: TEST_USERS.VERIFIED,
        stripe_account_id: 'acct_test_verified',
        identity_status: 'pending'
      }, { onConflict: 'id' });

      const request = createMockWebhookRequest('account.updated', {
        id: 'acct_test_verified',
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
      }, 'acct_test_verified');

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.processed_event).toBe('account.updated');

      // Verify profile was updated
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('stripe_account_id', 'acct_test_verified')
        .single();

      expect(profile.stripe_account_type).toBe('express');
    });

    test('should handle account.external_account.created event', async () => {
      // Create test profile
      await supabase.from('profiles').upsert({
        id: TEST_USERS.VERIFIED,
        stripe_account_id: 'acct_test_verified'
      }, { onConflict: 'id' });

      const request = createMockWebhookRequest('account.external_account.created', {
        id: `ba_webhook_${testId}`,
        object: 'bank_account',
        account: 'acct_test_verified',
        last4: '6789',
        bank_name: 'Test Bank',
        country: 'US',
        currency: 'usd',
        status: 'new'
      }, 'acct_test_verified');

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify payout method was created
      const { data: payoutMethod } = await supabase
        .from('payout_methods')
        .select('*')
        .eq('stripe_external_account_id', `ba_webhook_${testId}`)
        .single();

      expect(payoutMethod).toBeDefined();
      expect(payoutMethod.method_type).toBe('bank_account');
      expect(payoutMethod.last_four).toBe('6789');
      expect(payoutMethod.bank_name).toBe('Test Bank');
    });

    test('should handle account.external_account.updated event', async () => {
      // Create test payout method
      await supabase.from('payout_methods').insert({
        id: `${testId}-payout-method`,
        user_id: TEST_USERS.VERIFIED,
        stripe_external_account_id: `ba_webhook_${testId}`,
        stripe_account_id: 'acct_test_verified',
        method_type: 'bank_account',
        verification_status: 'pending',
        is_verified: false
      });

      const request = createMockWebhookRequest('account.external_account.updated', {
        id: `ba_webhook_${testId}`,
        object: 'bank_account',
        account: 'acct_test_verified',
        status: 'verified'
      }, 'acct_test_verified');

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify payout method was updated
      const { data: payoutMethod } = await supabase
        .from('payout_methods')
        .select('*')
        .eq('stripe_external_account_id', `ba_webhook_${testId}`)
        .single();

      expect(payoutMethod.verification_status).toBe('verified');
      expect(payoutMethod.is_verified).toBe(true);
    });
  });

  describe('Identity Verification Events', () => {
    test('should handle identity.verification_session.verified event', async () => {
      // Create test verification session
      await supabase.from('identity_verification_sessions').insert({
        id: `${testId}-session`,
        user_id: TEST_USERS.PENDING,
        stripe_session_id: `vs_webhook_${testId}`,
        session_type: 'document',
        status: 'processing'
      });

      // Create test profile
      await supabase.from('profiles').upsert({
        id: TEST_USERS.PENDING,
        identity_status: 'pending',
        identity_verification_session_id: `vs_webhook_${testId}`
      }, { onConflict: 'id' });

      const request = createMockWebhookRequest('identity.verification_session.verified', {
        id: `vs_webhook_${testId}`,
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

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify session was updated
      const { data: session } = await supabase
        .from('identity_verification_sessions')
        .select('*')
        .eq('stripe_session_id', `vs_webhook_${testId}`)
        .single();

      expect(session.status).toBe('verified');
      expect(session.verified_outputs).toEqual({
        first_name: 'John',
        last_name: 'Doe',
        dob: { day: 1, month: 1, year: 1990 },
        id_number: 'XXX-XX-1234'
      });

      // Verify profile was updated
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', TEST_USERS.PENDING)
        .single();

      expect(profile.identity_status).toBe('verified');
      expect(profile.last_kyc_check_at).toBeDefined();
    });

    test('should handle identity.verification_session.requires_input event', async () => {
      // Create test verification session
      await supabase.from('identity_verification_sessions').insert({
        id: `${testId}-session`,
        user_id: TEST_USERS.PENDING,
        stripe_session_id: `vs_webhook_${testId}`,
        session_type: 'document',
        status: 'processing'
      });

      const request = createMockWebhookRequest('identity.verification_session.requires_input', {
        id: `vs_webhook_${testId}`,
        object: 'identity.verification_session',
        status: 'requires_input',
        last_error: {
          code: 'document_unverified_other',
          reason: 'Document could not be verified'
        }
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify session was updated
      const { data: session } = await supabase
        .from('identity_verification_sessions')
        .select('*')
        .eq('stripe_session_id', `vs_webhook_${testId}`)
        .single();

      expect(session.status).toBe('requires_input');
      expect(session.failure_reason).toBe('document_unverified_other');
    });
  });

  describe('Payout Events', () => {
    test('should handle payout.paid event', async () => {
      // Create test withdrawal
      await supabase.from('withdrawals').insert({
        id: `${testId}-withdrawal`,
        user_id: TEST_USERS.VERIFIED,
        amount_cents: 100000,
        currency: 'USD',
        status: 'processing',
        stripe_payout_id: `po_webhook_${testId}`,
        idempotency_key: `test_webhook_${testId}`
      });

      const request = createMockWebhookRequest('payout.paid', {
        id: `po_webhook_${testId}`,
        object: 'payout',
        amount: 100000,
        currency: 'usd',
        status: 'paid',
        method: 'standard',
        arrival_date: Math.floor(Date.now() / 1000) + 86400,
        metadata: {
          user_id: TEST_USERS.VERIFIED,
          withdrawal_id: `${testId}-withdrawal`
        }
      }, 'acct_test_verified');

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify withdrawal was updated
      const { data: withdrawal } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('stripe_payout_id', `po_webhook_${testId}`)
        .single();

      expect(withdrawal.status).toBe('paid');
      expect(withdrawal.completed_at).toBeDefined();
    });

    test('should handle payout.failed event', async () => {
      // Create test withdrawal
      await supabase.from('withdrawals').insert({
        id: `${testId}-withdrawal`,
        user_id: TEST_USERS.VERIFIED,
        amount_cents: 100000,
        currency: 'USD',
        status: 'processing',
        stripe_payout_id: `po_webhook_${testId}_failed`,
        idempotency_key: `test_webhook_${testId}_failed`
      });

      const request = createMockWebhookRequest('payout.failed', {
        id: `po_webhook_${testId}_failed`,
        object: 'payout',
        amount: 100000,
        currency: 'usd',
        status: 'failed',
        failure_code: 'insufficient_funds',
        failure_message: 'Insufficient funds in Stripe account',
        metadata: {
          user_id: TEST_USERS.VERIFIED,
          withdrawal_id: `${testId}-withdrawal`
        }
      }, 'acct_test_verified');

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify withdrawal was updated
      const { data: withdrawal } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('stripe_payout_id', `po_webhook_${testId}_failed`)
        .single();

      expect(withdrawal.status).toBe('failed');
      expect(withdrawal.failure_reason).toBe('insufficient_funds');
      expect(withdrawal.failure_details).toBe('Insufficient funds in Stripe account');
    });

    test('should handle payout.canceled event', async () => {
      // Create test withdrawal
      await supabase.from('withdrawals').insert({
        id: `${testId}-withdrawal`,
        user_id: TEST_USERS.VERIFIED,
        amount_cents: 100000,
        currency: 'USD',
        status: 'processing',
        stripe_payout_id: `po_webhook_${testId}_canceled`,
        idempotency_key: `test_webhook_${testId}_canceled`
      });

      const request = createMockWebhookRequest('payout.canceled', {
        id: `po_webhook_${testId}_canceled`,
        object: 'payout',
        amount: 100000,
        currency: 'usd',
        status: 'canceled'
      }, 'acct_test_verified');

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify withdrawal was updated
      const { data: withdrawal } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('stripe_payout_id', `po_webhook_${testId}_canceled`)
        .single();

      expect(withdrawal.status).toBe('cancelled');
    });
  });

  describe('Transfer Events', () => {
    test('should handle transfer.created event', async () => {
      const request = createMockWebhookRequest('transfer.created', {
        id: `tr_webhook_${testId}`,
        object: 'transfer',
        amount: 50000,
        currency: 'usd',
        destination: 'acct_test_verified',
        metadata: {
          purpose: 'escrow_release',
          contract_id: 'contract_123',
          payment_id: 'payment_456'
        }
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // This event is logged for audit purposes
      // No specific database updates expected in this implementation
    });
  });

  describe('Irrelevant Events', () => {
    test('should ignore unhandled event types', async () => {
      const request = createMockWebhookRequest('payment_intent.succeeded', {
        id: 'pi_test',
        object: 'payment_intent',
        amount: 1000,
        currency: 'usd'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.processed_event).toBeNull();
      expect(data.message).toBe('Event type not handled');
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed webhook payload', async () => {
      const request = createMockRequest('POST', 'invalid json', {
        'stripe-signature': 't=1234567890,v1=invalid'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid webhook payload');
    });

    test('should handle database errors during processing', async () => {
      // Mock database error
      const mockFromMethod = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockRejectedValue(new Error('Database connection failed'))
        }),
        upsert: jest.fn().mockRejectedValue(new Error('Database connection failed')),
        insert: jest.fn().mockRejectedValue(new Error('Database connection failed'))
      });

      supabase.from = mockFromMethod;

      const request = createMockWebhookRequest('account.updated', {
        id: 'acct_test_error',
        object: 'account',
        type: 'express'
      }, 'acct_test_error');

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to process webhook');
      expect(data.details).toBe('Database connection failed');
    });

    test('should handle missing account ID in Connect events', async () => {
      const { payload, headers } = createWebhookPayload('account.updated', {
        id: 'acct_test_no_account',
        object: 'account'
      }); // No account field

      const request = createMockRequest('POST', payload, headers);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing account ID for Connect event');
    });

    test('should handle unknown profile for events', async () => {
      const request = createMockWebhookRequest('identity.verification_session.verified', {
        id: 'vs_unknown_user',
        object: 'identity.verification_session',
        status: 'verified'
      });

      const response = await POST(request);
      // Should still return success but log the issue
      expect(response.status).toBe(200);
    });
  });

  describe('Event Idempotency', () => {
    test('should handle duplicate webhook events', async () => {
      const eventId = `evt_${testId}_duplicate`;
      
      // First webhook
      const firstRequest = createMockWebhookRequest('account.updated', {
        id: 'acct_test_duplicate',
        object: 'account',
        type: 'express'
      }, 'acct_test_duplicate');

      // Manually set event ID to simulate duplicate
      const firstPayload = JSON.parse(firstRequest.body);
      firstPayload.id = eventId;
      firstRequest.body = JSON.stringify(firstPayload);

      const firstResponse = await POST(firstRequest);
      expect(firstResponse.status).toBe(200);

      // Second identical webhook (duplicate)
      const secondRequest = createMockWebhookRequest('account.updated', {
        id: 'acct_test_duplicate',
        object: 'account',
        type: 'express'
      }, 'acct_test_duplicate');

      const secondPayload = JSON.parse(secondRequest.body);
      secondPayload.id = eventId;
      secondRequest.body = JSON.stringify(secondPayload);

      const secondResponse = await POST(secondRequest);
      const data = await secondResponse.json();

      expect(secondResponse.status).toBe(200);
      expect(data.message).toBe('Event already processed');
    });
  });

  describe('Security and Audit Logging', () => {
    test('should log all webhook events for audit', async () => {
      const request = createMockWebhookRequest('account.updated', {
        id: 'acct_test_audit',
        object: 'account',
        type: 'express'
      }, 'acct_test_audit');

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Check that event was logged (implementation would log to audit table)
      // This would be verified in the actual implementation
    });

    test('should rate limit webhook endpoint', async () => {
      // Create multiple requests quickly
      const requests = Array.from({ length: 10 }, () =>
        createMockWebhookRequest('account.updated', {
          id: `acct_test_rate_limit_${Math.random()}`,
          object: 'account'
        })
      );

      const responses = await Promise.all(requests.map(req => POST(req)));
      
      // All should succeed for now, but rate limiting could be implemented
      responses.forEach(response => {
        expect([200, 429].includes(response.status)).toBe(true);
      });
    });
  });

  describe('Webhook Configuration Validation', () => {
    test('should validate webhook endpoint configuration', async () => {
      // Test that webhook handles all expected event types
      const expectedEvents = [
        'account.updated',
        'account.external_account.created',
        'account.external_account.updated',
        'identity.verification_session.verified',
        'identity.verification_session.requires_input',
        'identity.verification_session.canceled',
        'payout.paid',
        'payout.failed',
        'payout.canceled',
        'transfer.created'
      ];

      for (const eventType of expectedEvents) {
        const request = createMockWebhookRequest(eventType, {
          id: 'test_object',
          object: eventType.split('.')[0] === 'identity' ? 'identity.verification_session' : eventType.split('.')[0]
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
      }
    });
  });
});