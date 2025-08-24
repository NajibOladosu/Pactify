# Real Database Testing Setup Guide

The Pactify test suite is designed to work with **real Supabase and Stripe data** for authentic integration testing. This guide shows you how to set up a proper test environment.

## 🎯 Why Real Data Testing?

- **Authentic Integration**: Tests real database constraints and relationships
- **Real API Behavior**: Tests actual Supabase RLS policies and Stripe responses  
- **Production Accuracy**: Catches issues that mocks might miss
- **Data Integrity**: Validates actual database transactions and rollbacks
- **Security Testing**: Tests real authentication and authorization flows

## 🚀 Quick Setup (5 Minutes)

### 1. Create Supabase Test Project

1. Go to [supabase.com](https://supabase.com) and create a **new project**
2. Name it `pactify-test` (or similar)
3. Wait for project initialization (~2 minutes)
4. Get your credentials from Settings > API

### 2. Apply Database Schema

```bash
# Set environment variables for your test project
export NEXT_PUBLIC_SUPABASE_URL="https://your-test-project.supabase.co"
export SUPABASE_SERVICE_ROLE="your-service-role-key"

# Apply the schema to your test database
npm run db:schema
```

### 3. Configure Environment

Create `.env.local` with your test credentials:

```env
# Supabase Test Project (REAL DATA)
NEXT_PUBLIC_SUPABASE_URL=https://your-test-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE=your_service_role_key

# Stripe Test Mode (REAL STRIPE TESTING)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_real_stripe_key
STRIPE_SECRET_KEY=sk_test_your_real_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_real_webhook_secret

# Email (Real SMTP or Service)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-test-email@gmail.com
SMTP_PASS=your-app-password

NODE_ENV=test
```

### 4. Run Real Data Tests

```bash
# Run comprehensive tests with real database
npm run test:comprehensive
```

## 📊 What Gets Tested with Real Data

### Real Database Operations
- ✅ **User Registration**: Creates real users in Supabase Auth
- ✅ **Profile Creation**: Real profile records with RLS policies
- ✅ **Contract Management**: Real contract creation, signing, and updates
- ✅ **Payment Processing**: Real Stripe test transactions
- ✅ **Subscription Billing**: Real Stripe subscription management
- ✅ **Dispute Resolution**: Real dispute workflow with database updates

### Real API Integration
- ✅ **Supabase Auth**: Real authentication flows and session management
- ✅ **Row Level Security**: Tests actual RLS policies and permissions  
- ✅ **Database Constraints**: Validates foreign keys, unique constraints
- ✅ **Stripe Integration**: Real payment processing in test mode
- ✅ **Email Delivery**: Real email sending (if configured)

### Real Security Testing
- ✅ **Authentication**: Real JWT tokens and session validation
- ✅ **Authorization**: Real user permission checks
- ✅ **Data Access**: Real RLS policy enforcement
- ✅ **Input Validation**: Real database constraint validation

## 🔧 Test Database Management

### Test Data Lifecycle

The tests are designed to:
1. **Create real test users** (freelancer.test@pactify.com, client.test@pactify.com)
2. **Generate real test data** (contracts, payments, disputes)
3. **Execute real workflows** (complete contract lifecycle)
4. **Clean up test data** after test completion

### Data Isolation

Each test run:
- Creates unique test users with timestamp IDs
- Uses real but isolated test data
- Cleans up after completion
- Won't interfere with other test runs

### Database Safety

The test suite:
- Only operates on records it creates
- Uses test-specific email addresses
- Includes safety checks to prevent production data interference
- Validates test environment before executing

## 🎯 Real Data Test Examples

### Authentication Testing (Real Supabase)
```javascript
// Creates real user in Supabase Auth
const user = await supabase.auth.signUp({
  email: 'freelancer.test@pactify.com',
  password: 'SecureTestPassword123!',
  options: {
    data: { user_type: 'freelancer' }
  }
});

// Tests real profile creation trigger
const profile = await supabase
  .from('profiles')
  .select('*')
  .eq('id', user.data.user.id)
  .single();
```

### Contract Testing (Real Database)
```javascript
// Creates real contract in database
const contract = await supabase
  .from('contracts')
  .insert({
    title: 'Real Test Contract',
    creator_id: freelancerUser.id,
    total_amount: 5000,
    status: 'draft'
  })
  .select()
  .single();

// Tests real RLS policies
const accessTest = await supabase
  .from('contracts')
  .select('*')
  .eq('id', contract.id); // Should only return if user has access
```

### Payment Testing (Real Stripe)
```javascript
// Creates real Stripe test payment
const paymentIntent = await stripe.paymentIntents.create({
  amount: 5000,
  currency: 'usd',
  metadata: {
    contract_id: contract.id,
    test: 'true'
  }
});

// Tests real webhook processing
const webhook = stripe.webhooks.constructEvent(
  payload,
  signature,
  process.env.STRIPE_WEBHOOK_SECRET
);
```

## 🔒 Security Considerations

### Test Environment Safety
- **Separate Database**: Uses dedicated test Supabase project
- **Test Mode Only**: Stripe operates in test mode (no real money)
- **Isolated Data**: Test data doesn't mix with production data
- **Clean Credentials**: Uses separate API keys for testing

### Data Protection
- **No Sensitive Data**: Test data contains no real personal information
- **Temporary Records**: Test records are cleaned up after tests
- **Access Controls**: Tests validate RLS policies and permissions
- **Audit Trails**: All test operations are logged

## 📈 Benefits of Real Data Testing

### Catches Real Issues
- **Database Constraints**: Finds actual constraint violations
- **RLS Policies**: Validates real security policies
- **API Limitations**: Discovers real API rate limits and errors
- **Integration Bugs**: Finds issues between different services

### Production Confidence
- **Real Behavior**: Tests behave like production
- **Performance**: Real database performance characteristics
- **Scalability**: Tests actual query performance
- **Reliability**: Validates real error handling

### Development Quality
- **Authentic Feedback**: Realistic test results
- **Debugging**: Real error messages and stack traces
- **Monitoring**: Real performance metrics
- **Documentation**: Real API response examples

## 🚀 Running Real Data Tests

### Full Test Suite
```bash
# Run all tests with real database and Stripe
npm run test:comprehensive
```

### Specific Test Categories
```bash
# Test authentication with real Supabase
npm run test:integration -- --testNamePattern="Authentication"

# Test payments with real Stripe
npm run test:integration -- --testNamePattern="Payment"

# Test complete workflow end-to-end
npm run test:e2e
```

### Development Testing
```bash
# Watch mode for active development
npm run test:watch

# Coverage report with real data
npm run test:coverage
```

## 🎉 Expected Results

When properly configured, you'll see:

```
🚀 Starting Pactify Platform Test Suite
🔧 Setting up test environment...
✅ Supabase connection verified
✅ Stripe test mode confirmed
✅ Test users created successfully

[1/11] Authentication & Profile Tests
✅ User registration with real Supabase Auth
✅ Profile creation with real database triggers
✅ RLS policies enforced correctly

[2/11] Contract Lifecycle Tests  
✅ Contract creation in real database
✅ Digital signatures with real validation
✅ Status transitions with real constraints

[3/11] Payment & Escrow Tests
✅ Real Stripe payment intent creation
✅ Webhook processing with real signatures
✅ Escrow management with real transfers

... (continues for all 11 test suites)

🎉 ALL TESTS PASSED! Platform ready for production.
```

## 🛠️ Troubleshooting Real Data Tests

### Common Issues and Solutions

1. **"supabaseKey is required"**
   - Check your `.env.local` file has correct Supabase credentials
   - Verify your test project is active in Supabase dashboard

2. **"RLS policy violation"**  
   - Check RLS policies are properly configured
   - Verify service role key has bypass privileges

3. **"Stripe webhook signature invalid"**
   - Use real webhook secret from Stripe dashboard
   - Ensure webhook endpoint is properly configured

4. **"Email delivery failed"**
   - Configure real SMTP credentials
   - Or set `MOCK_EMAIL=true` for email-less testing

## 🎯 Next Steps

1. **Set up test environment** following this guide
2. **Run real data tests** to validate platform functionality  
3. **Configure CI/CD** to run tests with real data in pipeline
4. **Monitor test results** to catch regressions early
5. **Expand test coverage** as new features are added

This real data testing approach ensures your Pactify platform is thoroughly validated and production-ready! 🚀