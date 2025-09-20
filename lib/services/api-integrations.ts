// Real API integrations for payment method verification
import { VerificationResult } from './payment-verification';

// PayPal API Integration
export async function verifyPayPalAccountReal(email: string): Promise<VerificationResult> {
  try {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const environment = process.env.PAYPAL_ENVIRONMENT || 'sandbox';

    if (!clientId || !clientSecret) {
      return {
        success: false,
        verified: false,
        error: 'PayPal API credentials not configured'
      };
    }

    // PayPal API base URL
    const baseUrl = environment === 'live' 
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

    // Step 1: Get access token
    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResponse.ok) {
      throw new Error(`PayPal token request failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Step 2: Verify the PayPal account exists
    // Note: PayPal doesn't have a direct "verify email" endpoint for security reasons
    // Instead, we can use the Payouts API to validate if we can create a payout item
    // This is a "dry run" to check if the email is valid for receiving payments
    
    const payoutResponse = await fetch(`${baseUrl}/v1/payments/payouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: `verify_${Date.now()}`,
          email_subject: "Account Verification Test",
          email_message: "This is a verification test - no payment will be sent"
        },
        items: [{
          recipient_type: "EMAIL",
          amount: {
            value: "0.01",
            currency: "USD"
          },
          receiver: email,
          note: "Verification test",
          sender_item_id: `verify_${Date.now()}`
        }]
      })
    });

    // If the payout creation returns 201, the email is valid
    // We immediately cancel it since this is just verification
    if (payoutResponse.status === 201) {
      const payoutData = await payoutResponse.json();
      
      // Cancel the payout immediately
      if (payoutData.batch_header?.payout_batch_id) {
        await fetch(`${baseUrl}/v1/payments/payouts/${payoutData.batch_header.payout_batch_id}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ batch_status: "CANCELED" })
        });
      }

      return {
        success: true,
        verified: true,
        details: {
          verified_at: new Date().toISOString(),
          verification_method: 'paypal_payout_validation',
          account_status: 'valid'
        }
      };
    }

    // Check specific error types
    const errorData = await payoutResponse.json();
    const errorName = errorData.name;

    if (errorName === 'RECEIVER_UNREGISTERED') {
      return {
        success: true,
        verified: false,
        error: 'PayPal account not found for this email address'
      };
    }

    if (errorName === 'INVALID_REQUEST') {
      return {
        success: true,
        verified: false,
        error: 'Invalid PayPal email format'
      };
    }

    throw new Error(`PayPal verification failed: ${errorName || 'Unknown error'}`);

  } catch (error) {
    console.error('PayPal verification error:', error);
    return {
      success: false,
      verified: false,
      error: error instanceof Error ? error.message : 'PayPal verification failed'
    };
  }
}

// Wise API Integration
export async function verifyWiseAccountReal(recipientId: string): Promise<VerificationResult> {
  try {
    const apiToken = process.env.WISE_API_TOKEN;
    const environment = process.env.WISE_ENVIRONMENT || 'sandbox';

    if (!apiToken) {
      return {
        success: false,
        verified: false,
        error: 'Wise API token not configured'
      };
    }

    // Wise API base URL
    const baseUrl = environment === 'live' 
      ? 'https://api.transferwise.com'
      : 'https://api.sandbox.transferwise.tech';

    // Verify the recipient exists and is active
    const recipientResponse = await fetch(`${baseUrl}/v1/recipients/${recipientId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      }
    });

    if (recipientResponse.status === 200) {
      const recipientData = await recipientResponse.json();
      
      // Check if the recipient is active and valid
      if (recipientData.active === true) {
        return {
          success: true,
          verified: true,
          details: {
            verified_at: new Date().toISOString(),
            verification_method: 'wise_recipient_lookup',
            recipient_status: 'active',
            recipient_name: recipientData.name,
            account_type: recipientData.accountHolderName ? 'business' : 'personal'
          }
        };
      } else {
        return {
          success: true,
          verified: false,
          error: 'Wise recipient exists but is not active'
        };
      }
    }

    if (recipientResponse.status === 404) {
      return {
        success: true,
        verified: false,
        error: 'Wise recipient not found'
      };
    }

    if (recipientResponse.status === 403) {
      return {
        success: true,
        verified: false,
        error: 'Access denied - recipient may belong to another account'
      };
    }

    throw new Error(`Wise API error: ${recipientResponse.status}`);

  } catch (error) {
    console.error('Wise verification error:', error);
    return {
      success: false,
      verified: false,
      error: error instanceof Error ? error.message : 'Wise verification failed'
    };
  }
}

// Stripe Connect Account Verification (Real)
export async function verifyStripeAccountReal(externalAccountId: string): Promise<VerificationResult> {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      return {
        success: false,
        verified: false,
        error: 'Stripe API key not configured'
      };
    }

    // Check the external account status via Stripe API
    const response = await fetch(`https://api.stripe.com/v1/accounts/${externalAccountId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
      }
    });

    if (response.status === 200) {
      const accountData = await response.json();
      
      // Check if the account can receive payouts
      const canReceivePayouts = accountData.capabilities?.transfers === 'active';
      const chargesEnabled = accountData.charges_enabled;
      const payoutsEnabled = accountData.payouts_enabled;

      if (canReceivePayouts && chargesEnabled && payoutsEnabled) {
        return {
          success: true,
          verified: true,
          details: {
            verified_at: new Date().toISOString(),
            verification_method: 'stripe_connect_status',
            account_status: 'verified',
            charges_enabled: chargesEnabled,
            payouts_enabled: payoutsEnabled
          }
        };
      } else {
        return {
          success: true,
          verified: false,
          error: 'Stripe account exists but requires additional verification steps',
          details: {
            verification_method: 'stripe_connect_status',
            charges_enabled: chargesEnabled,
            payouts_enabled: payoutsEnabled,
            required_actions: accountData.requirements?.currently_due || []
          }
        };
      }
    }

    if (response.status === 404) {
      return {
        success: true,
        verified: false,
        error: 'Stripe account not found'
      };
    }

    throw new Error(`Stripe API error: ${response.status}`);

  } catch (error) {
    console.error('Stripe verification error:', error);
    return {
      success: false,
      verified: false,
      error: error instanceof Error ? error.message : 'Stripe verification failed'
    };
  }
}