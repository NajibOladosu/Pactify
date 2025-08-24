#!/usr/bin/env node

/**
 * Simple Test Runner for Pactify Platform
 * Runs the existing simple tests that don't require complex setup
 */

const { spawn } = require('child_process');
const path = require('path');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

async function runSimpleTests() {
  log('🚀 Running Simple Pactify Tests', 'bright');
  log('=' * 50, 'cyan');
  
  const startTime = Date.now();

  // Run Jest with only the simple tests
  const jest = spawn('npx', [
    'jest', 
    '__tests__/utils/',
    '__tests__/components/',
    '__tests__/api/simple.test.js',
    '__tests__/setup.test.js',
    '--verbose'
  ], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });

  jest.on('close', (code) => {
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    log('\n' + '=' * 50, 'cyan');
    
    if (code === 0) {
      log(`✅ Simple tests completed successfully in ${duration}s`, 'green');
      log('\n🎯 What was tested:', 'bright');
      log('   ✅ Utility functions', 'green');
      log('   ✅ Helper functions', 'green');
      log('   ✅ Basic API functionality', 'green');
      log('   ✅ Component rendering', 'green');
      log('   ✅ Test environment setup', 'green');
      
      log('\n📝 Note: For comprehensive testing including database and API integration:', 'yellow');
      log('   1. Set up Supabase test environment', 'yellow');
      log('   2. Configure Stripe test keys', 'yellow');
      log('   3. Run: node __tests__/run-all-tests.js', 'yellow');
    } else {
      log(`❌ Tests failed in ${duration}s`, 'red');
    }
    
    process.exit(code);
  });

  jest.on('error', (error) => {
    log(`💥 Test runner error: ${error.message}`, 'red');
    process.exit(1);
  });
}

// Handle script execution
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  log('Simple Pactify Test Runner', 'bright');
  log('Usage: node run-simple-tests.js', 'blue');
  log('\nThis runs basic tests that don\'t require database setup:', 'blue');
  log('  • Utility function tests', 'cyan');
  log('  • Component tests', 'cyan');
  log('  • Basic API tests', 'cyan');
  log('  • Environment setup tests', 'cyan');
  log('\nFor full integration tests, use run-all-tests.js', 'yellow');
  process.exit(0);
}

runSimpleTests();