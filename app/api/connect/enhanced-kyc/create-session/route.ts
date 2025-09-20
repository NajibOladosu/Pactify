import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-07-30.basil',
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { return_url } = body;

    // Get user's connected account
    const { data: connectedAccount, error: accountError } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (accountError || !connectedAccount) {
      return NextResponse.json({ 
        error: 'No connected account found. Please set up basic KYC first.' 
      }, { status: 400 });
    }

    // Check if basic KYC is completed
    if (!connectedAccount.details_submitted) {
      return NextResponse.json({ 
        error: 'Basic KYC verification must be completed before enhanced verification.' 
      }, { status: 400 });
    }

    // Check if enhanced KYC is already verified
    if (connectedAccount.enhanced_kyc_status === 'verified') {
      return NextResponse.json({ 
        error: 'Enhanced KYC is already verified.' 
      }, { status: 400 });
    }

    // Create Stripe Identity Verification Session
    const verificationSession = await stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: {
        user_id: user.id,
        connected_account_id: connectedAccount.id,
        purpose: 'enhanced_kyc'
      },
      return_url: return_url || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?tab=verification&enhanced_kyc=complete`,
      options: {
        document: {
          allowed_types: ['driving_license', 'passport', 'id_card'],
          require_id_number: true,
          require_live_capture: true,
          require_matching_selfie: true,
        }
      }
    });

    // Store verification session in database
    const { data: identitySession, error: sessionError } = await supabase
      .from('identity_verification_sessions')
      .insert({
        user_id: user.id,
        connected_account_id: connectedAccount.id,
        stripe_session_id: verificationSession.id,
        status: verificationSession.status,
        redirect_url: return_url,
        expires_at: verificationSession.expires_at ? new Date(verificationSession.expires_at * 1000).toISOString() : null
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Error creating identity session record:', sessionError);
      
      // Clean up Stripe session if database insert failed
      try {
        await stripe.identity.verificationSessions.cancel(verificationSession.id);
      } catch (cleanupError) {
        console.error('Failed to cleanup Stripe verification session:', cleanupError);
      }
      
      return NextResponse.json({ 
        error: 'Failed to create verification session record',
        details: sessionError.message 
      }, { status: 500 });
    }

    // Update connected account with session info
    const { error: updateError } = await supabase
      .from('connected_accounts')
      .update({
        enhanced_kyc_status: 'verification_session_created',
        identity_verification_session_id: verificationSession.id,
        last_verification_attempt: new Date().toISOString()
      })
      .eq('id', connectedAccount.id);

    if (updateError) {
      console.error('Error updating connected account:', updateError);
    }

    return NextResponse.json({
      success: true,
      verification_url: verificationSession.url,
      session_id: verificationSession.id,
      expires_at: verificationSession.expires_at
    });

  } catch (error) {
    console.error('Error creating enhanced KYC session:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}