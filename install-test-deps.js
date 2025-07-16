// Script to install test dependencies
const { execSync } = require('child_process');

const dependencies = [
  'jest-environment-jsdom',
  '@testing-library/react',
  '@testing-library/jest-dom',
  '@testing-library/user-event'
];

console.log('Installing test dependencies...');

try {
  execSync(`npm install --save-dev ${dependencies.join(' ')}`, {
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('✅ Test dependencies installed successfully');
} catch (error) {
  console.error('❌ Failed to install dependencies:', error.message);
  process.exit(1);
}