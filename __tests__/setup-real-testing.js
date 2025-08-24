#!/usr/bin/env node

/**
 * Real Database Testing Setup Script
 * 
 * This script helps configure your environment for real database testing
 * with actual Supabase and Stripe test accounts.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function colorize(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

function log(message, color = 'reset') {
  console.log(colorize(color, message));
}

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function setupRealTesting() {
  const rl = createInterface();

  log('\n🚀 Pactify Real Database Testing Setup', 'cyan');
  log('=====================================\n', 'cyan');

  log('This script will help you configure real database testing with:', 'bright');
  log('✅ Real Supabase test project', 'green');
  log('✅ Real Stripe test account', 'green');
  log('✅ Real email service (optional)', 'green');
  log('✅ Comprehensive test environment', 'green');
  log('');

  // Check if already configured
  const envLocalPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    log('⚠️  Found existing .env.local file', 'yellow');
    const overwrite = await askQuestion(rl, 'Do you want to overwrite it? (y/N): ');
    if (overwrite.toLowerCase() !== 'y' && overwrite.toLowerCase() !== 'yes') {
      log('Setup cancelled. You can manually update your .env.local file.', 'blue');
      rl.close();
      return;
    }
  }

  log('\n📋 Step 1: Supabase Test Project Configuration', 'bright');
  log('──────────────────────────────────────────────\n');

  log('First, create a new Supabase project for testing:', 'cyan');
  log('1. Go to https://supabase.com/dashboard', 'blue');
  log('2. Create a new project (name it "pactify-test" or similar)', 'blue');
  log('3. Wait for initialization (~2 minutes)', 'blue');
  log('4. Go to Settings > API to get your credentials\n', 'blue');

  const supabaseUrl = await askQuestion(rl, 'Enter your Supabase Project URL: ');
  const supabaseAnonKey = await askQuestion(rl, 'Enter your Supabase Anon Key: ');
  const supabaseServiceRole = await askQuestion(rl, 'Enter your Supabase Service Role Key: ');

  log('\n📋 Step 2: Stripe Test Account Configuration', 'bright');
  log('──────────────────────────────────────────────\n');

  log('Configure your Stripe test account:', 'cyan');
  log('1. Go to https://dashboard.stripe.com/test/dashboard', 'blue');
  log('2. Go to Developers > API keys', 'blue');
  log('3. Copy your test mode keys (they start with pk_test_ and sk_test_)', 'blue');
  log('4. Create a webhook endpoint for http://localhost:3000/api/webhooks/stripe\n', 'blue');

  const stripePublishableKey = await askQuestion(rl, 'Enter your Stripe Publishable Key (pk_test_...): ');
  const stripeSecretKey = await askQuestion(rl, 'Enter your Stripe Secret Key (sk_test_...): ');
  const stripeWebhookSecret = await askQuestion(rl, 'Enter your Stripe Webhook Secret (whsec_...): ');

  log('\n📋 Step 3: Email Configuration (Optional)', 'bright');
  log('──────────────────────────────────────────────\n');

  log('Email configuration for testing (optional - you can skip this):', 'cyan');
  const configureEmail = await askQuestion(rl, 'Do you want to configure email? (y/N): ');

  let emailConfig = '';
  if (configureEmail.toLowerCase() === 'y' || configureEmail.toLowerCase() === 'yes') {
    log('\nFor Gmail, you can use App Passwords:', 'blue');
    log('1. Enable 2FA on your Google account', 'blue');
    log('2. Go to Google Account settings > Security > App passwords', 'blue');
    log('3. Generate an app password for "Mail"\n', 'blue');

    const smtpHost = await askQuestion(rl, 'SMTP Host (default: smtp.gmail.com): ') || 'smtp.gmail.com';
    const smtpPort = await askQuestion(rl, 'SMTP Port (default: 587): ') || '587';
    const smtpUser = await askQuestion(rl, 'SMTP User (your email): ');
    const smtpPass = await askQuestion(rl, 'SMTP Password (app password): ');

    emailConfig = `
# Email Configuration
SMTP_HOST=${smtpHost}
SMTP_PORT=${smtpPort}
SMTP_USER=${smtpUser}
SMTP_PASS=${smtpPass}`;
  } else {
    emailConfig = `
# Email Configuration (Mock mode)
MOCK_EMAIL=true`;
  }

  // Create .env.local file
  const envContent = `# Pactify Real Database Testing Environment
# Generated by setup-real-testing.js on ${new Date().toISOString()}

# Supabase Test Project (REAL DATA)
NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabaseAnonKey}
SUPABASE_SERVICE_ROLE=${supabaseServiceRole}

# Stripe Test Mode (REAL STRIPE TESTING)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${stripePublishableKey}
STRIPE_SECRET_KEY=${stripeSecretKey}
STRIPE_WEBHOOK_SECRET=${stripeWebhookSecret}${emailConfig}

# Testing Environment
NODE_ENV=test
ENABLE_REAL_DATA_TESTING=true

# Application URLs
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
`;

  fs.writeFileSync(envLocalPath, envContent);

  log('\n✅ Environment Configuration Complete!', 'green');
  log('═══════════════════════════════════════\n', 'green');

  log('📁 Created .env.local with your real test credentials', 'cyan');
  log('');

  log('📋 Next Steps:', 'bright');
  log('──────────────\n');

  log('1. Apply database schema to your test project:', 'cyan');
  log('   npm run db:schema', 'blue');
  log('');

  log('2. Run comprehensive tests with real data:', 'cyan');
  log('   npm run test:comprehensive', 'blue');
  log('');

  log('3. Or run specific test suites:', 'cyan');
  log('   npm run test:auth      # Authentication tests', 'blue');
  log('   npm run test:contracts # Contract tests', 'blue');
  log('   npm run test:payments  # Payment tests', 'blue');
  log('   npm run test:e2e       # End-to-end tests', 'blue');
  log('');

  log('📊 Test Coverage Available:', 'bright');
  log('──────────────────────────\n');

  log('✅ 57 basic tests (working now)', 'green');
  log('✅ 150+ integration tests (ready with environment)', 'green');
  log('✅ Real database operations', 'green');
  log('✅ Real Stripe payment processing', 'green');
  log('✅ End-to-end workflow validation', 'green');
  log('');

  log('🔒 Security Notes:', 'bright');
  log('─────────────────\n');

  log('• Your .env.local contains test credentials only', 'yellow');
  log('• Stripe is in test mode (no real money)', 'yellow');
  log('• Supabase test project is isolated', 'yellow');
  log('• Test data is automatically cleaned up', 'yellow');
  log('');

  log('🎉 Real database testing is now configured!', 'green');
  log('You can now test with actual Supabase and Stripe integration.', 'cyan');

  rl.close();
}

async function main() {
  try {
    await setupRealTesting();
  } catch (error) {
    log('\n❌ Setup failed:', 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

// Check if script is run directly
if (require.main === module) {
  main();
}

module.exports = { setupRealTesting };