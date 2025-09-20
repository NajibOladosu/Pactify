const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

// Custom Jest config for integration and E2E tests
const integrationJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  setupFiles: ['<rootDir>/__tests__/test-env.js'],
  moduleNameMapper: {
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/utils/(.*)$': '<rootDir>/utils/$1',
    '^@/app/(.*)$': '<rootDir>/app/$1',
  },
  testEnvironment: 'node',
  // Only ignore essential paths for integration tests
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/__tests__/mocks/',
    '<rootDir>/__tests__/run-all-tests.js',
    '<rootDir>/__tests__/run-simple-tests.js',
    '<rootDir>/__tests__/setup-real-testing.js',
    '<rootDir>/__tests__/verify-environment.js',
    '<rootDir>/__tests__/enable-comprehensive-testing.js',
    '<rootDir>/__tests__/test-env.js',
    '<rootDir>/__tests__/test-setup/',
    // Remove these to allow integration and e2e tests
    // '<rootDir>/__tests__/integration/',
    // '<rootDir>/__tests__/e2e/'
  ],
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testMatch: [
    '**/__tests__/integration/**/*.(test|spec).(ts|tsx|js|jsx)',
    '**/__tests__/e2e/**/*.(test|spec).(ts|tsx|js|jsx)',
  ],
  // Increase timeout for integration tests
  testTimeout: 30000,
  // Run tests serially to avoid database conflicts
  maxWorkers: 1,
}

module.exports = createJestConfig(integrationJestConfig)