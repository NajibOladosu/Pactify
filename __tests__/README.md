# Pactify Platform Testing Suite

A comprehensive testing framework covering all aspects of the Pactify freelance contract management platform.

## 🎯 Overview

This testing suite provides end-to-end coverage of the Pactify platform, including:

- **Authentication & User Management** - Registration, login, profile management
- **Contract Lifecycle** - Creation, negotiation, signing, execution
- **Payment & Escrow System** - Stripe integration, fee calculation, fund releases
- **Subscription Management** - Plan upgrades, billing, tier enforcement
- **Dispute Resolution** - Creation, escalation, mediation, resolution
- **Deliverable Management** - File uploads, reviews, approvals
- **API Security** - Input validation, rate limiting, authorization
- **Complete Workflows** - Full project lifecycle from start to finish

## 📂 Test Structure

```
__tests__/
├── test-setup/                 # Test configuration and utilities
│   ├── test-config.js         # Test data and configuration
│   ├── test-helpers.js        # Utility functions and test managers
│   └── setup-test-users.js    # Test user creation and management
├── integration/               # Integration test suites
│   ├── auth-profile.test.js   # Authentication and profile tests
│   ├── contract-lifecycle.test.js
│   ├── payment-escrow.test.js
│   ├── subscription-management.test.js
│   ├── dispute-resolution.test.js
│   └── deliverables-completion.test.js
├── api/                       # API endpoint tests
│   ├── contracts.test.js      # Contract API endpoints
│   ├── payments.test.js       # Payment API endpoints
│   └── subscriptions.test.js  # Subscription API endpoints
├── e2e/                       # End-to-end workflow tests
│   └── complete-workflow.test.js
├── run-all-tests.js          # Test runner script
└── README.md                 # This file
```

## 🚀 Quick Start

### Prerequisites

1. **Node.js 18+** with npm
2. **Supabase project** configured
3. **Stripe test account** set up
4. **Environment variables** configured

### Installation

```bash
# Install dependencies
npm install

# Install testing dependencies
npm install --save-dev jest @jest/globals

# Set up environment variables
cp .env.example .env.local
# Configure your test environment variables
```

### Running Tests

```bash
# Run all tests
node __tests__/run-all-tests.js

# Run specific test suite
npm test integration/auth-profile.test.js

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## 🧪 Test Suites

### 1. Authentication & Profile Tests
- User registration with email verification
- Password authentication and security
- Social authentication (Google OAuth)
- Profile creation and management
- Role-based access control
- Session management and security

### 2. Contract Lifecycle Tests
- Contract creation with templates
- Multi-party contract management
- Digital signature system
- Contract status management
- Milestone creation and tracking
- Contract locking and versioning

### 3. Payment & Escrow Tests
- Stripe payment processing
- Escrow funding and management
- Fee calculation (platform + Stripe fees)
- Payment releases and transfers
- Refund processing
- Multi-currency support

### 4. Subscription Management Tests
- Plan upgrades and downgrades
- Billing cycle management
- Webhook processing
- Usage tracking and limits
- Cancellation and reactivation
- Invoice management

### 5. Dispute Resolution Tests
- Dispute creation and categorization
- Evidence submission and responses
- Escalation workflows
- Admin mediation process
- Resolution implementation
- Satisfaction tracking

### 6. Deliverables & Completion Tests
- File upload and validation
- Deliverable submission workflow
- Client review and approval process
- Revision cycles and feedback
- Project completion ceremonies
- Certificate generation

### 7. API Security Tests
- Input validation and sanitization
- Rate limiting and CSRF protection
- Authentication and authorization
- Error handling and logging
- Data access controls
- Security event monitoring

### 8. End-to-End Workflow Tests
- Complete project lifecycle
- Multi-phase milestone execution
- Client-freelancer communication
- Payment processing throughout project
- Project completion and feedback
- Data integrity verification

## 🔧 Configuration

### Test Data

All test data is centralized in `test-setup/test-config.js`:

```javascript
export const TEST_CONFIG = {
  // Test users
  USERS: {
    FREELANCER: { email: 'freelancer.test@pactify.com', ... },
    CLIENT: { email: 'client.test@pactify.com', ... }
  },
  
  // Contract templates
  CONTRACT_DATA: {
    WEB_DEVELOPMENT: { title: '...', milestones: [...] },
    MILESTONE_PROJECT: { ... }
  },
  
  // Payment test data
  PAYMENT_DATA: { ... },
  
  // Dispute scenarios
  DISPUTE_DATA: { ... }
};
```

### Environment Variables

Required environment variables for testing:

```env
# Supabase (Test Environment)
NEXT_PUBLIC_SUPABASE_URL=your_test_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_test_anon_key
SUPABASE_SERVICE_ROLE=your_test_service_role_key

# Stripe (Test Mode)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...

