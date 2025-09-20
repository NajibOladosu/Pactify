# Payment Method Verification API Setup

This guide explains how to set up real API integrations for payment method verification in Pactify.

## Overview

The payment verification system now supports both **demo mode** (for development/testing) and **production mode** (with real API integrations). When API credentials are not configured, the system automatically falls back to demo behavior.

## Demo vs Production Behavior

### Demo Mode (No API Keys)
- **PayPal**: Rejects emails with fake domains (`fake.com`, `test.com`, `example.com`, `invalid.com`)
- **Wise**: Rejects recipient IDs containing obvious fake patterns (`fake`, `test`, `invalid`, `12345`, `demo`)
- **Stripe**: Always shows as requiring micro-deposits

### Production Mode (With API Keys)
- **PayPal**: Real API verification using PayPal Payouts API
- **Wise**: Real API verification using Wise Recipients API
- **Stripe**: Real API verification using Stripe Connect API

## Setting Up Real API Integrations

### 1. PayPal API Setup

1. **Create PayPal Developer Account**:
   - Go to [PayPal Developer](https://developer.paypal.com/)
   - Create an account and log in

2. **Create Application**:
   - Navigate to "My Apps & Credentials"
   - Click "Create App"
   - Choose "Default Application" type
   - Select "Sandbox" for testing or "Live" for production

3. **Get Credentials**:
   - Copy the **Client ID** and **Client Secret**
   - Add to your `.env.local`:
     ```env
     PAYPAL_CLIENT_ID=your_client_id_here
     PAYPAL_CLIENT_SECRET=your_client_secret_here
     PAYPAL_ENVIRONMENT=sandbox  # or 'live' for production
     ```

4. **Required Permissions**:
   - Ensure your app has "Payouts" permission enabled
   - This allows verification by attempting to create (and immediately cancel) payout items

### 2. Wise API Setup

1. **Create Wise Business Account**:
   - Sign up for [Wise Business](https://wise.com/business/)
   - Complete business verification

2. **Generate API Token**:
   - Go to Wise Business dashboard
   - Navigate to "Settings" → "API tokens"
   - Create a new token with "Recipients" read permission

3. **Get Credentials**:
   - Copy the **API Token**
   - Add to your `.env.local`:
     ```env
     WISE_API_TOKEN=your_api_token_here
     WISE_ENVIRONMENT=sandbox  # or 'live' for production
     ```

4. **Required Permissions**:
   - The API token needs "Recipients" read access
   - This allows verification by checking if recipient IDs exist and are active

### 3. Stripe Connect Setup

1. **Stripe Account Setup**:
   - Ensure you have Stripe Connect enabled in your account
   - Go to [Stripe Dashboard](https://dashboard.stripe.com/)

2. **Get API Keys**:
   - Navigate to "Developers" → "API keys"
   - Copy your **Secret key**
   - Add to your `.env.local`:
     ```env
     STRIPE_SECRET_KEY=sk_test_...  # or sk_live_... for production
     ```

3. **Connect Account Verification**:
   - The system will check Connect account status
   - Verifies if accounts can receive payouts
   - Checks for any pending verification requirements

## Testing the Integrations

### Without API Keys (Demo Mode)
```bash
# Try these test cases in the UI:

# PayPal - Should FAIL verification
test@fake.com
user@example.com

# PayPal - Should PASS verification  
real.user@gmail.com
john.doe@yahoo.com

# Wise - Should FAIL verification
fake123
test-recipient
invalid-id

# Wise - Should PASS verification
recipient-abc123
wise-user-456789
```

### With API Keys (Production Mode)
```bash
# Test with real accounts:

# PayPal - Use actual PayPal email addresses
# Wise - Use real Wise recipient IDs
# Stripe - Use actual Stripe Connect account IDs
```

## Security Considerations

1. **API Keys Storage**:
   - Never commit API keys to version control
   - Use environment variables only
   - Rotate keys regularly

2. **Rate Limiting**:
   - PayPal: 100 requests per second
   - Wise: 60 requests per minute
   - Stripe: 100 requests per second

3. **Error Handling**:
   - All API calls include proper error handling
   - Failed verifications are logged but don't crash the system
   - Users receive user-friendly error messages

## Monitoring and Logs

### Development
- Check browser console for verification logs
- Look for "Using real [API] verification" vs "Using demo [API] verification"

### Production
- Set up monitoring for API failures
- Track verification success rates
- Monitor API usage and costs

## API Costs

### PayPal
- Payouts API: $0.25 per transaction (cancelled immediately for verification)
- Consider batching verifications to reduce costs

### Wise
- Recipients API: Free for verification lookups
- No charges for checking recipient status

### Stripe
- Connect API: Free for account status checks
- No charges for verification queries

## Troubleshooting

### Common Issues

1. **"API credentials not configured"**:
   - Check that environment variables are properly set
   - Restart your development server after adding new env vars

2. **"PayPal verification failed"**:
   - Verify Client ID and Secret are correct
   - Check that Payouts permission is enabled
   - Ensure environment is set correctly (sandbox/live)

3. **"Wise recipient not found"**:
   - Confirm the recipient ID exists in your Wise account
   - Check API token has proper permissions
   - Verify the recipient is active

4. **"Stripe verification failed"**:
   - Ensure Connect is enabled on your account
   - Check that the account ID format is correct
   - Verify API key has proper permissions

### Getting Help

1. Check the server logs for detailed error messages
2. Test API credentials directly using the provider's documentation
3. Verify all required permissions are granted
4. Contact the respective API support teams for account-specific issues

## Future Enhancements

- **Webhook Integration**: Real-time verification status updates
- **Bulk Verification**: Batch verification for multiple accounts
- **Verification Caching**: Cache successful verifications to reduce API calls
- **Additional Providers**: Support for more payment rails (Payoneer, etc.)