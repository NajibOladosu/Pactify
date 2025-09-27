/**
 * Test Environment Configuration
 * Sets up environment variables for testing - supports both mock and real data testing
 */

const fs = require('fs');
const path = require('path');

// Setup fetch polyfill globally for all tests
const fetch = require('cross-fetch');
global.fetch = fetch;
global.Headers = fetch.Headers;
global.Request = fetch.Request;
global.Response = fetch.Response;

// Load environment variables from .env.local for real data testing
function loadEnvLocal() {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0 && !key.startsWith('#')) {
          const value = valueParts.join('=').trim();
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

// Force load real environment first, overriding any existing values
const envLoaded = loadEnvLocal();

// Check if real data testing is enabled
const useRealData = envLoaded && process.env.ENABLE_REAL_DATA_TESTING === 'true';

// If real data testing is enabled, reload the environment to override any mock values
if (useRealData) {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0 && !key.startsWith('#')) {
          const value = valueParts.join('=').trim();
          // Force override for real data testing
          process.env[key] = value;
        }
      });
    }
  } catch (error) {
    console.log('⚠️  Error reloading environment for real data testing:', error.message);
  }
}

if (useRealData) {
  console.log('🚀 Test environment configured for REAL DATA testing');
  console.log('📊 Using actual Supabase and Stripe integration');
  console.log(`   • Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? process.env.NEXT_PUBLIC_SUPABASE_URL.substring(0, 50) + '...' : 'Not set'}`);
  console.log(`   • Stripe: Test mode enabled`);
} else {
  // Fallback to mock values for basic testing
  console.log('🧪 Test environment configured with mock values');
  console.log('📝 Note: For real testing, configure actual Supabase and Stripe test credentials');

  // Mock environment variables for testing if they don't exist
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
  }

  if (!process.env.SUPABASE_SERVICE_ROLE) {
    process.env.SUPABASE_SERVICE_ROLE = 'test-service-role-key';
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock_stripe_key';
  }

  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_mock_stripe_key';
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_webhook_secret';
  }
}

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';