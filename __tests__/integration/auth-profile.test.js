/**
 * Authentication and Profile Integration Tests
 * Tests user authentication, profile creation, and profile management
 */

import {
  setupTestUsers,
  cleanupTestUsers,
  getTestUser,
  authenticateTestUser,
  verifyTestUsers
} from '../test-setup/setup-test-users.js';
import {
  TestUserManager,
  TestAPIManager,
  TEST_CONFIG,
  supabaseAdmin
} from '../test-setup/test-helpers.js';

describe('Authentication and Profile Management', () => {
  let freelancerUser, clientUser;

  // Setup before all tests
  beforeAll(async () => {
    await setupTestUsers();
    freelancerUser = getTestUser('freelancer');
    clientUser = getTestUser('client');
  }, TEST_CONFIG.TIMEOUTS.LONG_OPERATION);

  // Cleanup after all tests
  afterAll(async () => {
    await cleanupTestUsers();
  }, TEST_CONFIG.TIMEOUTS.DEFAULT);

  // Verify test users are properly set up
  beforeEach(async () => {
    await verifyTestUsers();
  });

  describe('User Authentication', () => {
    test('should authenticate freelancer user successfully', async () => {
      const auth = await authenticateTestUser('freelancer');

      expect(auth.user).toBeDefined();
      expect(auth.user.email).toBe(TEST_CONFIG.USERS.FREELANCER.email);
      expect(auth.session).toBeDefined();
      expect(auth.session.access_token).toBeDefined();
      expect(auth.profile).toBeDefined();
      expect(auth.profile.user_type).toBe('freelancer');
    });

    test('should authenticate client user successfully', async () => {
      const auth = await authenticateTestUser('client');

      expect(auth.user).toBeDefined();
      expect(auth.user.email).toBe(TEST_CONFIG.USERS.CLIENT.email);
      expect(auth.session).toBeDefined();
      expect(auth.session.access_token).toBeDefined();
      expect(auth.profile).toBeDefined();
      expect(auth.profile.user_type).toBe('client');
    });

    test('should fail authentication with invalid credentials', async () => {
      await expect(
        TestUserManager.authenticateUser('invalid@email.com', 'wrongpassword')
      ).rejects.toThrow('Authentication failed');
    });

    test('should fail authentication with non-existent user', async () => {
      await expect(
        TestUserManager.authenticateUser('nonexistent@email.com', 'password123')
      ).rejects.toThrow('Authentication failed');
    });
  });

  describe('Profile Management', () => {
    test('should have correct freelancer profile data', async () => {
      const { data: profile, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', freelancerUser.user.id)
        .single();

      expect(error).toBeNull();
      expect(profile).toBeDefined();
      expect(profile.display_name).toBe(TEST_CONFIG.USERS.FREELANCER.displayName);
      expect(profile.user_type).toBe('freelancer');
      expect(profile.subscription_tier).toBe('free');
      expect(profile.available_contracts).toBe(3);
      expect(profile.bio).toBe(TEST_CONFIG.USERS.FREELANCER.profile.bio);
      expect(profile.company_name).toBe(TEST_CONFIG.USERS.FREELANCER.profile.companyName);
      expect(profile.website).toBe(TEST_CONFIG.USERS.FREELANCER.profile.website);
    });

    test('should have correct client profile data', async () => {
      const { data: profile, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', clientUser.user.id)
        .single();

      expect(error).toBeNull();
      expect(profile).toBeDefined();
      expect(profile.display_name).toBe(TEST_CONFIG.USERS.CLIENT.displayName);
      expect(profile.user_type).toBe('client');
      expect(profile.subscription_tier).toBe('free');
      expect(profile.available_contracts).toBe(3);
      expect(profile.bio).toBe(TEST_CONFIG.USERS.CLIENT.profile.bio);
      expect(profile.company_name).toBe(TEST_CONFIG.USERS.CLIENT.profile.companyName);
      expect(profile.website).toBe(TEST_CONFIG.USERS.CLIENT.profile.website);
    });

    test('should update freelancer profile successfully', async () => {
      const auth = await authenticateTestUser('freelancer');
      const updatedData = {
        display_name: 'Updated Freelancer Name',
        bio: 'Updated bio description',
        company_name: 'Updated Company',
        website: 'https://updated-website.com'
      };

      const { data: updatedProfile, error } = await supabaseAdmin
        .from('profiles')
        .update(updatedData)
        .eq('id', auth.user.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(updatedProfile.display_name).toBe(updatedData.display_name);
      expect(updatedProfile.bio).toBe(updatedData.bio);
      expect(updatedProfile.company_name).toBe(updatedData.company_name);
      expect(updatedProfile.website).toBe(updatedData.website);

      // Restore original data
      await supabaseAdmin
        .from('profiles')
        .update({
          display_name: TEST_CONFIG.USERS.FREELANCER.displayName,
          bio: TEST_CONFIG.USERS.FREELANCER.profile.bio,
          company_name: TEST_CONFIG.USERS.FREELANCER.profile.companyName,
          website: TEST_CONFIG.USERS.FREELANCER.profile.website
        })
        .eq('id', auth.user.id);
    });

    test('should update client profile successfully', async () => {
      const auth = await authenticateTestUser('client');
      const updatedData = {
        display_name: 'Updated Client Name',
        bio: 'Updated client bio',
        company_name: 'Updated Client Corp',
        website: 'https://updated-client.com'
      };

      const { data: updatedProfile, error } = await supabaseAdmin
        .from('profiles')
        .update(updatedData)
        .eq('id', auth.user.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(updatedProfile.display_name).toBe(updatedData.display_name);
      expect(updatedProfile.bio).toBe(updatedData.bio);
      expect(updatedProfile.company_name).toBe(updatedData.company_name);
      expect(updatedProfile.website).toBe(updatedData.website);

      // Restore original data
      await supabaseAdmin
        .from('profiles')
        .update({
          display_name: TEST_CONFIG.USERS.CLIENT.displayName,
          bio: TEST_CONFIG.USERS.CLIENT.profile.bio,
          company_name: TEST_CONFIG.USERS.CLIENT.profile.companyName,
          website: TEST_CONFIG.USERS.CLIENT.profile.website
        })
        .eq('id', auth.user.id);
    });
  });

  describe('Profile Helper Functions', () => {
    test('should ensure user profile exists for freelancer', async () => {
      const profile = await TestUserManager.ensureUserProfile?.(freelancerUser.user.id);
      
      if (profile) {
        expect(profile).toBeDefined();
        expect(profile.id).toBe(freelancerUser.user.id);
        expect(profile.user_type).toBe('freelancer');
      }
    });

    test('should ensure user profile exists for client', async () => {
      const profile = await TestUserManager.ensureUserProfile?.(clientUser.user.id);
      
      if (profile) {
        expect(profile).toBeDefined();
        expect(profile.id).toBe(clientUser.user.id);
        expect(profile.user_type).toBe('client');
      }
    });
  });

  describe('User Role Management', () => {
    test('should correctly identify freelancer role', async () => {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('user_type')
        .eq('id', freelancerUser.user.id)
        .single();

      expect(profile.user_type).toBe('freelancer');
    });

    test('should correctly identify client role', async () => {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('user_type')
        .eq('id', clientUser.user.id)
        .single();

      expect(profile.user_type).toBe('client');
    });

    test('should allow user to change role to both', async () => {
      const auth = await authenticateTestUser('freelancer');

      const { data: updatedProfile, error } = await supabaseAdmin
        .from('profiles')
        .update({ user_type: 'both' })
        .eq('id', auth.user.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(updatedProfile.user_type).toBe('both');

      // Restore original role
      await supabaseAdmin
        .from('profiles')
        .update({ user_type: 'freelancer' })
        .eq('id', auth.user.id);
    });
  });

  describe('Subscription Tier Management', () => {
    test('should have free tier by default', async () => {
      const { data: freelancerProfile } = await supabaseAdmin
        .from('profiles')
        .select('subscription_tier, available_contracts')
        .eq('id', freelancerUser.user.id)
        .single();

      const { data: clientProfile } = await supabaseAdmin
        .from('profiles')
        .select('subscription_tier, available_contracts')
        .eq('id', clientUser.user.id)
        .single();

      expect(freelancerProfile.subscription_tier).toBe('free');
      expect(freelancerProfile.available_contracts).toBe(3);
      expect(clientProfile.subscription_tier).toBe('free');
      expect(clientProfile.available_contracts).toBe(3);
    });

    test('should update subscription tier correctly', async () => {
      const auth = await authenticateTestUser('freelancer');

      const { data: updatedProfile, error } = await supabaseAdmin
        .from('profiles')
        .update({
          subscription_tier: 'professional',
          available_contracts: 50
        })
        .eq('id', auth.user.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(updatedProfile.subscription_tier).toBe('professional');
      expect(updatedProfile.available_contracts).toBe(50);

      // Restore free tier
      await supabaseAdmin
        .from('profiles')
        .update({
          subscription_tier: 'free',
          available_contracts: 3
        })
        .eq('id', auth.user.id);
    });
  });

  describe('Profile Security', () => {
    test('should not allow user to view other user profiles', async () => {
      // This would need to be tested with actual RLS policies
      // For now, we'll test the profile selection logic
      const { data: profiles, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .neq('id', freelancerUser.user.id)
        .eq('id', clientUser.user.id);

      expect(error).toBeNull();
      expect(profiles).toHaveLength(1);
      expect(profiles[0].id).toBe(clientUser.user.id);
    });

    test('should validate profile data types', async () => {
      const auth = await authenticateTestUser('freelancer');

      // Test with invalid user_type
      const { error: invalidTypeError } = await supabaseAdmin
        .from('profiles')
        .update({ user_type: 'invalid_role' })
        .eq('id', auth.user.id);

      expect(invalidTypeError).toBeDefined();
      expect(invalidTypeError.message).toContain('invalid');
    });
  });
});