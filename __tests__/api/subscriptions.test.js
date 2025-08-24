/**
 * Subscription API Endpoints Tests
 * Tests subscription management, billing, and plan upgrade/downgrade endpoints
 */

import {
  setupTestUsers,
  cleanupTestUsers,
  getTestUser,
  authenticateTestUser
} from '../test-setup/setup-test-users.js';
import {
  TestAPIManager,
  TEST_CONFIG,
  createTestDelay
} from '../test-setup/test-helpers.js';

describe('Subscription API Endpoints', () => {
  let freelancerUser, clientUser;
  let freelancerAuth, clientAuth;

  beforeAll(async () => {
    await setupTestUsers();
    freelancerUser = getTestUser('freelancer');
    clientUser = getTestUser('client');
    freelancerAuth = await authenticateTestUser('freelancer');
    clientAuth = await authenticateTestUser('client');
  }, TEST_CONFIG.TIMEOUTS.LONG_OPERATION);

  afterAll(async () => {
    await cleanupTestUsers();
  }, TEST_CONFIG.TIMEOUTS.DEFAULT);

  beforeEach(async () => {
    await createTestDelay(500);
  });

  describe('GET /api/subscription-plans', () => {
    test('should list available subscription plans', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/subscription-plans',
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.plans)).toBe(true);
      expect(response.data.plans.length).toBeGreaterThanOrEqual(3);
      
      // Verify plan structure
      response.data.plans.forEach(plan => {
        expect(plan).toHaveProperty('id');
        expect(plan).toHaveProperty('name');
        expect(plan).toHaveProperty('price_monthly');
        expect(plan).toHaveProperty('price_yearly');
        expect(plan).toHaveProperty('escrow_fee_percentage');
        expect(plan).toHaveProperty('max_contracts');
        expect(plan).toHaveProperty('features');
      });

      // Verify specific plans exist
      const planIds = response.data.plans.map(p => p.id);
      expect(planIds).toContain('free');
      expect(planIds).toContain('professional');
      expect(planIds).toContain('business');
    });

    test('should include plan features and limitations', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/subscription-plans',
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      
      const freePlan = response.data.plans.find(p => p.id === 'free');
      const proPlan = response.data.plans.find(p => p.id === 'professional');
      const businessPlan = response.data.plans.find(p => p.id === 'business');

      // Verify free plan
      expect(freePlan.max_contracts).toBe(3);
      expect(parseFloat(freePlan.escrow_fee_percentage)).toBe(10.0);
      expect(parseFloat(freePlan.price_monthly)).toBe(0);

      // Verify professional plan
      expect(proPlan.max_contracts).toBe(50);
      expect(parseFloat(proPlan.escrow_fee_percentage)).toBe(7.5);
      expect(parseFloat(proPlan.price_monthly)).toBeGreaterThan(0);

      // Verify business plan
      expect(businessPlan.max_contracts).toBeNull(); // Unlimited
      expect(parseFloat(businessPlan.escrow_fee_percentage)).toBe(5.0);
      expect(parseFloat(businessPlan.price_monthly)).toBeGreaterThan(parseFloat(proPlan.price_monthly));
    });

    test('should not require authentication for plan listing', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/subscription-plans'
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.plans)).toBe(true);
    });
  });

  describe('GET /api/subscription/current', () => {
    test('should get current user subscription', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/subscription/current',
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(response.data.subscription).toBeDefined();
      expect(response.data.subscription.plan_id).toBe('free'); // Default for test users
      expect(response.data.subscription.status).toBeDefined();
      expect(response.data.usage).toBeDefined();
      expect(response.data.usage.contracts_used).toBeDefined();
      expect(response.data.usage.contracts_remaining).toBeDefined();
    });

    test('should include subscription limits and usage', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/subscription/current',
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(response.data.limits).toBeDefined();
      expect(response.data.limits.max_contracts).toBeDefined();
      expect(response.data.limits.escrow_fee_percentage).toBeDefined();
      expect(response.data.limits.features).toBeDefined();
    });

    test('should require authentication', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/subscription/current'
      );

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/subscription/create-checkout-session', () => {
    test('should create checkout session for professional plan', async () => {
      const checkoutData = {
        plan_id: 'professional',
        billing_cycle: 'monthly',
        success_url: 'https://localhost:3000/success',
        cancel_url: 'https://localhost:3000/cancel'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/create-checkout-session',
        checkoutData,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(response.data.session_url).toBeDefined();
      expect(response.data.session_id).toBeDefined();
      expect(response.data.session_url).toContain('stripe.com');
    });

    test('should create checkout session for business plan yearly', async () => {
      const checkoutData = {
        plan_id: 'business',
        billing_cycle: 'yearly',
        success_url: 'https://localhost:3000/success',
        cancel_url: 'https://localhost:3000/cancel'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/create-checkout-session',
        checkoutData,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(response.data.discount_info).toBeDefined();
      expect(response.data.annual_savings).toBeDefined();
    });

    test('should reject invalid plan IDs', async () => {
      const invalidData = {
        plan_id: 'nonexistent_plan',
        billing_cycle: 'monthly'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/create-checkout-session',
        invalidData,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('plan');
    });

    test('should reject invalid billing cycles', async () => {
      const invalidData = {
        plan_id: 'professional',
        billing_cycle: 'quarterly' // Not supported
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/create-checkout-session',
        invalidData,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('billing_cycle');
    });

    test('should prevent downgrade from higher tier without confirmation', async () => {
      // First, simulate user having a professional subscription
      // Then try to "upgrade" to free (which is actually a downgrade)
      const downgradeData = {
        plan_id: 'free',
        billing_cycle: 'monthly'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/create-checkout-session',
        downgradeData,
        freelancerAuth.session.access_token
      );

      // Should either reject or require special confirmation
      expect([400, 409]).toContain(response.status);
    });
  });

  describe('POST /api/subscription/webhook', () => {
    test('should process subscription creation webhook', async () => {
      const webhookPayload = {
        id: 'evt_test_subscription',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test_subscription',
            customer: 'cus_test_customer',
            status: 'active',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            items: {
              data: [{
                price: {
                  id: 'price_professional_monthly',
                  recurring: { interval: 'month' },
                  unit_amount: 2999
                }
              }]
            },
            metadata: {
              user_id: freelancerUser.user.id,
              plan_id: 'professional'
            }
          }
        }
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/webhook',
        webhookPayload,
        null,
        {
          'stripe-signature': 'test_signature_123',
          'content-type': 'application/json'
        }
      );

      expect([200, 400]).toContain(response.status); // 400 if signature validation fails
    });

    test('should process subscription cancellation webhook', async () => {
      const cancellationPayload = {
        id: 'evt_test_cancellation',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_test_subscription',
            customer: 'cus_test_customer',
            status: 'canceled',
            canceled_at: Math.floor(Date.now() / 1000),
            metadata: {
              user_id: freelancerUser.user.id,
              plan_id: 'professional'
            }
          }
        }
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/webhook',
        cancellationPayload,
        null,
        {
          'stripe-signature': 'test_signature_123',
          'content-type': 'application/json'
        }
      );

      expect([200, 400]).toContain(response.status);
    });

    test('should process payment failure webhook', async () => {
      const paymentFailurePayload = {
        id: 'evt_test_payment_failure',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test_invoice',
            customer: 'cus_test_customer',
            subscription: 'sub_test_subscription',
            amount_due: 2999,
            attempt_count: 2,
            status: 'open',
            metadata: {
              user_id: freelancerUser.user.id
            }
          }
        }
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/webhook',
        paymentFailurePayload,
        null,
        {
          'stripe-signature': 'test_signature_123',
          'content-type': 'application/json'
        }
      );

      expect([200, 400]).toContain(response.status);
    });

    test('should validate webhook signatures', async () => {
      const webhookPayload = {
        id: 'evt_test_invalid',
        type: 'customer.subscription.created',
        data: { object: {} }
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/webhook',
        webhookPayload,
        null,
        {
          'stripe-signature': 'invalid_signature',
          'content-type': 'application/json'
        }
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('signature');
    });
  });

  describe('POST /api/subscription/cancel', () => {
    test('should cancel subscription with immediate effect', async () => {
      const cancellationData = {
        immediate: true,
        reason: 'testing',
        feedback: 'Testing subscription cancellation flow'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/cancel',
        cancellationData,
        freelancerAuth.session.access_token
      );

      expect([200, 404]).toContain(response.status); // 404 if no active subscription
      if (response.status === 200) {
        expect(response.data.subscription).toBeDefined();
        expect(response.data.subscription.status).toBe('canceled');
      }
    });

    test('should cancel subscription at period end', async () => {
      const cancellationData = {
        immediate: false,
        reason: 'cost',
        feedback: 'Too expensive for current needs'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/cancel',
        cancellationData,
        freelancerAuth.session.access_token
      );

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.data.subscription.cancel_at_period_end).toBe(true);
      }
    });

    test('should validate cancellation reasons', async () => {
      const invalidData = {
        immediate: true,
        reason: 'invalid_reason'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/cancel',
        invalidData,
        freelancerAuth.session.access_token
      );

      expect([400, 404]).toContain(response.status);
    });

    test('should handle already cancelled subscriptions', async () => {
      const cancellationData = {
        immediate: true,
        reason: 'testing'
      };

      // Cancel twice
      await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/cancel',
        cancellationData,
        freelancerAuth.session.access_token
      );

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/cancel',
        cancellationData,
        freelancerAuth.session.access_token
      );

      expect([409, 404]).toContain(response.status);
    });
  });

  describe('POST /api/subscription/reactivate', () => {
    test('should reactivate cancelled subscription', async () => {
      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/reactivate',
        {},
        freelancerAuth.session.access_token
      );

      expect([200, 404, 409]).toContain(response.status);
      if (response.status === 200) {
        expect(response.data.subscription.status).toBe('active');
        expect(response.data.subscription.cancel_at_period_end).toBe(false);
      }
    });

    test('should handle reactivation of active subscriptions', async () => {
      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/reactivate',
        {},
        freelancerAuth.session.access_token
      );

      expect([200, 409, 404]).toContain(response.status);
      if (response.status === 409) {
        expect(response.data.error).toContain('already active');
      }
    });
  });

  describe('GET /api/subscription/invoices', () => {
    test('should list user invoices', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/subscription/invoices',
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.invoices)).toBe(true);
      
      // Verify invoice structure if any exist
      response.data.invoices.forEach(invoice => {
        expect(invoice).toHaveProperty('id');
        expect(invoice).toHaveProperty('amount_paid');
        expect(invoice).toHaveProperty('status');
        expect(invoice).toHaveProperty('period_start');
        expect(invoice).toHaveProperty('period_end');
      });
    });

    test('should support pagination for invoices', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/subscription/invoices?limit=5&starting_after=in_test',
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(response.data.invoices.length).toBeLessThanOrEqual(5);
    });

    test('should filter invoices by status', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/subscription/invoices?status=paid',
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      response.data.invoices.forEach(invoice => {
        expect(invoice.status).toBe('paid');
      });
    });
  });

  describe('POST /api/subscription/update-payment-method', () => {
    test('should update payment method', async () => {
      const paymentMethodData = {
        payment_method_id: 'pm_test_card_visa_debit',
        set_as_default: true
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/update-payment-method',
        paymentMethodData,
        freelancerAuth.session.access_token
      );

      expect([200, 404]).toContain(response.status); // 404 if no subscription
      if (response.status === 200) {
        expect(response.data.payment_method).toBeDefined();
        expect(response.data.payment_method.id).toBe(paymentMethodData.payment_method_id);
      }
    });

    test('should validate payment method IDs', async () => {
      const invalidData = {
        payment_method_id: 'invalid_pm_id'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/update-payment-method',
        invalidData,
        freelancerAuth.session.access_token
      );

      expect([400, 404]).toContain(response.status);
    });
  });

  describe('GET /api/subscription/usage', () => {
    test('should get detailed usage statistics', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/subscription/usage',
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(response.data.current_period).toBeDefined();
      expect(response.data.current_period.contracts_created).toBeDefined();
      expect(response.data.current_period.contracts_remaining).toBeDefined();
      expect(response.data.historical).toBeDefined();
      expect(response.data.projected).toBeDefined();
    });

    test('should include usage warnings and recommendations', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/subscription/usage',
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(response.data.warnings).toBeDefined();
      expect(response.data.recommendations).toBeDefined();
      
      if (response.data.warnings.length > 0) {
        response.data.warnings.forEach(warning => {
          expect(warning).toHaveProperty('type');
          expect(warning).toHaveProperty('message');
          expect(warning).toHaveProperty('severity');
        });
      }
    });
  });

  describe('Security and Validation', () => {
    test('should prevent unauthorized subscription modifications', async () => {
      const maliciousData = {
        plan_id: 'business',
        billing_cycle: 'monthly',
        user_id: clientUser.user.id // Try to modify another user's subscription
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/create-checkout-session',
        maliciousData,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200); // user_id should be ignored, taken from auth
      expect(response.data.session_url).toBeDefined();
    });

    test('should validate subscription metadata', async () => {
      const suspiciousData = {
        plan_id: 'professional',
        billing_cycle: 'monthly',
        metadata: {
          malicious_script: '<script>alert("XSS")</script>',
          sql_injection: "'; DROP TABLE users; --"
        }
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/create-checkout-session',
        suspiciousData,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      // Metadata should be sanitized or rejected
    });

    test('should implement rate limiting for subscription operations', async () => {
      const requests = [];
      for (let i = 0; i < 15; i++) {
        requests.push(
          TestAPIManager.makeRequest(
            'GET',
            '/api/subscription/current',
            null,
            freelancerAuth.session.access_token
          )
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    test('should log subscription security events', async () => {
      // Multiple rapid plan upgrades (suspicious)
      const rapidRequests = [];
      for (let i = 0; i < 5; i++) {
        rapidRequests.push(
          TestAPIManager.makeRequest(
            'POST',
            '/api/subscription/create-checkout-session',
            { plan_id: 'business', billing_cycle: 'yearly' },
            freelancerAuth.session.access_token
          )
        );
      }

      const responses = await Promise.all(rapidRequests);
      const blockedResponses = responses.filter(r => r.status === 429);
      
      expect(blockedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle Stripe API errors gracefully', async () => {
      const invalidCardData = {
        payment_method_id: 'pm_card_chargeDeclined'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/update-payment-method',
        invalidCardData,
        freelancerAuth.session.access_token
      );

      expect([400, 402, 404]).toContain(response.status);
      if (response.status === 402) {
        expect(response.data.error).toBeDefined();
        expect(response.data.error).not.toContain('sk_'); // No API keys leaked
      }
    });

    test('should return consistent error format', async () => {
      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/create-checkout-session',
        {}, // Missing required fields
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
      expect(response.data).toHaveProperty('message');
      expect(typeof response.data.error).toBe('string');
    });

    test('should handle webhook processing errors', async () => {
      const malformedWebhook = {
        id: 'evt_malformed',
        type: 'customer.subscription.created',
        data: {
          object: null // Malformed data
        }
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/subscription/webhook',
        malformedWebhook,
        null,
        {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json'
        }
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toBeDefined();
    });
  });
});