# Test Configuration
NODE_ENV=test
TEST_DATABASE_URL=postgresql://...
```

## 🛠️ Test Utilities

### Test Managers

The testing suite includes specialized managers for different aspects:

#### TestUserManager
```javascript
const userManager = new TestUserManager();
await userManager.createTestUser('freelancer');
await userManager.authenticateUser('client');
await userManager.cleanupTestUsers();
```

#### TestContractManager
```javascript
const contractManager = new TestContractManager();
const contract = await contractManager.createContract(userId, contractData);
await contractManager.signContract(contractId, userId);
```

#### TestPaymentManager
```javascript
const paymentManager = new TestPaymentManager();
await paymentManager.fundEscrow(contractId, amount);
await paymentManager.releasePayment(contractId, milestoneId);
```

### Database Utilities

```javascript
// Clean database between tests
await DatabaseManager.resetTestData();

// Verify data integrity
await DatabaseManager.verifyConstraints();

// Generate test data
await DatabaseManager.seedTestData();
```

## 📊 Test Coverage

The test suite covers:

- **Functional Testing**: All user workflows and business logic
- **Security Testing**: Input validation, authentication, authorization
- **Integration Testing**: API endpoints and database interactions
- **Performance Testing**: Rate limiting and load handling
- **Error Handling**: Graceful failure and recovery scenarios
- **Data Integrity**: Database constraints and transaction safety

### Coverage Metrics

- **API Endpoints**: 60+ endpoints tested
- **User Workflows**: 15+ complete user journeys
- **Database Tables**: All 20+ tables validated
- **Security Scenarios**: 25+ security test cases
- **Error Conditions**: 30+ error handling scenarios

## 🚨 Continuous Integration

### GitHub Actions Integration

```yaml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: node __tests__/run-all-tests.js
```

### Pre-commit Hooks

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run test:critical",
      "pre-push": "npm run test:full"
    }
  }
}
```

## 🐛 Debugging Tests

### Common Issues

1. **Database Connection**: Ensure test database is accessible
2. **Stripe Keys**: Verify test mode keys are configured
3. **Rate Limiting**: Use appropriate delays between requests
4. **Data Cleanup**: Ensure proper test isolation

### Debug Mode

```bash
# Run with debug output
DEBUG=true node __tests__/run-all-tests.js

# Run single test with verbose output
npx jest __tests__/integration/auth-profile.test.js --verbose

# Run with database query logging
DB_DEBUG=true npm test
```

## 📈 Performance Testing

### Load Testing

```bash
# Test API performance
npm run test:performance

# Test concurrent user scenarios
npm run test:load

# Test database performance
npm run test:db-performance
```

### Metrics Collection

The test suite collects performance metrics:

- API response times
- Database query performance
- Memory usage during tests
- Concurrent user handling
- File upload performance

## 🔒 Security Testing

### Security Test Categories

1. **Authentication Security**
   - Password strength validation
   - Session management
   - OAuth integration security
   - Rate limiting on auth endpoints

2. **Input Validation**
   - SQL injection prevention
   - XSS protection
   - CSRF token validation
   - File upload security

3. **Authorization Testing**
   - Role-based access control
   - Resource ownership validation
   - API endpoint permissions
   - Data access restrictions

4. **Data Protection**
   - Sensitive data encryption
   - PII handling compliance
   - Audit logging verification
   - Secure data transmission

## 📝 Test Reporting

### Generated Reports

- **HTML Coverage Report**: Detailed code coverage analysis
- **JSON Test Results**: Machine-readable test outcomes
- **Performance Metrics**: Response time and throughput data
- **Security Scan Report**: Security vulnerability assessment

### Report Locations

```
coverage/
├── lcov-report/           # HTML coverage report
├── lcov.info             # Coverage data
└── coverage-summary.json # Coverage summary

reports/
├── test-results.json     # Test execution results
├── performance.json      # Performance metrics
└── security-scan.json   # Security test results
```

## 🤝 Contributing

### Adding New Tests

1. **Create test file** in appropriate directory
2. **Follow naming convention**: `feature-name.test.js`
3. **Use test utilities** for consistency
4. **Include security tests** for new features
5. **Update documentation** with new test coverage

### Test Guidelines

- **Isolation**: Each test should be independent
- **Cleanup**: Always clean up test data
- **Assertions**: Use descriptive assertion messages
- **Performance**: Include performance considerations
- **Security**: Test both positive and negative scenarios

## 📞 Support

- **Documentation**: See `/docs` for detailed guides
- **Issues**: Report bugs via GitHub Issues
- **Security**: Report security issues privately
- **Performance**: Use built-in performance profiling

---

## 🎉 Summary

This comprehensive testing suite ensures the Pactify platform is:

- **Functionally Complete**: All features work as designed
- **Secure**: Protected against common vulnerabilities
- **Performant**: Handles expected load efficiently
- **Reliable**: Gracefully handles error conditions
- **Maintainable**: Tests are clear and well-organized

The test suite is designed to run in CI/CD pipelines and provides confidence for production deployments.