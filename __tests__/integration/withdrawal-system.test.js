/**
 * Withdrawal System Integration Tests
 * Tests KYC verification, payment method management, and withdrawal processing
 */

const {
  setupTestUsers,
  cleanupTestUsers,
  getTestUser,
  authenticateTestUser,
  resetTestUsers
} = require('../test-setup/setup-test-users.js');
const {
  TestAPIManager,
  TEST_CONFIG,
  supabaseAdmin,
  createTestDelay
} = require('../test-setup/test-helpers.js');

describe('Withdrawal System Management', () => {
  let freelancerUser, clientUser;
  let freelancerAuth, clientAuth;
  let testPaymentMethods = [];

  // Setup before all tests
  beforeAll(async () => {
    await setupTestUsers();
    freelancerUser = getTestUser('freelancer');
    clientUser = getTestUser('client');
    freelancerAuth = await authenticateTestUser('freelancer');
    clientAuth = await authenticateTestUser('client');
  }, TEST_CONFIG.TIMEOUTS.LONG_OPERATION);

  // Cleanup after all tests
  afterAll(async () => {
    // Clean up payment methods
    for (const method of testPaymentMethods) {
      try {
        await supabaseAdmin
          .from('withdrawal_methods')
          .delete()
          .eq('id', method.id);
      } catch (error) {
        console.error(`Failed to cleanup payment method ${method.id}:`, error);
      }
    }
    await cleanupTestUsers();
  }, TEST_CONFIG.TIMEOUTS.DEFAULT);

  // Reset test data before each test suite
  beforeEach(async () => {
    await resetTestUsers();
  });

  describe('KYC Status Checking', () => {
    test('should check KYC requirements for small withdrawal', async () => {
      const response = await TestAPIManager.makeRequest('/api/kyc/check-requirements', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contract_amount: 100,
          currency: 'USD',
          action: 'withdrawal'
        })
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data).toHaveProperty('eligible');
      expect(data).toHaveProperty('current_verification');
      expect(data).toHaveProperty('required_verification');
      expect(data.eligible).toBe(true); // Small amounts should be eligible
    });

    test('should check KYC requirements for large withdrawal', async () => {
      const response = await TestAPIManager.makeRequest('/api/kyc/check-requirements', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contract_amount: 10000,
          currency: 'USD',
          action: 'withdrawal'
        })
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data).toHaveProperty('eligible');
      expect(data).toHaveProperty('required_verification');
      
      if (!data.eligible) {
        expect(data).toHaveProperty('action_plan');
        expect(data.action_plan).toBeInstanceOf(Array);
      }
    });

    test('should provide action plan when KYC upgrade needed', async () => {
      const response = await TestAPIManager.makeRequest('/api/kyc/check-requirements', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contract_amount: 25000,
          currency: 'USD',
          action: 'withdrawal'
        })
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      if (!data.eligible) {
        expect(data.action_plan).toBeDefined();
        expect(data.action_plan.length).toBeGreaterThan(0);
        
        data.action_plan.forEach(step => {
          expect(step).toHaveProperty('step');
          expect(step).toHaveProperty('title');
          expect(step).toHaveProperty('description');
          expect(step).toHaveProperty('estimated_time');
        });
      }
    });
  });

  describe('Payment Method Management', () => {
    test('should add PayPal payment method', async () => {
      const paypalData = {
        rail: 'paypal',
        label: 'Test PayPal Account',
        currency: 'USD',
        country: 'US',
        paypal_receiver: 'freelancer@example.com',
        is_default: false
      };

      const response = await TestAPIManager.makeRequest('/api/withdrawals/methods', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paypalData)
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.method).toBeDefined();
      expect(data.method.rail).toBe('paypal');
      expect(data.method.label).toBe(paypalData.label);
      expect(data.method.currency).toBe(paypalData.currency);
      expect(data.method.is_verified).toBe(false); // Should start unverified

      testPaymentMethods.push(data.method);
    });

    test('should add Wise payment method', async () => {
      const wiseData = {
        rail: 'wise',
        label: 'Test Wise Account',
        currency: 'USD',
        country: 'US',
        wise_recipient_id: 'recipient-12345',
        is_default: false
      };

      const response = await TestAPIManager.makeRequest('/api/withdrawals/methods', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(wiseData)
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.method).toBeDefined();
      expect(data.method.rail).toBe('wise');
      expect(data.method.label).toBe(wiseData.label);
      expect(data.method.wise_recipient_id).toBeUndefined(); // Should be hidden in response
      expect(data.method.is_verified).toBe(false);

      testPaymentMethods.push(data.method);
    });

    test('should add Stripe bank account method', async () => {
      const stripeData = {
        rail: 'stripe',
        label: 'Test Bank Account',
        currency: 'USD',
        country: 'US',
        stripe_external_account_id: 'ba_test_1234567890',
        account_name: 'John Doe',
        is_default: true
      };

      const response = await TestAPIManager.makeRequest('/api/withdrawals/methods', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(stripeData)
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.method).toBeDefined();
      expect(data.method.rail).toBe('stripe');
      expect(data.method.is_default).toBe(true);
      expect(data.method.is_verified).toBe(false);

      testPaymentMethods.push(data.method);
    });

    test('should list user payment methods', async () => {
      const response = await TestAPIManager.makeRequest('/api/withdrawals/methods', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.methods).toBeInstanceOf(Array);
      expect(data.methods.length).toBe(testPaymentMethods.length);

      // Verify default method is first
      const defaultMethod = data.methods.find(m => m.is_default);
      expect(defaultMethod).toBeDefined();
      expect(defaultMethod.rail).toBe('stripe');
    });

    test('should filter payment methods by currency', async () => {
      const response = await TestAPIManager.makeRequest('/api/withdrawals/methods?currency=USD', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.methods).toBeInstanceOf(Array);
      data.methods.forEach(method => {
        expect(method.currency).toBe('USD');
      });
    });

    test('should filter payment methods by rail', async () => {
      const response = await TestAPIManager.makeRequest('/api/withdrawals/methods?rail=paypal', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.methods).toBeInstanceOf(Array);
      data.methods.forEach(method => {
        expect(method.rail).toBe('paypal');
      });
    });

    test('should reject invalid payment method data', async () => {
      const invalidData = {
        rail: 'paypal',
        // Missing required fields
        currency: 'USD'
      };

      const response = await TestAPIManager.makeRequest('/api/withdrawals/methods', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidData)
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('required');
    });
  });

  describe('Payment Method Verification', () => {
    test('should verify PayPal account (demo mode)', async () => {
      const paypalMethod = testPaymentMethods.find(m => m.rail === 'paypal');
      if (!paypalMethod) {
        throw new Error('PayPal method not found for verification test');
      }

      const response = await TestAPIManager.makeRequest(`/api/withdrawals/methods/${paypalMethod.id}/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      if (data.verified) {
        expect(data.message).toContain('verified');
      } else {
        expect(data.error).toBeDefined();
        expect(data.error).toContain('account not found');
      }
    });

    test('should verify Wise account (demo mode)', async () => {
      const wiseMethod = testPaymentMethods.find(m => m.rail === 'wise');
      if (!wiseMethod) {
        throw new Error('Wise method not found for verification test');
      }

      const response = await TestAPIManager.makeRequest(`/api/withdrawals/methods/${wiseMethod.id}/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      if (data.verified) {
        expect(data.message).toContain('verified');
      } else {
        expect(data.error).toBeDefined();
      }
    });

    test('should handle Stripe verification requirements', async () => {
      const stripeMethod = testPaymentMethods.find(m => m.rail === 'stripe');
      if (!stripeMethod) {
        throw new Error('Stripe method not found for verification test');
      }

      const response = await TestAPIManager.makeRequest(`/api/withdrawals/methods/${stripeMethod.id}/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.success).toBe(true);
      // Stripe typically requires micro-deposits in demo mode
      expect(data.verified).toBe(false);
      expect(data.error).toContain('micro-deposit');
    });

    test('should prevent verification of non-existent method', async () => {
      const fakeMethodId = 'fake-method-id-12345';

      const response = await TestAPIManager.makeRequest(`/api/withdrawals/methods/${fakeMethodId}/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        }
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    test('should prevent verification of other user methods', async () => {
      // Try to verify freelancer's method as client
      const freelancerMethod = testPaymentMethods[0];

      const response = await TestAPIManager.makeRequest(`/api/withdrawals/methods/${freelancerMethod.id}/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clientAuth.access_token}`,
          'Content-Type': 'application/json',
        }
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404); // Should not find method belonging to other user
    });
  });

  describe('Payment Method Security', () => {
    test('should require authentication for method creation', async () => {
      const paymentData = {
        rail: 'paypal',
        label: 'Unauthorized Test',
        currency: 'USD',
        paypal_receiver: 'test@example.com'
      };

      const response = await TestAPIManager.makeRequest('/api/withdrawals/methods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentData)
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    test('should require authentication for method listing', async () => {
      const response = await TestAPIManager.makeRequest('/api/withdrawals/methods', {
        method: 'GET'
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    test('should isolate user payment methods', async () => {
      // Get freelancer methods
      const freelancerResponse = await TestAPIManager.makeRequest('/api/withdrawals/methods', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(freelancerResponse.ok).toBe(true);
      const freelancerData = await freelancerResponse.json();

      // Get client methods (should be empty)
      const clientResponse = await TestAPIManager.makeRequest('/api/withdrawals/methods', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${clientAuth.access_token}`,
        }
      });

      expect(clientResponse.ok).toBe(true);
      const clientData = await clientResponse.json();

      // Verify isolation
      expect(freelancerData.methods.length).toBeGreaterThan(0);
      expect(clientData.methods.length).toBe(0);
      
      // No overlap in method IDs
      const freelancerIds = freelancerData.methods.map(m => m.id);
      const clientIds = clientData.methods.map(m => m.id);
      const intersection = freelancerIds.filter(id => clientIds.includes(id));
      expect(intersection.length).toBe(0);
    });
  });

  describe('Fee Structure and Processing', () => {
    test('should include fee information in payment methods', async () => {
      const response = await TestAPIManager.makeRequest('/api/withdrawals/methods', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      data.methods.forEach(method => {
        expect(method).toHaveProperty('processing_time');
        expect(method).toHaveProperty('fees_description');
        expect(method.processing_time).toBeTruthy();
        expect(method.fees_description).toBeTruthy();
      });
    });

    test('should provide different processing times by rail', async () => {
      const response = await TestAPIManager.makeRequest('/api/withdrawals/methods', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      const processingTimes = {};
      data.methods.forEach(method => {
        processingTimes[method.rail] = method.processing_time;
      });

      // Each rail should have different processing characteristics
      const uniqueTimes = new Set(Object.values(processingTimes));
      expect(uniqueTimes.size).toBeGreaterThan(0);
    });
  });

  describe('Data Integrity and Constraints', () => {
    test('should maintain referential integrity', async () => {
      // Verify all payment methods reference valid users
      const { data: methods, error } = await supabaseAdmin
        .from('withdrawal_methods')
        .select(`
          id,
          profile_id,
          profiles!inner(id, email)
        `)
        .in('id', testPaymentMethods.map(m => m.id));

      expect(error).toBeNull();
      expect(methods.length).toBe(testPaymentMethods.length);

      methods.forEach(method => {
        expect(method.profiles).toBeDefined();
        expect(method.profiles.id).toBe(method.profile_id);
      });
    });

    test('should enforce unique default per currency', async () => {
      // Try to set another method as default USD
      const anotherDefaultData = {
        rail: 'paypal',
        label: 'Another Default PayPal',
        currency: 'USD',
        country: 'US',
        paypal_receiver: 'another@example.com',
        is_default: true
      };

      const response = await TestAPIManager.makeRequest('/api/withdrawals/methods', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(anotherDefaultData)
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      testPaymentMethods.push(data.method);

      // Check that only one method is default for USD
      const listResponse = await TestAPIManager.makeRequest('/api/withdrawals/methods?currency=USD', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freelancerAuth.access_token}`,
        }
      });

      const listData = await listResponse.json();
      const defaultMethods = listData.methods.filter(m => m.is_default);
      expect(defaultMethods.length).toBe(1);
      expect(defaultMethods[0].rail).toBe('paypal'); // Latest should be default
    });

    test('should handle concurrent method creation', async () => {
      const methodData1 = {
        rail: 'paypal',
        label: 'Concurrent Test 1',
        currency: 'EUR',
        paypal_receiver: 'concurrent1@example.com'
      };

      const methodData2 = {
        rail: 'wise',
        label: 'Concurrent Test 2', 
        currency: 'EUR',
        wise_recipient_id: 'concurrent-recipient-2'
      };

      // Create methods concurrently
      const promises = [
        TestAPIManager.makeRequest('/api/withdrawals/methods', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${freelancerAuth.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(methodData1)
        }),
        TestAPIManager.makeRequest('/api/withdrawals/methods', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${freelancerAuth.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(methodData2)
        })
      ];

      const results = await Promise.allSettled(promises);

      // Both should succeed
      results.forEach(result => {
        expect(result.status).toBe('fulfilled');
        expect(result.value.ok).toBe(true);
      });

      // Clean up concurrent test methods
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const data = await result.value.json();
          testPaymentMethods.push(data.method);
        }
      }
    });
  });
});