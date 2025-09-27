/**
 * Test Helper Functions
 * Utility functions for test setup, user management, and common operations
 */

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { TEST_CONFIG, createTestDelay } = require('./test-config.js');

// Initialize test clients with fallback values for testing
// Ensure environment is loaded before creating client
let _supabaseAdmin;

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://test-project.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE || 'test-service-role-key'
    );
  }
  return _supabaseAdmin;
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock_stripe_key', {
  apiVersion: '2024-06-20',
});

/**
 * User Management Helpers
 */
export class TestUserManager {
  static async createTestUser(userData) {
    try {
      // Create user in Supabase Auth
      const { data: authData, error: authError } = await getSupabaseAdmin().auth.admin.createUser({
        email: userData.email,
        password: userData.password,
        email_confirm: true,
        user_metadata: {
          full_name: userData.displayName,
          user_type: userData.userType
        }
      });

      if (authError) {
        throw new Error(`Failed to create auth user: ${authError.message}`);
      }

      const userId = authData.user.id;

      // Create profile
      const { data: profile, error: profileError } = await getSupabaseAdmin()
        .from('profiles')
        .insert({
          id: userId,
          display_name: userData.displayName,
          user_type: userData.userType,
          bio: userData.profile?.bio,
          company_name: userData.profile?.companyName,
          website: userData.profile?.website,
          subscription_tier: 'free',
          available_contracts: 3
        })
        .select()
        .single();

      if (profileError) {
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }

      return {
        user: authData.user,
        profile,
        auth: {
          email: userData.email,
          password: userData.password
        }
      };
    } catch (error) {
      console.error('Error creating test user:', error);
      throw error;
    }
  }

  static async deleteTestUser(userId) {
    try {
      // Delete from profiles first (due to foreign key constraints)
      await getSupabaseAdmin()
        .from('profiles')
        .delete()
        .eq('id', userId);

      // Delete from auth
      await getSupabaseAdmin().auth.admin.deleteUser(userId);

      return true;
    } catch (error) {
      console.error('Error deleting test user:', error);
      return false;
    }
  }

  static async cleanupTestUsers() {
    try {
      // Find all test users (by email pattern)
      const { data: profiles } = await getSupabaseAdmin()
        .from('profiles')
        .select('id')
        .or('id.like.%test%,display_name.ilike.%test%');

      if (profiles && profiles.length > 0) {
        for (const profile of profiles) {
          await this.deleteTestUser(profile.id);
        }
      }

      return true;
    } catch (error) {
      console.error('Error cleaning up test users:', error);
      return false;
    }
  }

