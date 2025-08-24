#!/usr/bin/env node

/**
 * Environment Verification for Real Database Testing
 * 
 * This script verifies that the test environment is properly configured
 * and can connect to Supabase and Stripe test services.
 */

const { createClient } = require('@supabase/supabase-js');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function colorize(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

function log(message, color = 'reset') {
  console.log(colorize(color, message));
}

async function verifySupabaseConnection() {
  log('\n🔧 Verifying Supabase Connection...', 'cyan');
  
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl || !supabaseKey) {
      log('❌ Missing Supabase credentials in environment', 'red');
      return false;
    }

    if (supabaseUrl.includes('your-test-project')) {
      log('❌ Supabase URL still contains placeholder values', 'red');
      return false;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Try a simple query to verify connection
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);

    if (error && error.code === 'PGRST116') {
      log('⚠️  Supabase connected but "profiles" table not found', 'yellow');
      log('   This is expected if the schema hasn\'t been applied yet', 'blue');
      return 'no-schema';
    } else if (error) {
      log(`❌ Supabase connection error: ${error.message}`, 'red');
      return false;
    } else {
      log('✅ Supabase connection successful', 'green');
      return true;
    }
  } catch (error) {
    log(`❌ Supabase verification failed: ${error.message}`, 'red');
    return false;
  }
}

async function verifyStripeConnection() {
  log('\n💳 Verifying Stripe Connection...', 'cyan');
  
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      log('❌ Missing Stripe secret key in environment', 'red');
      return false;
    }

    if (stripeSecretKey.includes('your_stripe_secret_key_here')) {
      log('❌ Stripe key still contains placeholder values', 'red');
      return false;
    }

    if (!stripeSecretKey.startsWith('sk_test_')) {
      log('⚠️  Warning: Stripe key doesn\'t look like a test key', 'yellow');
      log('   Make sure you\'re using test mode credentials', 'blue');
    }

    // Dynamic import of Stripe
    const Stripe = require('stripe');
    const stripe = new Stripe(stripeSecretKey);
    
    // Simple API call to verify connection
    const account = await stripe.accounts.retrieve();
    
    log('✅ Stripe connection successful', 'green');
    log(`   Account: ${account.display_name || account.id}`, 'blue');
    return true;
  } catch (error) {
    log(`❌ Stripe verification failed: ${error.message}`, 'red');
    return false;
  }
}

function verifyEnvironmentVariables() {
  log('\n📋 Verifying Environment Variables...', 'cyan');
  
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY', 
    'SUPABASE_SERVICE_ROLE',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET'
  ];

  const optionalVars = [
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
    'NODE_ENV',
    'ENABLE_REAL_DATA_TESTING'
  ];

  let allRequired = true;

  log('Required variables:', 'bright');
  requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value && !value.includes('your_') && !value.includes('_here')) {
      log(`   ✅ ${varName}`, 'green');
    } else {
      log(`   ❌ ${varName}`, 'red');
      allRequired = false;
    }
  });

  log('\nOptional variables:', 'bright');
  optionalVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      log(`   ✅ ${varName}`, 'green');
    } else {
      log(`   ⚪ ${varName} (not set)`, 'yellow');
    }
  });

  return allRequired;
}

async function main() {
  log('\n🧪 Pactify Test Environment Verification', 'cyan');
  log('==========================================\n');

  // Load environment variables from .env.local
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
          process.env[key] = value;
        }
      });
      log('✅ Loaded .env.local file', 'green');
    } else {
      log('⚠️  No .env.local file found', 'yellow');
    }
  } catch (error) {
    log(`⚠️  Error loading .env.local: ${error.message}`, 'yellow');
  }

  let allChecks = true;

  // Check environment variables
  const envCheck = verifyEnvironmentVariables();
  if (!envCheck) {
    allChecks = false;
  }

  // Check Supabase connection
  const supabaseCheck = await verifySupabaseConnection();
  if (!supabaseCheck) {
    allChecks = false;
  }

  // Check Stripe connection
  const stripeCheck = await verifyStripeConnection();
  if (!stripeCheck) {
    allChecks = false;
  }

  // Final results
  log('\n📊 Verification Results:', 'bright');
  log('======================\n');

  if (allChecks && supabaseCheck === true) {
    log('🎉 Environment is fully configured for comprehensive testing!', 'green');
    log('✅ Ready to run: npm run test:comprehensive', 'cyan');
  } else if (supabaseCheck === 'no-schema') {
    log('⚠️  Environment is configured but database schema is missing', 'yellow');
    log('📝 Next steps:', 'bright');
    log('   1. Apply database schema manually through Supabase dashboard', 'blue');
    log('   2. Or run: npm run test:basic (for tests that don\'t require schema)', 'blue');
  } else {
    log('❌ Environment needs configuration before comprehensive testing', 'red');
    log('📝 Next steps:', 'bright');
    log('   1. Update .env.local with correct credentials', 'blue');
    log('   2. Run this verification again', 'blue');
    log('   3. Then run: npm run test:comprehensive', 'blue');
  }

  log('\n📋 Available Test Commands:', 'bright');
  log('──────────────────────────\n');
  log('npm test                    # Basic tests (57 tests, always works)', 'blue');
  log('npm run test:simple         # Enhanced basic test runner', 'blue');
  log('npm run test:comprehensive  # Full test suite (needs environment)', 'blue');
  log('node __tests__/verify-environment.js  # Run this verification again', 'blue');

  process.exit(allChecks ? 0 : 1);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
}

module.exports = { verifySupabaseConnection, verifyStripeConnection, verifyEnvironmentVariables };