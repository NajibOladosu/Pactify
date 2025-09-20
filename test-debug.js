#!/usr/bin/env node

/**
 * Test Debug Runner
 * Runs individual tests with proper environment setup
 */

// Load environment variables manually
const fs = require('fs');
const path = require('path');

// Load .env.local file
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  const envVars = envFile.split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('='))
    .filter(([key, value]) => key && value);
    
  envVars.forEach(([key, value]) => {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

const { spawn } = require('child_process');

async function runSingleTest(testFile) {
  console.log(`\n🧪 Running ${testFile}...`);
  console.log('=' .repeat(50));
  
  return new Promise((resolve) => {
    const testPath = path.join('__tests__', testFile);
    const jest = spawn('npx', ['jest', testPath, '--verbose', '--testPathIgnorePatterns='], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ENABLE_REAL_DATA_TESTING: 'true'
      }
    });

    jest.on('close', (code) => {
      console.log(`\n${testFile}: ${code === 0 ? '✅ PASSED' : '❌ FAILED'}`);
      resolve(code === 0);
    });
  });
}

async function main() {
  console.log('🚀 Starting Test Debug Session');
  console.log('Environment check:');
  console.log('- SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅' : '❌');
  console.log('- SUPABASE_SERVICE_ROLE:', process.env.SUPABASE_SERVICE_ROLE ? '✅' : '❌');
  console.log('- STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '✅' : '❌');
  
  const tests = [
    'integration/withdrawal-system.test.js',
    'integration/time-tracking.test.js', 
    'integration/communication-system.test.js',
    'integration/dispute-resolution.test.js',
    'e2e/complete-platform-workflow.test.js'
  ];

  const results = {};
  
  for (const test of tests) {
    try {
      results[test] = await runSingleTest(test);
    } catch (error) {
      console.error(`Error running ${test}:`, error.message);
      results[test] = false;
    }
  }

  console.log('\n📊 Test Summary:');
  console.log('=' .repeat(50));
  
  let passed = 0;
  let total = tests.length;
  
  for (const [test, result] of Object.entries(results)) {
    console.log(`${result ? '✅' : '❌'} ${test}`);
    if (result) passed++;
  }
  
  console.log(`\n📈 Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
    process.exit(1);
  }
}

main().catch(console.error);