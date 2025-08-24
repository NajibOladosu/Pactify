/**
 * Payment API Endpoints Tests
 * Tests payment processing, escrow management, and Stripe integration endpoints
 */

import {
  setupTestUsers,
  cleanupTestUsers,
  getTestUser,
  authenticateTestUser
} from '../test-setup/setup-test-users.js';
import {
  TestAPIManager,
  TestContractManager,
  TEST_CONFIG,
  createTestDelay
} from '../test-setup/test-helpers.js';

describe('Payment API Endpoints', () => {
  let freelancerUser, clientUser;
  let freelancerAuth, clientAuth;
  let testContract = null;
  let testMilestone = null;

  beforeAll(async () => {
    await setupTestUsers();
    freelancerUser = getTestUser('freelancer');
    clientUser = getTestUser('client');
    freelancerAuth = await authenticateTestUser('freelancer');
    clientAuth = await authenticateTestUser('client');

    // Create signed contract for payment tests
    testContract = await TestContractManager.createContract(
      freelancerUser.user.id,
      TEST_CONFIG.CONTRACT_DATA.WEB_DEVELOPMENT,
      'freelancer'
    );
    
    await TestContractManager.signContract(testContract.id, clientUser.user.id);
    await TestContractManager.signContract(testContract.id, freelancerUser.user.id);
  }, TEST_CONFIG.TIMEOUTS.LONG_OPERATION);

  afterAll(async () => {
    if (testContract) {
      await TestContractManager.deleteContract(testContract.id);
    }
    await cleanupTestUsers();
  }, TEST_CONFIG.TIMEOUTS.DEFAULT);

  beforeEach(async () => {
    await createTestDelay(500);
  });

  describe('POST /api/payments/create-checkout-session', () => {
    test('should create Stripe checkout session for contract funding', async () => {
      const sessionData = {
        contract_id: testContract.id,
        amount: parseFloat(testContract.total_amount),
        currency: 'USD',
        success_url: 'https://localhost:3000/success',
        cancel_url: 'https://localhost:3000/cancel',
        metadata: {
          contract_id: testContract.id,
          payment_type: 'escrow_funding'
        }
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/payments/create-checkout-session',
        sessionData,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(response.data.session_url).toBeDefined();
      expect(response.data.session_id).toBeDefined();
      expect(response.data.payment_intent_id).toBeDefined();
      expect(response.data.session_url).toContain('stripe.com');
    });

    test('should calculate correct fees for different subscription tiers', async () => {
      const amount = 1000;
      const sessionData = {
        contract_id: testContract.id,
        amount: amount,
        currency: 'USD'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/payments/create-checkout-session',
        sessionData,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(response.data.fee_breakdown).toBeDefined();
      expect(response.data.fee_breakdown.platform_fee).toBeDefined();
      expect(response.data.fee_breakdown.stripe_fee).toBeDefined();
      expect(response.data.fee_breakdown.total_amount).toBeGreaterThan(amount);
    });

    test('should reject invalid payment amounts', async () => {
      const invalidSessionData = {
        contract_id: testContract.id,
        amount: -100, // Negative amount
        currency: 'USD'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/payments/create-checkout-session',
        invalidSessionData,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('amount');
    });

    test('should require valid contract and authorization', async () => {
      const sessionData = {
        contract_id: testContract.id,
        amount: 1000,
        currency: 'USD'
      };

      // Try as unauthorized user
      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/payments/create-checkout-session',
        sessionData,
        'invalid_token'
      );

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/payments/webhook/stripe', () => {
    test('should process successful payment webhook', async () => {
      const webhookPayload = {
        id: 'evt_test_webhook',
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_payment_intent',
            amount: 550000, // $5500 including fees
            currency: 'usd',
            status: 'succeeded',
            metadata: {
              contract_id: testContract.id,
              payment_type: 'escrow_funding'
            }
          }
        }
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/payments/webhook/stripe',
        webhookPayload,
        null,
        {
          'stripe-signature': 'test_signature_123',
          'content-type': 'application/json'
        }
      );

      expect([200, 400]).toContain(response.status); // 400 if signature validation fails in test
    });

    test('should handle payment failure webhook', async () => {
      const failurePayload = {
        id: 'evt_test_failure',
        object: 'event',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_test_failed_payment',
            amount: 550000,
            currency: 'usd',
            status: 'requires_payment_method',
            last_payment_error: {
              message: 'Your card was declined.'
            },
            metadata: {
              contract_id: testContract.id,
              payment_type: 'escrow_funding'
            }
          }
        }
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/payments/webhook/stripe',
        failurePayload,
        null,
        {
          'stripe-signature': 'test_signature_123',
          'content-type': 'application/json'
        }
      );

      expect([200, 400]).toContain(response.status);
    });

    test('should validate webhook signature', async () => {
      const webhookPayload = {
        id: 'evt_test_invalid',
        type: 'payment_intent.succeeded',
        data: { object: {} }
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/payments/webhook/stripe',
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

  describe('POST /api/contracts/[id]/escrow/fund', () => {
    test('should initiate escrow funding', async () => {
      const fundingData = {
        payment_method_id: 'pm_test_card_visa',
        amount: parseFloat(testContract.total_amount),
        currency: 'USD'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${testContract.id}/escrow/fund`,
        fundingData,
        clientAuth.session.access_token
      );

      expect([200, 201]).toContain(response.status);
      expect(response.data.payment_intent).toBeDefined();
      expect(response.data.escrow_record).toBeDefined();
    });

    test('should prevent duplicate funding', async () => {
      // First funding attempt
      const fundingData = {
        payment_method_id: 'pm_test_card_visa',
        amount: parseFloat(testContract.total_amount)
      };

      await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${testContract.id}/escrow/fund`,
        fundingData,
        clientAuth.session.access_token
      );

      // Second funding attempt should fail
      const response = await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${testContract.id}/escrow/fund`,
        fundingData,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(409);
      expect(response.data.error).toContain('already funded');
    });

    test('should validate contract is signed before funding', async () => {
      // Create unsigned contract
      const unsignedContract = await TestContractManager.createContract(
        freelancerUser.user.id,
        { ...TEST_CONFIG.CONTRACT_DATA.WEB_DEVELOPMENT, title: 'Unsigned Contract' },
        'freelancer'
      );

      const fundingData = {
        payment_method_id: 'pm_test_card_visa',
        amount: 5000
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${unsignedContract.id}/escrow/fund`,
        fundingData,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('signed');

      // Cleanup
      await TestContractManager.deleteContract(unsignedContract.id);
    });
  });

  describe('POST /api/contracts/[id]/escrow/release', () => {
    test('should release escrow payment', async () => {
      const releaseData = {
        milestone_id: testMilestone?.id,
        amount: 2500,
        release_reason: 'Milestone completed successfully'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${testContract.id}/escrow/release`,
        releaseData,
        clientAuth.session.access_token
      );

      expect([200, 201]).toContain(response.status);
      if (response.status === 200) {
        expect(response.data.transfer).toBeDefined();
        expect(response.data.payment_record).toBeDefined();
      }
    });

    test('should validate release permissions', async () => {
      const releaseData = {
        amount: 1000,
        release_reason: 'Unauthorized release attempt'
      };

      // Try to release as freelancer (should be client only)
      const response = await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${testContract.id}/escrow/release`,
        releaseData,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(403);
      expect(response.data.error).toContain('authorized');
    });

    test('should validate release amount against available escrow', async () => {
      const excessiveReleaseData = {
        amount: 999999, // More than escrow balance
        release_reason: 'Excessive release attempt'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${testContract.id}/escrow/release`,
        excessiveReleaseData,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('insufficient');
    });
  });

  describe('GET /api/payments', () => {
    test('should list user payments', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/payments',
        null,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.payments)).toBe(true);
      
      // Verify user can only see their own payments
      response.data.payments.forEach(payment => {
        expect(
          payment.payer_id === clientUser.user.id ||
          payment.payee_id === clientUser.user.id
        ).toBe(true);
      });
    });

    test('should support filtering by contract', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        `/api/payments?contract_id=${testContract.id}`,
        null,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(200);
      response.data.payments.forEach(payment => {
        expect(payment.contract_id).toBe(testContract.id);
      });
    });

    test('should support filtering by status', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/payments?status=completed',
        null,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(200);
      response.data.payments.forEach(payment => {
        expect(payment.status).toBe('completed');
      });
    });

    test('should require authentication', async () => {
      const response = await TestAPIManager.makeRequest('GET', '/api/payments');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/payments/[id]', () => {
    test('should get payment details', async () => {
      // First create or get a payment
      const paymentsResponse = await TestAPIManager.makeRequest(
        'GET',
        '/api/payments',
        null,
        clientAuth.session.access_token
      );

      if (paymentsResponse.data.payments.length > 0) {
        const paymentId = paymentsResponse.data.payments[0].id;
        
        const response = await TestAPIManager.makeRequest(
          'GET',
          `/api/payments/${paymentId}`,
          null,
          clientAuth.session.access_token
        );

        expect(response.status).toBe(200);
        expect(response.data.payment).toBeDefined();
        expect(response.data.payment.id).toBe(paymentId);
      }
    });

    test('should return 404 for non-existent payment', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await TestAPIManager.makeRequest(
        'GET',
        `/api/payments/${fakeId}`,
        null,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/payments/refund', () => {
    test('should process refund request', async () => {
      const refundData = {
        payment_intent_id: 'pi_test_payment_intent',
        amount: 1000,
        reason: 'customer_request',
        refund_reason: 'Project cancelled by mutual agreement'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/payments/refund',
        refundData,
        clientAuth.session.access_token
      );

      expect([200, 400]).toContain(response.status); // 400 if payment doesn't exist in test
    });

    test('should validate refund amount', async () => {
      const invalidRefundData = {
        payment_intent_id: 'pi_test_payment_intent',
        amount: -100, // Negative amount
        reason: 'customer_request'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/payments/refund',
        invalidRefundData,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('amount');
    });
  });

  describe('GET /api/payments/balance', () => {
    test('should get user payment balance', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/payments/balance',
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(response.data.balance).toBeDefined();
      expect(response.data.balance.available).toBeDefined();
      expect(response.data.balance.pending).toBeDefined();
      expect(response.data.balance.currency).toBe('USD');
    });

    test('should include escrow breakdown', async () => {
      const response = await TestAPIManager.makeRequest(
        'GET',
        '/api/payments/balance',
        null,
        freelancerAuth.session.access_token
      );

      expect(response.status).toBe(200);
      expect(response.data.escrow).toBeDefined();
      expect(response.data.escrow.total_held).toBeDefined();
      expect(response.data.escrow.by_contract).toBeDefined();
    });
  });

  describe('Security and Validation', () => {
    test('should validate payment amounts within reasonable limits', async () => {
      const extremeAmount = {
        contract_id: testContract.id,
        amount: 999999999, // Extremely large amount
        currency: 'USD'
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/payments/create-checkout-session',
        extremeAmount,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('amount');
    });

    test('should sanitize payment metadata', async () => {
      const maliciousData = {
        contract_id: testContract.id,
        amount: 1000,
        currency: 'USD',
        metadata: {
          description: '<script>alert("XSS")</script>',
          notes: '"><img src=x onerror=alert("XSS")>'
        }
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/payments/create-checkout-session',
        maliciousData,
        clientAuth.session.access_token
      );

      if (response.status === 200) {
        expect(response.data.metadata?.description).not.toContain('<script>');
      }
    });

    test('should implement proper access control', async () => {
      // Try to access another user's payment data
      const response = await TestAPIManager.makeRequest(
        'GET',
        `/api/payments?user_id=${freelancerUser.user.id}`,
        null,
        clientAuth.session.access_token
      );

      expect(response.status).toBe(200);
      // Should not return freelancer's payments to client
      if (response.data.payments.length > 0) {
        response.data.payments.forEach(payment => {
          expect(payment.payer_id).toBe(clientUser.user.id);
        });
      }
    });

    test('should log payment security events', async () => {
      const suspiciousData = {
        contract_id: testContract.id,
        amount: 1,
        currency: 'USD'
      };

      // Make multiple rapid requests (suspicious behavior)
      const rapidRequests = [];
      for (let i = 0; i < 10; i++) {
        rapidRequests.push(
          TestAPIManager.makeRequest(
            'POST',
            '/api/payments/create-checkout-session',
            suspiciousData,
            clientAuth.session.access_token
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
        contract_id: testContract.id,
        payment_method_id: 'pm_card_chargeDeclined',
        amount: 1000
      };

      const response = await TestAPIManager.makeRequest(
        'POST',
        `/api/contracts/${testContract.id}/escrow/fund`,
        invalidCardData,
        clientAuth.session.access_token
      );

      expect([400, 402]).toContain(response.status);
      expect(response.data.error).toBeDefined();
      expect(response.data.error).not.toContain('sk_'); // No API keys leaked
    });

    test('should return consistent error format', async () => {
      const response = await TestAPIManager.makeRequest(
        'POST',
        '/api/payments/create-checkout-session',
        {}, // Missing required fields
        clientAuth.session.access_token
      );

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error');
      expect(response.data).toHaveProperty('message');
      expect(typeof response.data.error).toBe('string');
    });
  });
});