  static async authenticateUser(email, password) {
    try {
      const { data, error } = await getSupabaseAdmin().auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw new Error(`Authentication failed: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Error authenticating user:', error);
      throw error;
    }
  }
}

/**
 * Contract Management Helpers
 */
export class TestContractManager {
  static async createContract(creatorId, contractData, userRole = 'freelancer') {
    try {
      const { data: contract, error } = await getSupabaseAdmin()
        .from('contracts')
        .insert({
          title: contractData.title,
          description: contractData.description,
          creator_id: creatorId,
          client_id: userRole === 'client' ? creatorId : null,
          freelancer_id: userRole === 'freelancer' ? creatorId : null,
          client_email: userRole === 'freelancer' ? TEST_CONFIG.USERS.CLIENT.email : null,
          freelancer_email: userRole === 'client' ? TEST_CONFIG.USERS.FREELANCER.email : null,
          content: {
            template: 'test',
            sections: [],
            created_with_wizard: true
          },
          type: contractData.type,
          total_amount: contractData.totalAmount,
          currency: contractData.currency,
          start_date: contractData.startDate,
          end_date: contractData.endDate,
          terms_and_conditions: contractData.termsAndConditions,
          status: 'draft'
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create contract: ${error.message}`);
      }

      // Create milestones if provided
      if (contractData.milestones && contractData.milestones.length > 0) {
        const milestones = contractData.milestones.map(milestone => ({
          contract_id: contract.id,
          title: milestone.title,
          description: milestone.description,
          amount: milestone.amount,
          due_date: milestone.dueDate,
          status: 'pending'
        }));

        const { error: milestonesError } = await supabaseAdmin
          .from('milestones')
          .insert(milestones);

        if (milestonesError) {
          throw new Error(`Failed to create milestones: ${milestonesError.message}`);
        }
      }

      // Create contract party for creator
      await supabaseAdmin
        .from('contract_parties')
        .insert({
          contract_id: contract.id,
          user_id: creatorId,
          role: 'creator',
          status: 'signed'
        });

      return contract;
    } catch (error) {
      console.error('Error creating contract:', error);
      throw error;
    }
  }

  static async signContract(contractId, userId, signatureData = 'Test Digital Signature') {
    try {
      const { data, error } = await supabaseAdmin
        .from('contract_parties')
        .update({
          status: 'signed',
          signature_date: new Date().toISOString(),
          signature_data: signatureData
        })
        .eq('contract_id', contractId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to sign contract: ${error.message}`);
      }

      // Update contract status if all parties have signed
      const { data: allParties } = await supabaseAdmin
        .from('contract_parties')
        .select('*')
        .eq('contract_id', contractId);

      const allSigned = allParties.every(party => party.status === 'signed');
      
      if (allSigned) {
        await supabaseAdmin
          .from('contracts')
          .update({ status: 'signed' })
          .eq('id', contractId);
      }

      return data;
    } catch (error) {
      console.error('Error signing contract:', error);
      throw error;
    }
  }

  static async deleteContract(contractId) {
    try {
      // Delete related records first
      await getSupabaseAdmin().from('contract_parties').delete().eq('contract_id', contractId);
      await getSupabaseAdmin().from('milestones').delete().eq('contract_id', contractId);
      
      // Delete contract
      await getSupabaseAdmin().from('contracts').delete().eq('id', contractId);
      
      return true;
    } catch (error) {
      console.error('Error deleting contract:', error);
      return false;
    }
  }
}

/**
 * Payment and Subscription Helpers
 */
export class TestPaymentManager {
  static async createStripeCustomer(email, metadata = {}) {
    try {
      const customer = await stripe.customers.create({
        email,
        metadata: {
          test_customer: 'true',
          ...metadata
        }
      });

      return customer;
    } catch (error) {
      console.error('Error creating Stripe customer:', error);
      throw error;
    }
  }

  static async createTestSubscription(customerId, priceId) {
    try {
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          test_subscription: 'true'
        }
      });

      return subscription;
    } catch (error) {
      console.error('Error creating test subscription:', error);
      throw error;
    }
  }

  static async cleanupStripeTestData() {
    try {
      // List and delete test customers
      const customers = await stripe.customers.list({
        limit: 100
      });

      for (const customer of customers.data) {
        if (customer.metadata?.test_customer === 'true') {
          await stripe.customers.del(customer.id);
        }
      }

      return true;
    } catch (error) {
      console.error('Error cleaning up Stripe test data:', error);
      return false;
    }
  }
}

/**
 * Database Helpers
 */
export class TestDatabaseManager {
  static async cleanupTestData() {
    try {
      if (!TEST_CONFIG.CLEANUP.ENABLED) {
        console.log('Test data cleanup is disabled');
        return;
      }

      // Clean up in correct order due to foreign key constraints
      await getSupabaseAdmin().from('contract_parties').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await getSupabaseAdmin().from('milestones').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await getSupabaseAdmin().from('contracts').delete().like('title', '%Test%');
      await getSupabaseAdmin().from('user_subscriptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await getSupabaseAdmin().from('profiles').delete().like('display_name', '%Test%');

      // Clean up Stripe test data
      await TestPaymentManager.cleanupStripeTestData();

      console.log('Test data cleanup completed');
      return true;
    } catch (error) {
      console.error('Error during test data cleanup:', error);
      return false;
    }
  }

  static async setupTestDatabase() {
    try {
      // Ensure required subscription plans exist
      const { data: existingPlans } = await supabaseAdmin
        .from('subscription_plans')
        .select('*');

      if (!existingPlans || existingPlans.length === 0) {
        const plans = [
          {
            id: 'free',
            name: 'Free Plan',
            price_monthly: 0,
            price_yearly: 0,
            escrow_fee_percentage: 10.0,
            max_contracts: 3,
            features: { features: ['Basic contracts', 'Email support'] }
          },
          {
            id: 'professional',
            name: 'Professional Plan',
            price_monthly: 29.99,
            price_yearly: 299.99,
            escrow_fee_percentage: 7.5,
            max_contracts: 50,
            features: { features: ['Unlimited contracts', 'Priority support', 'Advanced templates'] }
          },
          {
            id: 'business',
            name: 'Business Plan',
            price_monthly: 99.99,
            price_yearly: 999.99,
            escrow_fee_percentage: 5.0,
            max_contracts: null,
            features: { features: ['Everything in Professional', 'Team collaboration', 'Custom branding'] }
          }
        ];

        await getSupabaseAdmin().from('subscription_plans').insert(plans);
      }

      return true;
    } catch (error) {
      console.error('Error setting up test database:', error);
      return false;
    }
  }
}

/**
 * API Testing Helpers
 */
export class TestAPIManager {
  static async makeAuthenticatedRequest(method, endpoint, data = null, token = null) {
    const url = `${TEST_CONFIG.URLS.API_BASE}${endpoint}`;
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      const responseData = await response.json();

      return {
        status: response.status,
        success: response.ok,
        data: responseData,
        headers: response.headers
      };
    } catch (error) {
      console.error(`API request failed: ${method} ${endpoint}`, error);
      throw error;
    }
  }

  static async uploadTestFile(endpoint, file, token = null) {
    const url = `${TEST_CONFIG.URLS.API_BASE}${endpoint}`;
    
    const formData = new FormData();
    formData.append('file', file);

    const options = {
      method: 'POST',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: formData
    };

    try {
      const response = await fetch(url, options);
      const responseData = await response.json();

      return {
        status: response.status,
        success: response.ok,
        data: responseData
      };
    } catch (error) {
      console.error(`File upload failed: ${endpoint}`, error);
      throw error;
    }
  }
}

/**
 * Test Environment Setup
 */
export class TestEnvironment {
  static async setup() {
    try {
      console.log('Setting up test environment...');
      
      // Setup database
      await TestDatabaseManager.setupTestDatabase();
      
      // Clean up any existing test data
      await TestDatabaseManager.cleanupTestData();
      
      console.log('Test environment setup completed');
      return true;
    } catch (error) {
      console.error('Failed to setup test environment:', error);
      throw error;
    }
  }

  static async teardown() {
    try {
      console.log('Tearing down test environment...');
      
      // Clean up test data
      await TestDatabaseManager.cleanupTestData();
      
      console.log('Test environment teardown completed');
      return true;
    } catch (error) {
      console.error('Failed to teardown test environment:', error);
      return false;
    }
  }
}

// Export all helpers  
const supabaseAdmin = getSupabaseAdmin();

module.exports = {
  TestUserManager,
  TestContractManager,
  TestPaymentManager,
  TestDatabaseManager,
  TestAPIManager,
  TestEnvironment,
  TEST_CONFIG,
  stripe,
  supabaseAdmin,
  createTestDelay
};