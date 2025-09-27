# Stripe Connect + Identity Implementation Guide

This document outlines the comprehensive implementation of Stripe Connect Express accounts with Stripe Identity verification for secure user fund disbursements in Pactify.

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Next.js API    │    │   Supabase      │
│   (React)       │◄──►│   Routes         │◄──►│   Database      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │   Stripe API     │
                       │ ┌──────────────┐ │
                       │ │   Connect    │ │
                       │ │   Identity   │ │
                       │ │   Payouts    │ │
                       │ └──────────────┘ │
                       └──────────────────┘
```

## Core Components

### 1. Database Schema

Enhanced schema with the following key tables:

#### Updated `profiles` table:
```sql
-- Core user verification fields
stripe_account_id text UNIQUE
stripe_account_type text ('express', 'custom', 'standard')
identity_status text ('unstarted', 'pending', 'verified', 'failed', 'requires_input')
identity_verification_session_id text
withdrawal_hold_until timestamptz
withdrawal_limits jsonb
payout_methods jsonb
default_payout_method_id text
last_kyc_check_at timestamptz
kyc_risk_score integer
requires_enhanced_kyc boolean
```

#### New tables:
- `withdrawals` - Audit trail and status tracking
- `payout_methods` - User payment methods
- `identity_verification_sessions` - Stripe Identity sessions
- `withdrawal_rate_limits` - Anti-abuse controls
- `withdrawal_security_logs` - Security audit logs

### 2. API Routes

#### Connect Account Management
- `POST /api/connect/v2/create-account` - Create Express Connect account
- `GET /api/connect/v2/create-account` - Check account status

#### Identity Verification
- `POST /api/identity/create-verification-session` - Start identity verification
- `GET /api/identity/create-verification-session` - Check verification status

#### Payout Methods
- `POST /api/payout-methods` - Add new payout method
- `GET /api/payout-methods` - List user's payout methods

#### Withdrawals
- `POST /api/withdrawals/v2/request` - Request withdrawal with security controls
- `GET /api/withdrawals/v2/request` - Check withdrawal eligibility

#### Webhooks
- `POST /api/webhooks/stripe/v2` - Comprehensive webhook handler

### 3. Security Features

#### Multi-Layer Security Assessment
The `WithdrawalSecurityManager` performs comprehensive risk assessment:

1. **Account Security** - Age, verification status, failure history
2. **Amount Analysis** - High amounts, unusual patterns
3. **Behavioral Analysis** - IP changes, device changes, timing
4. **Payout Method Security** - Age, verification status
5. **Network Security** - Suspicious IPs, VPNs, bots
6. **Rate Limiting** - Hourly/daily limits

#### Risk Scoring
- **0-25**: Low risk - Auto-approve
- **25-50**: Medium risk - Manual review
- **50-75**: High risk - Manual review + additional checks
- **75+**: Critical risk - Block/require admin approval

#### Anti-Abuse Measures
- Rate limiting (3/hour, 10/day)
- 72-hour hold for new payout methods
- Minimum account age requirements
- IP and device fingerprinting
- Pattern analysis for suspicious behavior
- Manual review for high-risk transactions

## Implementation Flow

### 1. User Onboarding

```typescript
// 1. Create Stripe Connect Express account
const response = await fetch('/api/connect/v2/create-account', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    country: 'US',
    business_type: 'individual'
  })
});

// 2. Redirect to Stripe onboarding
window.location.href = response.onboardingUrl;
```

### 2. Identity Verification

```typescript
// Start identity verification
const verificationResponse = await fetch('/api/identity/create-verification-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'document',
    return_url: window.location.origin + '/dashboard/kyc/complete'
  })
});

// Use Stripe Identity SDK
const stripe = new Stripe(publishableKey);
stripe.verifyIdentity(verificationResponse.session.client_secret);
```

### 3. Add Payout Method

```typescript
// Add bank account
const payoutMethodResponse = await fetch('/api/payout-methods', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'bank_account',
    bank_account: {
      country: 'US',
      currency: 'USD',
      account_holder_name: 'John Doe',
      account_holder_type: 'individual',
      routing_number: '110000000',
      account_number: '000123456789'
    },
    make_default: true
  })
});
```

### 4. Request Withdrawal

```typescript
// Check eligibility first
const eligibility = await fetch('/api/withdrawals/v2/request');

