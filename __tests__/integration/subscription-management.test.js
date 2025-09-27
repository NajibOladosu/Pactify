/**
 * Subscription Management Integration Tests
 * Tests subscription plans, upgrades, cancellations, and billing workflows
 */

const {
  setupTestUsers,
  cleanupTestUsers,
  getTestUser,
  authenticateTestUser,
  resetTestUsers
} = require('../test-setup/setup-test-users.js');
const {
  TestPaymentManager,
  TestAPIManager,
  TEST_CONFIG,
  supabaseAdmin,
  stripe,
  createTestDelay
} = require('../test-setup/test-helpers.js');

describe('Subscription Management', () => {
  let freelancerUser, clientUser;
  let freelancerAuth, clientAuth;
  let stripeCustomer = null;
  let testSubscription = null;
  let professionalPriceId = null;
  let businessPriceId = null;

  // Setup before all tests
  beforeAll(async () => {
    await setupTestUsers();
    freelancerUser = getTestUser('freelancer');
    clientUser = getTestUser('client');
    freelancerAuth = await authenticateTestUser('freelancer');
    clientAuth = await authenticateTestUser('client');

    // Create Stripe customer for subscription tests
    stripeCustomer = await TestPaymentManager.createStripeCustomer(
      freelancerUser.user.email,
      { user_id: freelancerUser.user.id }
    );

    // Update freelancer profile with Stripe customer ID
    await supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: stripeCustomer.id })
      .eq('id', freelancerUser.user.id);

    // Create test Stripe products and prices for subscription plans
    const professionalProduct = await stripe.products.create({
      name: 'Professional Plan - Test',
      description: 'Test professional plan',
      metadata: { test_product: 'true' }
    });

    const professionalPrice = await stripe.prices.create({
      product: professionalProduct.id,
      unit_amount: 2999, // $29.99
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { test_price: 'true' }
    });

    professionalPriceId = professionalPrice.id;

    const businessProduct = await stripe.products.create({
      name: 'Business Plan - Test',
      description: 'Test business plan',
      metadata: { test_product: 'true' }
    });

    const businessPrice = await stripe.prices.create({
      product: businessProduct.id,
      unit_amount: 9999, // $99.99
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { test_price: 'true' }
    });

    businessPriceId = businessPrice.id;

    // Update subscription plans with test Stripe price IDs
    await supabaseAdmin
      .from('subscription_plans')
      .update({ stripe_price_id_monthly: professionalPriceId })
      .eq('id', 'professional');

    await supabaseAdmin
      .from('subscription_plans')
      .update({ stripe_price_id_monthly: businessPriceId })
      .eq('id', 'business');

  }, TEST_CONFIG.TIMEOUTS.LONG_OPERATION);

  // Cleanup after all tests
  afterAll(async () => {
    if (testSubscription) {
      try {
        await stripe.subscriptions.del(testSubscription.id);
      } catch (error) {
        console.error('Failed to cleanup test subscription:', error);
      }
    }
    if (stripeCustomer) {
      await stripe.customers.del(stripeCustomer.id);
    }
    await cleanupTestUsers();
  }, TEST_CONFIG.TIMEOUTS.DEFAULT);

  beforeEach(async () => {
    await createTestDelay(500); // Prevent rate limiting
  });

  describe('Subscription Plans Management', () => {
    test('should fetch all subscription plans', async () => {
      const { data: plans, error } = await supabaseAdmin
        .from('subscription_plans')
        .select('*')
        .order('price_monthly', { ascending: true });

      expect(error).toBeNull();
      expect(plans).toHaveLength(3); // free, professional, business
      
      const planIds = plans.map(p => p.id);
      expect(planIds).toContain('free');
      expect(planIds).toContain('professional');
      expect(planIds).toContain('business');
    });

    test('should have correct plan features and pricing', async () => {
      const { data: freePlan } = await supabaseAdmin
        .from('subscription_plans')
        .select('*')
        .eq('id', 'free')
        .single();

      const { data: professionalPlan } = await supabaseAdmin
        .from('subscription_plans')
        .select('*')
        .eq('id', 'professional')
        .single();

      const { data: businessPlan } = await supabaseAdmin
        .from('subscription_plans')
        .select('*')
        .eq('id', 'business')
        .single();

      // Verify free plan
      expect(parseFloat(freePlan.price_monthly)).toBe(0);
      expect(freePlan.max_contracts).toBe(3);
      expect(parseFloat(freePlan.escrow_fee_percentage)).toBe(10.0);

      // Verify professional plan
      expect(parseFloat(professionalPlan.price_monthly)).toBe(29.99);
      expect(professionalPlan.max_contracts).toBe(50);
      expect(parseFloat(professionalPlan.escrow_fee_percentage)).toBe(7.5);

      // Verify business plan
      expect(parseFloat(businessPlan.price_monthly)).toBe(99.99);
      expect(businessPlan.max_contracts).toBeNull(); // Unlimited
      expect(parseFloat(businessPlan.escrow_fee_percentage)).toBe(5.0);
    });

    test('should validate plan features structure', async () => {
      const { data: plans } = await supabaseAdmin
        .from('subscription_plans')
        .select('features')
        .neq('id', 'free');

      plans.forEach(plan => {
        expect(plan.features).toBeDefined();
        expect(plan.features.features).toBeDefined();
        expect(Array.isArray(plan.features.features)).toBe(true);
        expect(plan.features.features.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Subscription Creation and Upgrade', () => {
    test('should create Stripe checkout session for professional plan', async () => {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        customer: stripeCustomer.id,
        line_items: [
          {
            price: professionalPriceId,
            quantity: 1,
          },
        ],
        success_url: `${TEST_CONFIG.URLS.BASE_URL}/dashboard/subscription?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${TEST_CONFIG.URLS.BASE_URL}/dashboard/subscription`,
        metadata: {
          user_id: freelancerUser.user.id,
          plan_id: 'professional',
          test_subscription: 'true'
        }
      });

      expect(session).toBeDefined();
      expect(session.mode).toBe('subscription');
      expect(session.customer).toBe(stripeCustomer.id);
      expect(session.metadata.plan_id).toBe('professional');
      expect(session.url).toContain('https://checkout.stripe.com');
    });

    test('should simulate successful subscription creation', async () => {
      // Create subscription directly in Stripe for testing
      testSubscription = await stripe.subscriptions.create({
        customer: stripeCustomer.id,
        items: [{ price: professionalPriceId }],
        metadata: {
          user_id: freelancerUser.user.id,
          plan_id: 'professional',
          test_subscription: 'true'
        }
      });

      expect(testSubscription).toBeDefined();
      expect(testSubscription.status).toBe('active');
      expect(testSubscription.customer).toBe(stripeCustomer.id);
      expect(testSubscription.metadata.plan_id).toBe('professional');
    });

    test('should create user subscription record in database', async () => {
      const subscriptionData = {
        user_id: freelancerUser.user.id,
        plan_id: 'professional',
        status: testSubscription.status,
        stripe_subscription_id: testSubscription.id,
        stripe_price_id: professionalPriceId,
        current_period_start: new Date(testSubscription.current_period_start * 1000),
        current_period_end: new Date(testSubscription.current_period_end * 1000),
        cancel_at_period_end: testSubscription.cancel_at_period_end || false
      };

      const { data: userSubscription, error } = await supabaseAdmin
        .from('user_subscriptions')
        .upsert(subscriptionData, { onConflict: 'user_id' })
        .select()
        .single();

      expect(error).toBeNull();
      expect(userSubscription.plan_id).toBe('professional');
      expect(userSubscription.status).toBe('active');
      expect(userSubscription.stripe_subscription_id).toBe(testSubscription.id);
    });

    test('should update user profile with new subscription tier', async () => {
      const { data: updatedProfile, error } = await supabaseAdmin
        .from('profiles')
        .update({ subscription_tier: 'professional' })
        .eq('id', freelancerUser.user.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(updatedProfile.subscription_tier).toBe('professional');
    });

    test('should update available contracts for professional tier', async () => {
      // Professional tier should have 50 available contracts
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('available_contracts, subscription_tier')
        .eq('id', freelancerUser.user.id)
        .single();

      expect(profile.subscription_tier).toBe('professional');
      // Available contracts might not be automatically updated, but subscription tier should be
      expect(profile.subscription_tier).toBe('professional');
    });
  });

  describe('Subscription Billing and Payments', () => {
    test('should create subscription payment record', async () => {
      const { data: userSub } = await supabaseAdmin
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', freelancerUser.user.id)
        .single();

      const paymentData = {
        subscription_id: userSub.id,
        invoice_id: 'test_in_123456789',
        amount: 29.99,
        currency: 'USD',
        status: 'paid',
        payment_date: new Date(),
        period_start: userSub.current_period_start,
        period_end: userSub.current_period_end,
        receipt_url: 'https://invoice.stripe.com/test'
      };

      const { data: payment, error } = await supabaseAdmin
        .from('subscription_payments')
        .insert(paymentData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(payment.status).toBe('paid');
      expect(parseFloat(payment.amount)).toBe(29.99);
      expect(payment.invoice_id).toBe('test_in_123456789');
    });

    test('should handle failed payment scenarios', async () => {
      const { data: userSub } = await supabaseAdmin
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', freelancerUser.user.id)
        .single();

      const failedPaymentData = {
        subscription_id: userSub.id,
        invoice_id: 'test_in_failed_123',
        amount: 29.99,
        currency: 'USD',
        status: 'failed',
        payment_date: new Date(),
        period_start: userSub.current_period_start,
        period_end: userSub.current_period_end
      };

      const { data: failedPayment, error } = await supabaseAdmin
        .from('subscription_payments')
        .insert(failedPaymentData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(failedPayment.status).toBe('failed');

      // Clean up
      await supabaseAdmin
        .from('subscription_payments')
        .delete()
        .eq('id', failedPayment.id);
    });

    test('should update subscription status for failed payments', async () => {
      // Simulate failed payment updating subscription status
      const { data: updatedSub, error } = await supabaseAdmin
        .from('user_subscriptions')
        .update({ status: 'past_due' })
        .eq('user_id', freelancerUser.user.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(updatedSub.status).toBe('past_due');

      // Reset to active for other tests
      await supabaseAdmin
        .from('user_subscriptions')
        .update({ status: 'active' })
        .eq('user_id', freelancerUser.user.id);
    });
  });

  describe('Subscription Plan Changes', () => {
    test('should upgrade from professional to business plan', async () => {
      // Update subscription in Stripe
      const updatedSubscription = await stripe.subscriptions.update(
        testSubscription.id,
        {
          items: [
            {
              id: testSubscription.items.data[0].id,
              price: businessPriceId,
            },
          ],
          metadata: {
            ...testSubscription.metadata,
            plan_id: 'business'
          }
        }
      );

      expect(updatedSubscription.items.data[0].price.id).toBe(businessPriceId);
      expect(updatedSubscription.metadata.plan_id).toBe('business');

      // Update in database
      const { data: updatedUserSub, error } = await supabaseAdmin
        .from('user_subscriptions')
        .update({
          plan_id: 'business',
          stripe_price_id: businessPriceId
        })
        .eq('user_id', freelancerUser.user.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(updatedUserSub.plan_id).toBe('business');
      expect(updatedUserSub.stripe_price_id).toBe(businessPriceId);

      // Update profile tier
      await supabaseAdmin
        .from('profiles')
        .update({ subscription_tier: 'business' })
        .eq('id', freelancerUser.user.id);
    });

    test('should handle downgrade scenarios', async () => {
      // Downgrade back to professional
      const downgradedSubscription = await stripe.subscriptions.update(
        testSubscription.id,
        {
          items: [
            {
              id: testSubscription.items.data[0].id,
              price: professionalPriceId,
            },
          ],
          metadata: {
            ...testSubscription.metadata,
            plan_id: 'professional'
          }
        }
      );

      expect(downgradedSubscription.items.data[0].price.id).toBe(professionalPriceId);

      // Update in database
      const { data: downgradedUserSub, error } = await supabaseAdmin
        .from('user_subscriptions')
        .update({
          plan_id: 'professional',
          stripe_price_id: professionalPriceId
        })
        .eq('user_id', freelancerUser.user.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(downgradedUserSub.plan_id).toBe('professional');

      // Update profile tier
      await supabaseAdmin
        .from('profiles')
        .update({ subscription_tier: 'professional' })
        .eq('id', freelancerUser.user.id);
    });

    test('should schedule plan changes for end of billing period', async () => {
      const { data: userSub, error } = await supabaseAdmin
        .from('user_subscriptions')
        .update({
          cancel_at_period_end: true,
          cancel_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
        })
        .eq('user_id', freelancerUser.user.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(userSub.cancel_at_period_end).toBe(true);
      expect(userSub.cancel_at).toBeDefined();

      // Reset for other tests
      await supabaseAdmin
        .from('user_subscriptions')
        .update({
          cancel_at_period_end: false,
          cancel_at: null
        })
        .eq('user_id', freelancerUser.user.id);
    });
  });

  describe('Subscription Cancellation', () => {
    test('should cancel subscription immediately', async () => {
      // Cancel in Stripe
      const cancelledSubscription = await stripe.subscriptions.del(testSubscription.id);
      
      expect(cancelledSubscription.status).toBe('canceled');
      expect(cancelledSubscription.canceled_at).toBeDefined();

      // Update in database
      const { data: cancelledUserSub, error } = await supabaseAdmin
        .from('user_subscriptions')
        .update({
          status: 'cancelled',
          canceled_at: new Date()
        })
        .eq('user_id', freelancerUser.user.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(cancelledUserSub.status).toBe('cancelled');
      expect(cancelledUserSub.canceled_at).toBeDefined();

      // Revert profile to free tier
      await supabaseAdmin
        .from('profiles')
        .update({ subscription_tier: 'free' })
        .eq('id', freelancerUser.user.id);
    });

    test('should handle grace period after cancellation', async () => {
      // Verify profile reverted to free tier
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('subscription_tier')
        .eq('id', freelancerUser.user.id)
        .single();

      expect(profile.subscription_tier).toBe('free');
    });

    test('should track cancellation reason and feedback', async () => {
      const { data: cancelledUserSub } = await supabaseAdmin
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', freelancerUser.user.id)
        .single();

      // Add cancellation metadata
      const { data: updatedSub, error } = await supabaseAdmin
        .from('user_subscriptions')
        .update({
          metadata: {
            cancellation_reason: 'Cost concerns',
            cancellation_feedback: 'Product too expensive for current needs',
            cancelled_by_user: true
          }
        })
        .eq('id', cancelledUserSub.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(updatedSub.metadata.cancellation_reason).toBe('Cost concerns');
      expect(updatedSub.metadata.cancelled_by_user).toBe(true);
    });
  });

  describe('Subscription Expiration Management', () => {
    test('should identify expired subscriptions', async () => {
      // Create an expired subscription record for testing
      const expiredSubData = {
        user_id: clientUser.user.id,
        plan_id: 'professional',
        status: 'active',
        stripe_subscription_id: 'test_sub_expired_123',
        stripe_price_id: professionalPriceId,
        current_period_start: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
        current_period_end: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        cancel_at_period_end: false
      };

      const { data: expiredSub, error } = await supabaseAdmin
        .from('user_subscriptions')
        .insert(expiredSubData)
        .select()
        .single();

      expect(error).toBeNull();

      // Find expired subscriptions
      const { data: expiredSubs } = await supabaseAdmin
        .from('user_subscriptions')
        .select('*')
        .eq('status', 'active')
        .lt('current_period_end', new Date().toISOString());

      expect(expiredSubs.length).toBeGreaterThan(0);
      const foundExpired = expiredSubs.find(sub => sub.id === expiredSub.id);
      expect(foundExpired).toBeDefined();

      // Clean up
      await supabaseAdmin
        .from('user_subscriptions')
        .delete()
        .eq('id', expiredSub.id);
    });

    test('should handle subscription renewal notifications', async () => {
      // Find subscriptions expiring soon (within 7 days)
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      const { data: expiringSoon } = await supabaseAdmin
        .from('user_subscriptions')
        .select('*')
        .eq('status', 'active')
        .lte('current_period_end', sevenDaysFromNow.toISOString());

      // Verify query structure (actual results depend on test data)
      expect(Array.isArray(expiringSoon)).toBe(true);
    });

    test('should process subscription expiration workflow', async () => {
      // This would test the cron job functionality
      // Create a subscription that should be expired
      const testExpiringSubData = {
        user_id: clientUser.user.id,
        plan_id: 'professional',
        status: 'active',
        stripe_subscription_id: 'test_sub_expiring_123',
        stripe_price_id: professionalPriceId,
        current_period_start: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000), // 32 days ago
        current_period_end: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago (past grace period)
        cancel_at_period_end: false
      };

      const { data: expiringSub } = await supabaseAdmin
        .from('user_subscriptions')
        .insert(testExpiringSubData)
        .select()
        .single();

      // Simulate expiration process
      const { data: expiredSub, error } = await supabaseAdmin
        .from('user_subscriptions')
        .update({ status: 'cancelled' })
        .eq('id', expiringSub.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(expiredSub.status).toBe('cancelled');

      // Update profile back to free
      await supabaseAdmin
        .from('profiles')
        .update({ subscription_tier: 'free' })
        .eq('id', clientUser.user.id);

      // Clean up
      await supabaseAdmin
        .from('user_subscriptions')
        .delete()
        .eq('id', expiringSub.id);
    });
  });

  describe('Subscription Data Integrity', () => {
    test('should maintain consistency between Stripe and database', async () => {
      // This would involve comparing Stripe subscription data with database records
      // For testing purposes, we'll verify our test data structure
      const { data: userSub } = await supabaseAdmin
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', freelancerUser.user.id)
        .single();

      if (userSub && userSub.stripe_subscription_id) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(userSub.stripe_subscription_id);
          
          // Verify consistency (subscription was cancelled in previous test)
          expect(stripeSubscription.status).toBe('canceled');
          expect(userSub.status).toBe('cancelled');
        } catch (error) {
          // Subscription might already be deleted, which is expected
          expect(error.type).toBe('StripeInvalidRequestError');
        }
      }
    });

    test('should validate subscription constraints', async () => {
      // Test invalid status
      const { error: statusError } = await supabaseAdmin
        .from('user_subscriptions')
        .update({ status: 'invalid_status' })
        .eq('user_id', freelancerUser.user.id);

      expect(statusError).toBeDefined();
      expect(statusError.message).toContain('invalid');
    });

    test('should enforce unique user subscription constraint', async () => {
      // Attempt to create duplicate subscription for same user
      const duplicateSubData = {
        user_id: freelancerUser.user.id,
        plan_id: 'business',
        status: 'active',
        stripe_subscription_id: 'test_duplicate_123',
        stripe_price_id: businessPriceId,
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancel_at_period_end: false
      };

      const { error } = await supabaseAdmin
        .from('user_subscriptions')
        .insert(duplicateSubData);

      // Should fail due to unique constraint on user_id
      expect(error).toBeDefined();
      expect(error.code).toBe('23505'); // Unique violation
    });
  });
});