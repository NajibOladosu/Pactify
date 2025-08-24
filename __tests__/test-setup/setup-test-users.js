/**
 * Test Users Setup
 * Creates and manages test users for comprehensive testing
 */

import {
  TestUserManager,
  TestEnvironment,
  TEST_CONFIG
} from './test-helpers.js';

/**
 * Global test users that will be used across all test suites
 */
export let testUsers = {
  freelancer: null,
  client: null
};

/**
 * Setup test users before all tests
 */
export async function setupTestUsers() {
  try {
    console.log('Setting up test users...');

    // Setup test environment first
    await TestEnvironment.setup();

    // Create freelancer test user
    console.log('Creating freelancer test user...');
    testUsers.freelancer = await TestUserManager.createTestUser(TEST_CONFIG.USERS.FREELANCER);
    console.log(`Freelancer created: ${testUsers.freelancer.user.email} (ID: ${testUsers.freelancer.user.id})`);

    // Create client test user
    console.log('Creating client test user...');
    testUsers.client = await TestUserManager.createTestUser(TEST_CONFIG.USERS.CLIENT);
    console.log(`Client created: ${testUsers.client.user.email} (ID: ${testUsers.client.user.id})`);

    console.log('Test users setup completed successfully');
    return testUsers;

  } catch (error) {
    console.error('Failed to setup test users:', error);
    throw error;
  }
}

/**
 * Cleanup test users after all tests
 */
export async function cleanupTestUsers() {
  try {
    console.log('Cleaning up test users...');

    if (testUsers.freelancer) {
      await TestUserManager.deleteTestUser(testUsers.freelancer.user.id);
      console.log('Freelancer test user deleted');
    }

    if (testUsers.client) {
      await TestUserManager.deleteTestUser(testUsers.client.user.id);
      console.log('Client test user deleted');
    }

    // Teardown test environment
    await TestEnvironment.teardown();

    console.log('Test users cleanup completed');

  } catch (error) {
    console.error('Failed to cleanup test users:', error);
    // Don't throw here as this is cleanup
  }
}

/**
 * Get test user by role
 */
export function getTestUser(role) {
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
export async function authenticateTestUser(role) {
  const user = getTestUser(role);
  if (!user) {
    throw new Error(`Test user not found for role: ${role}`);
  }

  const session = await TestUserManager.authenticateUser(
    user.auth.email,
    user.auth.password
  );

  return {
    user: session.user,
    session: session.session,
    profile: user.profile
  };
}

/**
 * Reset test users to clean state
 */
export async function resetTestUsers() {
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
export async function verifyTestUsers() {
  try {
    if (!testUsers.freelancer || !testUsers.client) {
      throw new Error('Test users not initialized. Call setupTestUsers() first.');
    }

    // Verify freelancer
    const freelancerAuth = await TestUserManager.authenticateUser(
      testUsers.freelancer.auth.email,
      testUsers.freelancer.auth.password
    );

    if (!freelancerAuth.user) {
      throw new Error('Freelancer authentication failed');
    }

    // Verify client
    const clientAuth = await TestUserManager.authenticateUser(
      testUsers.client.auth.email,
      testUsers.client.auth.password
    );

    if (!clientAuth.user) {
      throw new Error('Client authentication failed');
    }

    console.log('Test users verification passed');
    return true;

  } catch (error) {
    console.error('Test users verification failed:', error);
    throw error;
  }
}

export default {
  setupTestUsers,
  cleanupTestUsers,
  getTestUser,
  authenticateTestUser,
  resetTestUsers,
  verifyTestUsers,
  testUsers
};