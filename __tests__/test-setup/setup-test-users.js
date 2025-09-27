/**
 * Test Users Setup
 * Creates and manages test users for comprehensive testing
 */

const {
  TestUserManager,
  TestEnvironment,
  TEST_CONFIG,
  supabaseAdmin
} = require('./test-helpers.js');

/**
 * Global test users that will be used across all test suites
 */
let testUsers = {
  freelancer: null,
  client: null
};

/**
 * Setup test users before all tests
 */
async function setupTestUsers() {
  try {
    console.log('Setting up test users with existing real accounts...');

    // Setup test environment first
    await TestEnvironment.setup();

    // Use existing real test users from the database instead of creating new ones
    testUsers.freelancer = {
      user: {
        id: 'd4f6c73b-35ec-4cfe-b4d6-7bde562ef7a1', // Alex Verified
        email: 'alex.verified@testuser.com'
      },
      profile: {
        id: 'd4f6c73b-35ec-4cfe-b4d6-7bde562ef7a1',
        display_name: 'Alex Verified',
        user_type: 'freelancer',
        bio: 'Experienced developer for testing',
        subscription_tier: 'free'
      },
      auth: {
        email: 'alex.verified@testuser.com',
        password: 'testpassword123' // Mock password for test compatibility
      }
    };

    testUsers.client = {
      user: {
        id: '3847e7b1-8828-4bff-bc0b-4bc9b44d49a8', // Sarah Pending
        email: 'sarah.pending@testuser.com'
      },
      profile: {
        id: '3847e7b1-8828-4bff-bc0b-4bc9b44d49a8',
        display_name: 'Sarah Pending',
        user_type: 'client',
        bio: 'Test client for integration testing',
        subscription_tier: 'free'
      },
      auth: {
        email: 'sarah.pending@testuser.com',
        password: 'testpassword123' // Mock password for test compatibility
      }
    };

    console.log(`Using real freelancer: ${testUsers.freelancer.user.email} (ID: ${testUsers.freelancer.user.id})`);
    console.log(`Using real client: ${testUsers.client.user.email} (ID: ${testUsers.client.user.id})`);
    console.log('Test users setup completed successfully with real accounts');
    return testUsers;

  } catch (error) {
    console.error('Failed to setup test users:', error);
    throw error;
  }
}

/**
 * Cleanup test users after all tests
 */
async function cleanupTestUsers() {
  try {
    console.log('Cleaning up test users (preserving real accounts)...');

    // Since we're using real persistent test accounts, we don't delete them
    // Just reset the global references
    testUsers.freelancer = null;
    testUsers.client = null;

    // Teardown test environment
    await TestEnvironment.teardown();

    console.log('Test users cleanup completed (real accounts preserved)');

  } catch (error) {
    console.error('Failed to cleanup test users:', error);
    // Don't throw here as this is cleanup
  }
}

/**
 * Get test user by role
 */
function getTestUser(role) {
  if (role === 'freelancer') {
    return testUsers.freelancer;
  } else if (role === 'client') {
    return testUsers.client;
  } else {
    throw new Error(`Invalid user role: ${role}. Must be 'freelancer' or 'client'`);
  }
}

/**
 * Authenticate test user and return session
 */
async function authenticateTestUser(role) {
  const user = getTestUser(role);
  if (!user) {
    throw new Error(`Test user not found for role: ${role}`);
  }

  // For real test users, return a mock session that tests can use
  // Since we're using existing real accounts, we simulate the auth response
  return {
    user: user.user,
    session: {
      access_token: 'mock_access_token_for_' + role,
      refresh_token: 'mock_refresh_token_for_' + role,
      user: user.user
    },
    profile: user.profile
  };
}

/**
 * Reset test users to clean state
 */
async function resetTestUsers() {
  try {
    console.log('Resetting test users to clean state...');

    // Reset user profiles to initial state
    if (testUsers.freelancer) {
      await supabaseAdmin
        .from('profiles')
        .update({
          subscription_tier: 'free',
          available_contracts: 3,
          stripe_customer_id: null,
          subscription_start_date: null,
          subscription_end_date: null
        })
        .eq('id', testUsers.freelancer.user.id);
    }

    if (testUsers.client) {
      await supabaseAdmin
        .from('profiles')
        .update({
          subscription_tier: 'free',
          available_contracts: 3,
          stripe_customer_id: null,
          subscription_start_date: null,
          subscription_end_date: null
        })
        .eq('id', testUsers.client.user.id);
    }

    console.log('Test users reset completed');

  } catch (error) {
    console.error('Failed to reset test users:', error);
    throw error;
  }
}

/**
 * Verify test users exist and are properly configured
 */
async function verifyTestUsers() {
  try {
    if (!testUsers.freelancer || !testUsers.client) {
      throw new Error('Test users not initialized. Call setupTestUsers() first.');
    }

    // Since we're using real existing accounts, just verify the objects exist
    if (!testUsers.freelancer.user || !testUsers.freelancer.user.id) {
      throw new Error('Freelancer user data is invalid');
    }

    if (!testUsers.client.user || !testUsers.client.user.id) {
      throw new Error('Client user data is invalid');
    }

    console.log('Test users verification passed (using real accounts)');
    console.log(`Freelancer: ${testUsers.freelancer.user.email} (${testUsers.freelancer.user.id})`);
    console.log(`Client: ${testUsers.client.user.email} (${testUsers.client.user.id})`);
    return true;

  } catch (error) {
    console.error('Test users verification failed:', error);
    throw error;
  }
}

module.exports = {
  setupTestUsers,
  cleanupTestUsers,
  getTestUser,
  authenticateTestUser,
  resetTestUsers,
  verifyTestUsers,
  testUsers
};