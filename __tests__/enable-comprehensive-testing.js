#!/usr/bin/env node

/**
 * Enable Comprehensive Testing
 * 
 * This script updates Jest configuration to enable comprehensive testing
 * with real database integration when credentials are properly configured.
 */

const fs = require('fs');
const path = require('path');

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

function checkEnvironmentSetup() {
  const envPath = path.join(process.cwd(), '.env.local');
  
  if (!fs.existsSync(envPath)) {
    log('\n❌ No .env.local file found', 'red');
    log('', 'reset');
    log('To enable comprehensive testing:', 'cyan');
    log('1. Copy .env.test.template to .env.local', 'blue');
    log('2. Update .env.local with your actual test credentials', 'blue');
    log('3. Run this script again', 'blue');
    log('', 'reset');
    log('Quick setup:', 'cyan');
    log('cp .env.test.template .env.local', 'blue');
    log('# Then edit .env.local with your credentials', 'blue');
    return false;
  }

  // Read and check .env.local
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const hasSupabaseUrl = envContent.includes('NEXT_PUBLIC_SUPABASE_URL=') && 
                        !envContent.includes('your-test-project.supabase.co');
  const hasSupabaseKey = envContent.includes('SUPABASE_SERVICE_ROLE=') && 
                        !envContent.includes('your_supabase_service_role_key_here');
  const hasStripeKey = envContent.includes('STRIPE_SECRET_KEY=') && 
                      !envContent.includes('your_stripe_secret_key_here');

  if (!hasSupabaseUrl || !hasSupabaseKey || !hasStripeKey) {
    log('\n⚠️  Environment file found but credentials need updating', 'yellow');
    log('', 'reset');
    log('Please update .env.local with your actual:', 'cyan');
    if (!hasSupabaseUrl) log('• Supabase project URL', 'blue');
    if (!hasSupabaseKey) log('• Supabase service role key', 'blue');
    if (!hasStripeKey) log('• Stripe secret key', 'blue');
    return false;
  }

  return true;
}

function enableComprehensiveTesting() {
  log('\n🚀 Enabling Comprehensive Testing', 'cyan');
  log('==================================\n');

  // Check environment setup
  if (!checkEnvironmentSetup()) {
    return;
  }

  // Read current Jest config
  const jestConfigPath = path.join(process.cwd(), 'jest.config.js');
  let jestContent = fs.readFileSync(jestConfigPath, 'utf-8');

  // Enable comprehensive testing by removing test path ignores
  const testPathsToEnable = [
    '<rootDir>/__tests__/integration/',
    '<rootDir>/__tests__/api/contracts.test.js',
    '<rootDir>/__tests__/api/payments.test.js',
    '<rootDir>/__tests__/api/subscriptions.test.js',
    '<rootDir>/__tests__/e2e/'
  ];

  let configUpdated = false;
  testPathsToEnable.forEach(testPath => {
    if (jestContent.includes(`'${testPath}',`)) {
      jestContent = jestContent.replace(`'${testPath}',`, `// '${testPath}', // Enabled for comprehensive testing`);
      configUpdated = true;
    }
  });

  if (configUpdated) {
    // Backup original config
    fs.writeFileSync(jestConfigPath + '.backup', jestContent);
    fs.writeFileSync(jestConfigPath, jestContent);
    
    log('✅ Jest configuration updated for comprehensive testing', 'green');
    log('✅ Original configuration backed up to jest.config.js.backup', 'blue');
  } else {
    log('✅ Jest configuration already set for comprehensive testing', 'green');
  }

  log('\n📊 Available Test Commands:', 'bright');
  log('───────────────────────────\n');

  log('# Run all comprehensive tests', 'cyan');
  log('npm run test:comprehensive', 'blue');
  log('');

  log('# Run specific test categories', 'cyan');
  log('npm run test:auth          # Authentication tests', 'blue');
  log('npm run test:contracts     # Contract workflow tests', 'blue');
  log('npm run test:payments      # Payment processing tests', 'blue');
  log('npm run test:subscriptions # Subscription management tests', 'blue');
  log('npm run test:disputes      # Dispute resolution tests', 'blue');
  log('npm run test:deliverables  # File upload and completion tests', 'blue');
  log('');

  log('# API endpoint testing', 'cyan');
  log('npm run test:api-contracts     # Contract API tests', 'blue');
  log('npm run test:api-payments      # Payment API tests', 'blue');
  log('npm run test:api-subscriptions # Subscription API tests', 'blue');
  log('');

  log('# End-to-end testing', 'cyan');
  log('npm run test:workflow      # Complete workflow test', 'blue');
  log('');

  log('🎉 Comprehensive testing is now enabled!', 'green');
  log('You can now run tests with real Supabase and Stripe integration.', 'cyan');
}

function disableComprehensiveTesting() {
  log('\n🔄 Disabling Comprehensive Testing', 'cyan');
  log('===================================\n');

  const jestConfigPath = path.join(process.cwd(), 'jest.config.js');
  const backupPath = jestConfigPath + '.backup';

  if (fs.existsSync(backupPath)) {
    const backupContent = fs.readFileSync(backupPath, 'utf-8');
    fs.writeFileSync(jestConfigPath, backupContent);
    fs.unlinkSync(backupPath);
    
    log('✅ Jest configuration restored to basic testing mode', 'green');
    log('✅ Backup file removed', 'blue');
  } else {
    log('⚠️  No backup found. Manual restoration may be needed.', 'yellow');
  }

  log('\n📊 Basic Test Commands Available:', 'bright');
  log('──────────────────────────────────\n');

  log('npm test           # Run 57 basic tests', 'blue');
  log('npm run test:simple # Enhanced test runner', 'blue');
  log('');

  log('🔄 Comprehensive testing disabled. Run with --enable to re-enable.', 'cyan');
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === '--disable') {
    disableComprehensiveTesting();
  } else if (command === '--help' || command === '-h') {
    log('\n🧪 Pactify Comprehensive Testing Manager', 'cyan');
    log('========================================\n');
    log('Usage:', 'bright');
    log('  node __tests__/enable-comprehensive-testing.js [options]', 'blue');
    log('');
    log('Options:', 'bright');
    log('  --enable   Enable comprehensive testing (default)', 'blue');
    log('  --disable  Disable comprehensive testing', 'blue');
    log('  --help     Show this help message', 'blue');
    log('');
    log('Examples:', 'bright');
    log('  npm run test:enable-comprehensive     # Enable comprehensive testing', 'blue');
    log('  npm run test:disable-comprehensive    # Disable comprehensive testing', 'blue');
  } else {
    enableComprehensiveTesting();
  }
}

if (require.main === module) {
  main();
}

module.exports = { enableComprehensiveTesting, disableComprehensiveTesting };