// Request withdrawal
const withdrawalResponse = await fetch('/api/withdrawals/v2/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amount_cents: 100000, // $1,000
    currency: 'USD',
    payout_method_id: 'uuid-of-payout-method',
    urgency: 'standard'
  })
});
```

## Webhook Handling

The webhook handler processes these critical events:

### Connect Account Events
- `account.updated` - Updates verification status
- `account.external_account.*` - Manages payout methods

### Identity Events
- `identity.verification_session.verified` - Marks user as verified
- `identity.verification_session.failed` - Handles verification failures

### Payout Events
- `payout.paid` - Marks withdrawal as completed
- `payout.failed` - Handles payout failures

### Example Webhook Processing
```typescript
// account.updated event
if (account.details_submitted && account.charges_enabled) {
  await supabaseAdmin
    .from('profiles')
    .update({ identity_status: 'verified' })
    .eq('stripe_account_id', account.id);
}

// payout.paid event
await supabaseAdmin
  .from('withdrawals')
  .update({ 
    status: 'paid',
    completed_at: new Date().toISOString()
  })
  .eq('stripe_payout_id', payout.id);
```

## Security Configuration

### Environment Variables Required
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_SERVICE_ROLE=eyJ...
NEXT_PUBLIC_SUPABASE_URL=https://...
```

### Supabase RLS Policies
All tables have Row Level Security enabled with policies for:
- Users can only access their own data
- Service role has full access for webhooks
- Proper isolation between users

### Rate Limiting Configuration
```typescript
const WITHDRAWAL_LIMITS = {
  daily: 500000,    // $5,000
  weekly: 2000000,  // $20,000
  monthly: 10000000, // $100,000
  min_amount: 100,  // $1
  max_amount: 1000000, // $10,000 (auto-review threshold)
};

const RATE_LIMITS = {
  attempts_per_hour: 3,
  attempts_per_day: 10,
};
```

## Testing Checklist

### 1. Connect Account Creation
- [ ] Create Express account successfully
- [ ] Handle duplicate account creation
- [ ] Validate country/business type
- [ ] Rate limiting works

### 2. Identity Verification
- [ ] Create verification session
- [ ] Handle verification success/failure
- [ ] Update user status correctly
- [ ] Rate limiting works

### 3. Payout Methods
- [ ] Add bank account successfully
- [ ] Add debit card successfully
- [ ] Handle verification webhooks
- [ ] 72-hour hold enforced

### 4. Withdrawals
- [ ] Security assessment works
- [ ] Risk scoring accurate
- [ ] Rate limiting enforced
- [ ] Manual review triggered for high-risk
- [ ] Stripe payout created successfully

### 5. Webhooks
- [ ] Signature verification works
- [ ] All relevant events handled
- [ ] Database updates correctly
- [ ] Error handling robust

## Monitoring and Alerts

### Key Metrics to Monitor
1. **Verification Success Rate** - Identity verification completion rate
2. **Withdrawal Success Rate** - Percentage of successful payouts
3. **Security Assessment Accuracy** - False positive/negative rates
4. **Rate Limit Violations** - Frequency of rate limiting
5. **Manual Review Queue** - Backlog of high-risk withdrawals

### Recommended Alerts
1. High number of failed verifications
2. Unusual spike in withdrawal requests
3. High rate of security flags
4. Webhook processing failures
5. Database errors in security logs

## Compliance Considerations

### KYC/AML Requirements
- Stripe Identity handles document verification
- Additional enhanced KYC for high-value transactions
- Audit trail maintained in security logs
- Regular reconciliation required

### Data Privacy
- Minimal PII stored in database
- Stripe handles sensitive document storage
- GDPR/CCPA compliance via data retention policies
- User consent tracking

### Financial Regulations
- Transaction reporting for large amounts
- Suspicious activity monitoring
- Anti-money laundering controls
- Regular compliance audits

## Troubleshooting

### Common Issues

#### "Identity verification required"
- Check `identity_status` in profiles table
- Verify Stripe Identity session completed
- Check webhook processing logs

#### "Withdrawal hold active"
- Check `withdrawal_hold_until` field
- Verify 72-hour period for new payout methods
- Check for manual holds

#### "Payout method not verified"
- Check webhook processing for external account events
- Verify Stripe Connect account status
- Check payout method `is_verified` status

#### High risk scores
- Review security log flags
- Check user behavior patterns
- Validate IP/device information
- Consider manual review adjustment

## Production Deployment

### Pre-deployment Checklist
- [ ] All environment variables set
- [ ] Database migrations applied
- [ ] Webhook endpoints configured in Stripe
- [ ] RLS policies enabled
- [ ] Security functions tested
- [ ] Monitoring configured
- [ ] Alert thresholds set

### Go-live Steps
1. Deploy to staging environment
2. Test full user flow end-to-end
3. Verify webhook processing
4. Test security controls
5. Deploy to production
6. Monitor initial transactions
7. Validate security logs

This implementation provides a robust, secure, and scalable foundation for user fund disbursements using Stripe Connect and Identity verification.