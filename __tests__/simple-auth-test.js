/**
 * Simple Auth Test - Direct test in Jest environment
 */

const { createClient } = require('@supabase/supabase-js');

// Setup fetch polyfill for Node.js environment
const fetch = require('cross-fetch');
global.fetch = fetch;
global.Headers = fetch.Headers;
global.Request = fetch.Request;
global.Response = fetch.Response;

describe('Simple Supabase Auth Test', () => {
  let supabase;
  
  beforeAll(() => {
    // Load environment
    require('dotenv').config({ path: '.env.local' });
    
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE
    );
  });
  
  test('should create and delete user', async () => {
    console.log('Testing Supabase admin in Jest environment...');
    
    const testEmail = `jest-test-${Date.now()}@example.com`;
    
    try {
      // Create user
      const { data, error } = await supabase.auth.admin.createUser({
        email: testEmail,
        password: 'testpassword123',
        email_confirm: true
      });
      
      console.log('Create user result:', { data: !!data, error });
      
      if (error) {
        console.error('Create user error:', error);
        throw error;
      }
      
      expect(data).toBeTruthy();
      expect(data.user).toBeTruthy();
      expect(data.user.email).toBe(testEmail);
      
      // Clean up
      const { error: deleteError } = await supabase.auth.admin.deleteUser(data.user.id);
      if (deleteError) {
        console.warn('Delete error:', deleteError);
      }
      
    } catch (error) {
      console.error('Test failed with error:', error);
      throw error;
    }
  }, 30000);
});