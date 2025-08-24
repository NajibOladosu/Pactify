# Pactify Testing Setup Guide

This guide explains how to set up and run the Pactify test suite.

## 🎯 Quick Start

### Option 1: Simple Tests (No Setup Required)
Run basic tests that don't require database or API setup:

```bash
npm run test:simple
```

This runs:
- Utility function tests
- Component rendering tests  
- Basic API validation tests
- Environment setup tests

### Option 2: Simple Jest Tests
Run the existing simple Jest tests:

```bash
npm test
```

This will run all tests that don't require complex environment setup.

## 🚀 Full Test Suite Setup

For comprehensive testing including database and API integration, follow these steps:

### 1. Environment Configuration

Create a `.env.local` file or copy the test environment file:

```bash
cp .env.test .env.local
```

Then update with your actual test credentials:

```env
# Supabase Test Project
NEXT_PUBLIC_SUPABASE_URL=https://your-test-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_test_anon_key
SUPABASE_SERVICE_ROLE=your_test_service_role_key

# Stripe Test Keys
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_key
STRIPE_SECRET_KEY=sk_test_your_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Email Configuration
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_test_email
SMTP_PASS=your_test_password
```

### 2. Database Setup

1. **Create a Supabase test project** at https://supabase.com
2. **Apply the database schema**:
   ```bash
   npm run db:schema
   ```
3. **Enable Row Level Security** policies in Supabase dashboard
4. **Configure authentication** settings in Supabase

### 3. Stripe Setup

1. **Create a Stripe test account** at https://stripe.com
2. **Get your test API keys** from the Stripe dashboard
3. **Set up webhooks** for your test environment
4. **Configure product and price IDs** for subscription testing

### 4. Run Comprehensive Tests

Once environment is configured:

```bash
npm run test:comprehensive
```

This runs the full test suite including:
- Authentication and profile tests
- Contract lifecycle tests
- Payment and escrow tests
- Subscription management tests
- Dispute resolution tests
- End-to-end workflow tests

## 🧪 Test Categories

### Unit Tests
```bash
npm run test:utils        # Utility functions
npm run test:components   # React components
```

### Integration Tests
```bash
npm run test:integration  # Database and API integration
npm run test:api         # API endpoint testing
```

### Coverage Reports
```bash
npm run test:coverage    # Generate coverage report
```

## ⚠️ Common Issues

### 1. "supabaseKey is required" Error

**Cause**: Missing or invalid Supabase environment variables.

**Solution**: 
- Check your `.env.local` file has correct Supabase URLs and keys
- Verify your Supabase project is accessible
- Use the test environment file: `cp .env.test .env.local`

### 2. "Jest encountered an unexpected token"

**Cause**: ES modules configuration issue.

**Solution**:
- Run `npm run test:simple` for basic tests
- Check that `jest.config.js` is properly configured
- Ensure Node.js version is 18+

### 3. Stripe API Errors

**Cause**: Invalid Stripe test keys or network issues.

**Solution**:
- Use Stripe test mode keys (start with `pk_test_` and `sk_test_`)
- Check network connectivity
- Verify Stripe account is in good standing

### 4. Database Connection Issues

**Cause**: Supabase project not accessible or RLS policies blocking access.

**Solution**:
- Check Supabase project URL and keys
- Verify RLS policies allow test operations
- Ensure service role key has proper permissions

## 🔧 Test Configuration

### Jest Configuration
The project uses `jest.config.js` with Next.js integration:
- Test environment: Node.js
- Setup files: Environment variables and mocks
- Coverage: Comprehensive coverage of app, lib, and utils
- Timeout: 30 seconds for integration tests

### Test Environment Variables
Tests use environment variables from:
1. `.env.local` (highest priority)
2. `.env.test` (fallback)
3. Hardcoded mock values (for simple tests)

### Mock Services
For tests without real API access:
- Supabase operations are mocked with test data
- Stripe API calls use test mode
- Email sending is mocked in test environment

## 📊 Test Coverage

The comprehensive test suite covers:

- **Authentication**: Registration, login, password reset
- **Contracts**: Creation, signing, milestone management
- **Payments**: Stripe integration, escrow, fee calculations
- **Subscriptions**: Plan management, billing, webhooks
- **Disputes**: Creation, escalation, resolution
- **Security**: Input validation, rate limiting, authorization
- **Performance**: Response times, concurrent users

## 🎯 Test Best Practices

1. **Isolation**: Each test is independent and cleans up after itself
2. **Realistic Data**: Tests use realistic contract and payment amounts
3. **Error Scenarios**: Both success and failure cases are tested
4. **Security**: Input validation and authorization are thoroughly tested
5. **Performance**: Tests include performance and load considerations

## 🚀 CI/CD Integration

For automated testing in CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Run Tests
  run: |
    npm install
    npm run test:simple
  env:
    NODE_ENV: test
```

For full integration testing in CI/CD, set up test databases and API keys as secrets.

## 📞 Support

If you encounter issues:

1. **Check this guide** for common solutions
2. **Review test logs** for specific error messages
3. **Verify environment** variables are correctly set
4. **Test incrementally** starting with simple tests
5. **Create an issue** if problems persist

## 🎉 Success!

When tests pass, you'll see:
- ✅ All test suites completed
- 📊 Coverage report generated
- 🎯 Summary of tested features
- 🚀 Confirmation that platform is ready

The comprehensive test suite ensures the Pactify platform is production-ready with full functionality, security, and performance validation!