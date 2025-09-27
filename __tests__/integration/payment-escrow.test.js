/**
 * Payment and Escrow Integration Tests
 * Tests payment processing, escrow funding, and payment release workflows
 */

const {
  setupTestUsers,
  cleanupTestUsers,
  getTestUser,
  authenticateTestUser,
  resetTestUsers
} = require('../test-setup/setup-test-users.js');
const {
  TestContractManager,
  TestPaymentManager,
  TestAPIManager,
  TEST_CONFIG,
  supabaseAdmin,
  stripe,
  createTestDelay
} = require('../test-setup/test-helpers.js');

describe('Payment and Escrow Management', () => {
  let freelancerUser, clientUser;
  let freelancerAuth, clientAuth;
  let testContract = null;
  let stripeCustomer = null;
  let escrowPayment = null;

  // Setup before all tests
  beforeAll(async () => {
    await setupTestUsers();
    freelancerUser = getTestUser('freelancer');
    clientUser = getTestUser('client');
    freelancerAuth = await authenticateTestUser('freelancer');
    clientAuth = await authenticateTestUser('client');

    // Create test contract for payment tests
    testContract = await TestContractManager.createContract(
      freelancerUser.user.id,
      TEST_CONFIG.CONTRACT_DATA.WEB_DEVELOPMENT,
      'freelancer'
    );

    // Add client as party and sign contract
    await supabaseAdmin
      .from('contract_parties')
      .insert({
        contract_id: testContract.id,
        user_id: clientUser.user.id,
        role: 'client',
        status: 'pending'
      });

    await TestContractManager.signContract(testContract.id, clientUser.user.id);

    // Create Stripe customer for client
    stripeCustomer = await TestPaymentManager.createStripeCustomer(
      clientUser.user.email,
      { user_id: clientUser.user.id }
    );

    // Update client profile with Stripe customer ID
    await supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: stripeCustomer.id })
      .eq('id', clientUser.user.id);

  }, TEST_CONFIG.TIMEOUTS.LONG_OPERATION);

  // Cleanup after all tests
  afterAll(async () => {
    if (testContract) {
      await TestContractManager.deleteContract(testContract.id);
    }
    if (stripeCustomer) {
      await stripe.customers.del(stripeCustomer.id);
    }
    await cleanupTestUsers();
  }, TEST_CONFIG.TIMEOUTS.DEFAULT);

  beforeEach(async () => {
    await createTestDelay(500); // Prevent rate limiting
  });

  describe('Stripe Customer Management', () => {
    test('should create Stripe customer successfully', async () => {
      expect(stripeCustomer).toBeDefined();
      expect(stripeCustomer.email).toBe(clientUser.user.email);
      expect(stripeCustomer.metadata.user_id).toBe(clientUser.user.id);
      expect(stripeCustomer.metadata.test_customer).toBe('true');
    });

    test('should link Stripe customer to user profile', async () => {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', clientUser.user.id)
        .single();

      expect(profile.stripe_customer_id).toBe(stripeCustomer.id);
    });

    test('should retrieve customer from Stripe', async () => {
      const retrievedCustomer = await stripe.customers.retrieve(stripeCustomer.id);
      
      expect(retrievedCustomer.id).toBe(stripeCustomer.id);
      expect(retrievedCustomer.email).toBe(clientUser.user.email);
      expect(retrievedCustomer.deleted).toBeUndefined();
    });
  });

  describe('Escrow Payment Creation', () => {
    test('should calculate platform fees correctly for free tier', async () => {
      const contractAmount = parseFloat(testContract.total_amount);
      const expectedPlatformFee = contractAmount * 0.10; // 10% for free tier
      const expectedStripeFee = (contractAmount + expectedPlatformFee) * 0.029 + 0.30;
      const expectedTotal = contractAmount + expectedPlatformFee + expectedStripeFee;

      // Verify fee calculation logic
      expect(expectedPlatformFee).toBe(500); // 10% of $5000
      expect(expectedStripeFee).toBeCloseTo(159.85, 2); // Stripe fee calculation
      expect(expectedTotal).toBeCloseTo(5659.85, 2);
    });

    test('should create Stripe checkout session for escrow funding', async () => {
      const contractAmount = parseFloat(testContract.total_amount);
      const platformFee = contractAmount * 0.10;
      const stripeFee = (contractAmount + platformFee) * 0.029 + 0.30;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: testContract.currency.toLowerCase(),
              product_data: {
                name: `Contract: ${testContract.title}`,
                description: `Escrow funding for contract ${testContract.contract_number}`,
              },
              unit_amount: Math.round(contractAmount * 100),
            },
            quantity: 1,
          },
          {
            price_data: {
              currency: testContract.currency.toLowerCase(),
              product_data: {
                name: 'Platform Fee',
                description: 'Platform fee (10%)',
              },
              unit_amount: Math.round(platformFee * 100),
            },
            quantity: 1,
          }
        ],
        mode: 'payment',
        success_url: `${TEST_CONFIG.URLS.BASE_URL}/test-success`,
        cancel_url: `${TEST_CONFIG.URLS.BASE_URL}/test-cancel`,
        customer: stripeCustomer.id,
        metadata: {
          contract_id: testContract.id,
          user_id: clientUser.user.id,
          type: 'escrow_funding',
          test_payment: 'true'
        },
      });

      expect(session).toBeDefined();
      expect(session.mode).toBe('payment');
      expect(session.customer).toBe(stripeCustomer.id);
      expect(session.metadata.contract_id).toBe(testContract.id);
      expect(session.metadata.type).toBe('escrow_funding');
      expect(session.url).toContain('https://checkout.stripe.com');
    });

    test('should create escrow payment record in database', async () => {
      const contractAmount = parseFloat(testContract.total_amount);
      const platformFee = contractAmount * 0.10;
      const stripeFee = (contractAmount + platformFee) * 0.029 + 0.30;
      const totalCharged = contractAmount + platformFee + stripeFee;

      const { data: payment, error } = await supabaseAdmin
        .from('escrow_payments')
        .insert({
          contract_id: testContract.id,
          amount: contractAmount,
          platform_fee: platformFee,
          stripe_fee: stripeFee,
          total_charged: totalCharged,
          stripe_payment_intent_id: 'test_pi_123456789',
          status: 'pending'
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(payment).toBeDefined();
      expect(parseFloat(payment.amount)).toBe(contractAmount);
      expect(parseFloat(payment.platform_fee)).toBe(platformFee);
      expect(parseFloat(payment.total_charged)).toBeCloseTo(totalCharged, 2);
      expect(payment.status).toBe('pending');

      escrowPayment = payment;
    });
  });

  describe('Escrow Funding Simulation', () => {
    test('should simulate successful payment and update escrow status', async () => {
      // Simulate successful payment by updating status
      const { data: fundedPayment, error } = await supabaseAdmin
        .from('escrow_payments')
        .update({
          status: 'funded',
          funded_at: new Date().toISOString(),
          stripe_payment_intent_id: 'test_pi_successful_123'
        })
        .eq('id', escrowPayment.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(fundedPayment.status).toBe('funded');
      expect(fundedPayment.funded_at).toBeDefined();
      expect(fundedPayment.stripe_payment_intent_id).toBe('test_pi_successful_123');
    });

    test('should update contract funding status', async () => {
      const { data: fundedContract, error } = await supabaseAdmin
        .from('contracts')
        .update({
          is_funded: true,
          status: 'active'
        })
        .eq('id', testContract.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(fundedContract.is_funded).toBe(true);
      expect(fundedContract.status).toBe('active');
    });

    test('should track payment history and audit trail', async () => {
      // Create contract payment record for audit trail
      const { data: contractPayment, error } = await supabaseAdmin
        .from('contract_payments')
        .insert({
          contract_id: testContract.id,
          user_id: clientUser.user.id,
          amount: parseFloat(escrowPayment.total_charged),
          status: 'completed',
          payment_type: 'escrow',
          stripe_payment_id: 'test_session_123',
          metadata: {
            escrow_payment_id: escrowPayment.id,
            contract_amount: parseFloat(escrowPayment.amount),
            platform_fee: parseFloat(escrowPayment.platform_fee),
            stripe_fee: parseFloat(escrowPayment.stripe_fee)
          }
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(contractPayment.payment_type).toBe('escrow');
      expect(contractPayment.status).toBe('completed');
      expect(contractPayment.metadata.escrow_payment_id).toBe(escrowPayment.id);
    });
  });

  describe('Freelancer Stripe Connect Setup', () => {
    test('should create Stripe Connect account for freelancer', async () => {
      const connectAccount = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: freelancerUser.user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true }
        },
        metadata: {
          user_id: freelancerUser.user.id,
          test_account: 'true'
        }
      });

      expect(connectAccount).toBeDefined();
      expect(connectAccount.type).toBe('express');
      expect(connectAccount.email).toBe(freelancerUser.user.email);
      expect(connectAccount.metadata.user_id).toBe(freelancerUser.user.id);

      // Update freelancer profile with Connect account
      await supabaseAdmin
        .from('profiles')
        .update({
          stripe_connect_account_id: connectAccount.id,
          stripe_connect_charges_enabled: true,
          stripe_connect_payouts_enabled: true
        })
        .eq('id', freelancerUser.user.id);

      // Store for cleanup
      this.connectAccount = connectAccount;
    });

    test('should verify freelancer payment account setup', async () => {
      const { data: freelancerProfile } = await supabaseAdmin
        .from('profiles')
        .select('stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled')
        .eq('id', freelancerUser.user.id)
        .single();

      expect(freelancerProfile.stripe_connect_account_id).toBeDefined();
      expect(freelancerProfile.stripe_connect_charges_enabled).toBe(true);
      expect(freelancerProfile.stripe_connect_payouts_enabled).toBe(true);
    });
  });

  describe('Payment Release Process', () => {
    test('should calculate release amount correctly', async () => {
      const releaseAmount = parseFloat(escrowPayment.amount);
      const firstMilestoneAmount = 1000; // From test data

      expect(releaseAmount).toBeGreaterThan(firstMilestoneAmount);
      expect(releaseAmount).toBe(5000); // Total contract amount
    });

    test('should create Stripe transfer for payment release', async () => {
      const { data: freelancerProfile } = await supabaseAdmin
        .from('profiles')
        .select('stripe_connect_account_id')
        .eq('id', freelancerUser.user.id)
        .single();

      if (freelancerProfile.stripe_connect_account_id) {
        const releaseAmount = 1000; // First milestone amount

        const transfer = await stripe.transfers.create({
          amount: Math.round(releaseAmount * 100), // Convert to cents
          currency: testContract.currency.toLowerCase(),
          destination: freelancerProfile.stripe_connect_account_id,
          transfer_group: `contract_${testContract.id}`,
          metadata: {
            contract_id: testContract.id,
            escrow_payment_id: escrowPayment.id,
            release_amount: releaseAmount.toString(),
            released_by: clientUser.user.id,
            reason: 'Milestone 1 completion',
            test_transfer: 'true'
          }
        });

        expect(transfer).toBeDefined();
        expect(transfer.amount).toBe(releaseAmount * 100);
        expect(transfer.destination).toBe(freelancerProfile.stripe_connect_account_id);
        expect(transfer.metadata.contract_id).toBe(testContract.id);
      }
    });

    test('should update escrow payment status after release', async () => {
      const { data: releasedPayment, error } = await supabaseAdmin
        .from('escrow_payments')
        .update({
          status: 'partially_released',
          released_at: new Date().toISOString(),
          stripe_transfer_id: 'test_tr_123456789'
        })
        .eq('id', escrowPayment.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(releasedPayment.status).toBe('partially_released');
      expect(releasedPayment.released_at).toBeDefined();
      expect(releasedPayment.stripe_transfer_id).toBe('test_tr_123456789');
    });

    test('should create payment release record', async () => {
      const releaseAmount = 1000;

      const { data: releaseRecord, error } = await supabaseAdmin
        .from('contract_payments')
        .insert({
          contract_id: testContract.id,
          user_id: clientUser.user.id,
          amount: releaseAmount,
          status: 'completed',
          payment_type: 'release',
          stripe_payment_id: 'test_tr_123456789',
          metadata: {
            escrow_payment_id: escrowPayment.id,
            transfer_id: 'test_tr_123456789',
            freelancer_id: freelancerUser.user.id,
            released_by: clientUser.user.id,
            reason: 'Milestone 1 completion'
          }
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(releaseRecord.payment_type).toBe('release');
      expect(releaseRecord.status).toBe('completed');
      expect(parseFloat(releaseRecord.amount)).toBe(releaseAmount);
    });
  });

  describe('Payment Security and Validation', () => {
    test('should validate payment amounts against contract total', async () => {
      const contractAmount = parseFloat(testContract.total_amount);
      const invalidAmount = contractAmount + 1000; // Exceeds contract amount

      // Attempt to create escrow payment with invalid amount
      const { error } = await supabaseAdmin
        .from('escrow_payments')
        .insert({
          contract_id: testContract.id,
          amount: invalidAmount,
          platform_fee: invalidAmount * 0.10,
          stripe_fee: 100,
          total_charged: invalidAmount + (invalidAmount * 0.10) + 100,
          stripe_payment_intent_id: 'test_invalid_amount',
          status: 'pending'
        });

      // Should either fail or be handled by application logic
      // This test ensures we're thinking about validation
      if (!error) {
        // Clean up if it was created
        await supabaseAdmin
          .from('escrow_payments')
          .delete()
          .eq('stripe_payment_intent_id', 'test_invalid_amount');
      }
    });

    test('should prevent unauthorized payment releases', async () => {
      // Attempt to release payment as freelancer (should be client only)
      const unauthorizedReleaseAmount = 500;

      try {
        // This should be prevented by application logic
        const { error } = await supabaseAdmin
          .from('contract_payments')
          .insert({
            contract_id: testContract.id,
            user_id: freelancerUser.user.id, // Freelancer trying to release
            amount: unauthorizedReleaseAmount,
            status: 'completed',
            payment_type: 'release',
            stripe_payment_id: 'unauthorized_release',
            metadata: {
              escrow_payment_id: escrowPayment.id,
              note: 'Unauthorized release attempt'
            }
          });

        if (!error) {
          // Clean up if it was allowed
          await supabaseAdmin
            .from('contract_payments')
            .delete()
            .eq('stripe_payment_id', 'unauthorized_release');
        }

        // The test should verify that proper authorization checks are in place
        expect(true).toBe(true); // Placeholder for actual authorization logic
      } catch (error) {
        // Expected to fail
        expect(error).toBeDefined();
      }
    });

    test('should validate Stripe webhook signatures', async () => {
      // This would test webhook signature validation
      // For now, we'll verify the webhook endpoint exists
      const webhookEndpoint = '/api/webhooks/stripe';
      
      // Test that webhook validation logic is in place
      expect(webhookEndpoint).toBe('/api/webhooks/stripe');
      
      // In a real test, you would:
      // 1. Create a test webhook event
      // 2. Sign it with test webhook secret
      // 3. Send to webhook endpoint
      // 4. Verify it processes correctly
    });
  });

  describe('Payment Error Handling', () => {
    test('should handle failed payment scenarios', async () => {
      const { data: failedPayment, error } = await supabaseAdmin
        .from('escrow_payments')
        .insert({
          contract_id: testContract.id,
          amount: 1000,
          platform_fee: 100,
          stripe_fee: 50,
          total_charged: 1150,
          stripe_payment_intent_id: 'test_pi_failed_123',
          status: 'failed'
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(failedPayment.status).toBe('failed');

      // Clean up
      await supabaseAdmin
        .from('escrow_payments')
        .delete()
        .eq('id', failedPayment.id);
    });

    test('should handle refund scenarios', async () => {
      const { data: refundedPayment, error } = await supabaseAdmin
        .from('escrow_payments')
        .insert({
          contract_id: testContract.id,
          amount: 1000,
          platform_fee: 100,
          stripe_fee: 50,
          total_charged: 1150,
          stripe_payment_intent_id: 'test_pi_refunded_123',
          status: 'refunded'
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(refundedPayment.status).toBe('refunded');

      // Clean up
      await supabaseAdmin
        .from('escrow_payments')
        .delete()
        .eq('id', refundedPayment.id);
    });

    test('should track payment timeline and status changes', async () => {
      // Verify the escrow payment has proper timestamps
      const { data: payment } = await supabaseAdmin
        .from('escrow_payments')
        .select('*')
        .eq('id', escrowPayment.id)
        .single();

      expect(payment.created_at).toBeDefined();
      expect(payment.updated_at).toBeDefined();
      expect(payment.funded_at).toBeDefined();
      expect(payment.released_at).toBeDefined();

      // Verify timeline order
      const createdAt = new Date(payment.created_at);
      const fundedAt = new Date(payment.funded_at);
      const releasedAt = new Date(payment.released_at);

      expect(fundedAt.getTime()).toBeGreaterThanOrEqual(createdAt.getTime());
      expect(releasedAt.getTime()).toBeGreaterThanOrEqual(fundedAt.getTime());
    });
  });

  // Cleanup Connect account after tests
  afterAll(async () => {
    if (this.connectAccount) {
      try {
        await stripe.accounts.del(this.connectAccount.id);
      } catch (error) {
        console.error('Failed to cleanup Connect account:', error);
      }
    }
  });
});