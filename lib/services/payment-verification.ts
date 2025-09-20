// Payment method verification services
import { createClient } from '@/utils/supabase/server';
import { 
  verifyPayPalAccountReal, 
  verifyWiseAccountReal, 
  verifyStripeAccountReal 
} from './api-integrations';

export interface VerificationResult {
  success: boolean;
  verified: boolean;
  error?: string;
  details?: any;
}

export async function verifyPayPalAccount(email: string): Promise<VerificationResult> {
  try {
    // Check if real API credentials are available
    const hasApiCredentials = process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET;
    
    if (hasApiCredentials) {
      // Use real PayPal API verification
      console.log('Using real PayPal API verification for:', email);
      return await verifyPayPalAccountReal(email);
    }

    // Fallback to demo behavior when API credentials are not configured
    console.log('Using demo PayPal verification for:', email);
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        success: true,
        verified: false,
        error: 'Invalid email format for PayPal account'
      };
    }

    // Demo behavior: reject obviously fake emails
    const fakeDomains = ['fake.com', 'test.com', 'example.com', 'invalid.com'];
    const domain = email.split('@')[1]?.toLowerCase();
    
    if (fakeDomains.includes(domain)) {
      return {
        success: true,
        verified: false,
        error: 'PayPal account not found for this email address'
      };
    }

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      success: true,
      verified: true,
      details: {
        verified_at: new Date().toISOString(),
        verification_method: 'demo_verification',
        account_status: 'active'
      }
    };
  } catch (error) {
    return {
      success: false,
      verified: false,
      error: error instanceof Error ? error.message : 'PayPal verification failed'
    };
  }
}

export async function verifyWiseAccount(recipientId: string): Promise<VerificationResult> {
  try {
    // Check if real API credentials are available
    const hasApiCredentials = process.env.WISE_API_TOKEN;
    
    if (hasApiCredentials) {
      // Use real Wise API verification
      console.log('Using real Wise API verification for recipient:', recipientId);
      return await verifyWiseAccountReal(recipientId);
    }

    // Fallback to demo behavior when API credentials are not configured
    console.log('Using demo Wise verification for recipient:', recipientId);
    
    if (!recipientId || recipientId.length < 5) {
      return {
        success: true,
        verified: false,
        error: 'Invalid Wise recipient ID format'
      };
    }

    // Demo behavior: reject obviously fake recipient IDs
    const fakePatterns = ['fake', 'test', 'invalid', '12345', 'demo'];
    const isObviouslyFake = fakePatterns.some(pattern => 
      recipientId.toLowerCase().includes(pattern)
    );
    
    if (isObviouslyFake) {
      return {
        success: true,
        verified: false,
        error: 'Wise recipient not found'
      };
    }

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    return {
      success: true,
      verified: true,
      details: {
        verified_at: new Date().toISOString(),
        verification_method: 'demo_verification',
        recipient_status: 'active'
      }
    };
  } catch (error) {
    return {
      success: false,
      verified: false,
      error: error instanceof Error ? error.message : 'Wise verification failed'
    };
  }
}

export async function verifyStripeAccount(externalAccountId: string): Promise<VerificationResult> {
  try {
    // Check if real API credentials are available
    const hasApiCredentials = process.env.STRIPE_SECRET_KEY;
    
    if (hasApiCredentials) {
      // Use real Stripe API verification
      console.log('Using real Stripe API verification for account:', externalAccountId);
      return await verifyStripeAccountReal(externalAccountId);
    }

    // Fallback to demo behavior when API credentials are not configured
    console.log('Using demo Stripe verification for account:', externalAccountId);
    
    if (!externalAccountId || externalAccountId.length < 10) {
      return {
        success: true,
        verified: false,
        error: 'Invalid Stripe external account ID'
      };
    }

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Demo behavior: Stripe typically requires micro-deposits or other verification
    return {
      success: true,
      verified: false,
      error: 'Bank verification required - micro-deposits will be sent within 1-2 business days',
      details: {
        verification_method: 'micro_deposits_pending',
        expected_verification_time: '1-2 business days'
      }
    };
  } catch (error) {
    return {
      success: false,
      verified: false,
      error: error instanceof Error ? error.message : 'Stripe verification failed'
    };
  }
}

export async function verifyPaymentMethod(methodId: string): Promise<VerificationResult> {
  try {
    const supabase = await createClient();
    
    // Get the payment method details
    const { data: method, error: fetchError } = await supabase
      .from('withdrawal_methods')
      .select('*')
      .eq('id', methodId)
      .single();

    if (fetchError || !method) {
      return {
        success: false,
        verified: false,
        error: 'Payment method not found'
      };
    }

    if (method.is_verified) {
      return {
        success: true,
        verified: true,
        details: { message: 'Already verified' }
      };
    }

    let result: VerificationResult;

    // Route to appropriate verification method
    switch (method.rail) {
      case 'paypal':
        result = await verifyPayPalAccount(method.paypal_receiver);
        break;
      case 'wise':
        result = await verifyWiseAccount(method.wise_recipient_id);
        break;
      case 'stripe':
        result = await verifyStripeAccount(method.stripe_external_account_id);
        break;
      default:
        return {
          success: false,
          verified: false,
          error: `Verification not implemented for rail: ${method.rail}`
        };
    }

    // Update the payment method if verification was successful
    if (result.success && result.verified) {
      const { error: updateError } = await supabase
        .from('withdrawal_methods')
        .update({
          is_verified: true,
          metadata: {
            ...method.metadata,
            verification_details: result.details,
            verified_at: new Date().toISOString()
          }
        })
        .eq('id', methodId);

      if (updateError) {
        console.error('Error updating verification status:', updateError);
        return {
          success: false,
          verified: false,
          error: 'Failed to update verification status'
        };
      }
    }

    return result;
  } catch (error) {
    console.error('Payment method verification error:', error);
    return {
      success: false,
      verified: false,
      error: error instanceof Error ? error.message : 'Verification failed'
    };
  }
}