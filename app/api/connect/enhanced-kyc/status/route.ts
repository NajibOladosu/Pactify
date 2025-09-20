import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-07-30.basil',
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's connected account with enhanced KYC info
    const { data: connectedAccount, error: accountError } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (accountError || !connectedAccount) {
      return NextResponse.json({ 
        hasEnhancedKYC: false,
        status: 'no_connected_account',
        message: 'No connected account found'
      });
    }

    // Get the latest identity verification session if exists
    let latestSession = null;
    if (connectedAccount.identity_verification_session_id) {
      const { data: session } = await supabase
        .from('identity_verification_sessions')
        .select('*')
        .eq('stripe_session_id', connectedAccount.identity_verification_session_id)
        .single();
      
      latestSession = session;
    }

    // If we have a session ID, fetch latest status from Stripe
    let stripeVerificationSession = null;
    if (connectedAccount.identity_verification_session_id) {
      try {
        stripeVerificationSession = await stripe.identity.verificationSessions.retrieve(
          connectedAccount.identity_verification_session_id
        );
        
        // Update our database with the latest status if it changed
        if (latestSession && stripeVerificationSession.status !== latestSession.status) {
          await supabase
            .from('identity_verification_sessions')
            .update({
              status: stripeVerificationSession.status,
              verification_report: stripeVerificationSession.last_verification_report || null
            })
            .eq('stripe_session_id', stripeVerificationSession.id);
          
          // Update connected account status based on verification result
          let newEnhancedStatus = connectedAccount.enhanced_kyc_status;
          let documentsVerified = connectedAccount.documents_verified;
          let completedAt = connectedAccount.enhanced_kyc_completed_at;
          
          if (stripeVerificationSession.status === 'verified') {
            newEnhancedStatus = 'verified';
            documentsVerified = true;
            completedAt = new Date().toISOString();
          } else if (stripeVerificationSession.status === 'processing') {
            newEnhancedStatus = 'under_review';
          } else if (stripeVerificationSession.status === 'requires_input') {
            newEnhancedStatus = 'documents_submitted';
          }
          
          await supabase
            .from('connected_accounts')
            .update({
              enhanced_kyc_status: newEnhancedStatus,
              documents_verified: documentsVerified,
              enhanced_kyc_completed_at: completedAt,
              verification_report: stripeVerificationSession.last_verification_report || null
            })
            .eq('id', connectedAccount.id);
          
          connectedAccount.enhanced_kyc_status = newEnhancedStatus;
          connectedAccount.documents_verified = documentsVerified;
          connectedAccount.enhanced_kyc_completed_at = completedAt;
        }
      } catch (stripeError) {
        console.error('Error fetching Stripe verification session:', stripeError);
      }
    }

    // Determine status message
    let statusMessage = '';
    switch (connectedAccount.enhanced_kyc_status) {
      case 'not_started':
        statusMessage = 'Enhanced verification not started';
        break;
      case 'verification_session_created':
        statusMessage = 'Verification session created - please complete document upload';
        break;
      case 'documents_submitted':
        statusMessage = 'Documents submitted - verification in progress';
        break;
      case 'under_review':
        statusMessage = 'Documents under review by Stripe';
        break;
      case 'verified':
        statusMessage = 'Identity documents successfully verified';
        break;
      case 'failed':
        statusMessage = 'Verification failed - please try again';
        break;
      default:
        statusMessage = 'Unknown verification status';
    }

    return NextResponse.json({
      hasEnhancedKYC: connectedAccount.enhanced_kyc_status === 'verified',
      status: connectedAccount.enhanced_kyc_status,
      message: statusMessage,
      documentsVerified: connectedAccount.documents_verified,
      completedAt: connectedAccount.enhanced_kyc_completed_at,
      lastAttempt: connectedAccount.last_verification_attempt,
      hasBasicKYC: connectedAccount.details_submitted,
      canStartEnhancedKYC: connectedAccount.details_submitted && 
                          connectedAccount.enhanced_kyc_status !== 'verified',
      session: latestSession ? {
        id: latestSession.stripe_session_id,
        status: stripeVerificationSession?.status || latestSession.status,
        expiresAt: latestSession.expires_at
      } : null
    });

  } catch (error) {
    console.error('Error fetching enhanced KYC status:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}