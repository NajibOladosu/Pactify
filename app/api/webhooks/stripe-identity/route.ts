import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

if (!process.env.STRIPE_WEBHOOK_SECRET) {
  throw new Error('STRIPE_WEBHOOK_SECRET is not set');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-07-30.basil',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    console.error('No Stripe signature found');
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ 
      error: 'Webhook signature verification failed' 
    }, { status: 400 });
  }

  console.log('Received Stripe Identity webhook event:', event.type, event.id);

  try {
    const supabase = await createClient();

    switch (event.type) {
      case 'identity.verification_session.verified':
      case 'identity.verification_session.requires_input':
      case 'identity.verification_session.canceled':
      case 'identity.verification_session.processing':
        await handleVerificationSessionUpdate(supabase, event);
        break;
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ 
      error: 'Webhook processing failed' 
    }, { status: 500 });
  }
}

async function handleVerificationSessionUpdate(
  supabase: any, 
  event: Stripe.Event
) {
  const verificationSession = event.data.object as Stripe.Identity.VerificationSession;
  
  console.log('Processing verification session update:', {
    session_id: verificationSession.id,
    status: verificationSession.status,
    user_id: verificationSession.metadata?.user_id,
    connected_account_id: verificationSession.metadata?.connected_account_id
  });

  // Update identity verification session in database
  const { error: sessionUpdateError } = await supabase
    .from('identity_verification_sessions')
    .update({
      status: verificationSession.status,
      verification_report: verificationSession.last_verification_report || null,
      failure_reason: verificationSession.last_error?.reason || null
    })
    .eq('stripe_session_id', verificationSession.id);

  if (sessionUpdateError) {
    console.error('Error updating identity verification session:', sessionUpdateError);
    throw sessionUpdateError;
  }

  // Update connected account based on verification result
  const userId = verificationSession.metadata?.user_id;
  const connectedAccountId = verificationSession.metadata?.connected_account_id;

  if (!userId || !connectedAccountId) {
    console.error('Missing user_id or connected_account_id in verification session metadata');
    return;
  }

  let enhancedKycStatus = 'verification_session_created';
  let documentsVerified = false;
  let completedAt = null;

  switch (verificationSession.status) {
    case 'verified':
      enhancedKycStatus = 'verified';
      documentsVerified = true;
      completedAt = new Date().toISOString();
      break;
    case 'processing':
      enhancedKycStatus = 'under_review';
      break;
    case 'requires_input':
      enhancedKycStatus = 'documents_submitted';
      break;
    case 'canceled':
      enhancedKycStatus = 'failed';
      break;
    default:
      console.log(`Unhandled verification session status: ${verificationSession.status}`);
  }

  // Update connected account
  const { error: accountUpdateError } = await supabase
    .from('connected_accounts')
    .update({
      enhanced_kyc_status: enhancedKycStatus,
      documents_verified: documentsVerified,
      enhanced_kyc_completed_at: completedAt,
      verification_report: verificationSession.last_verification_report || null,
      identity_verification_session_id: verificationSession.id
    })
    .eq('id', connectedAccountId)
    .eq('user_id', userId); // Extra safety check

  if (accountUpdateError) {
    console.error('Error updating connected account:', accountUpdateError);
    throw accountUpdateError;
  }

  console.log('Successfully processed verification session update:', {
    session_id: verificationSession.id,
    new_status: enhancedKycStatus,
    documents_verified: documentsVerified,
    user_id: userId
  });

  // TODO: Send notification email to user about verification status
  // This could be added later for better UX
  if (verificationSession.status === 'verified') {
    console.log(`Enhanced KYC verified for user ${userId}`);
    // sendVerificationSuccessEmail(userId);
  } else if (verificationSession.status === 'canceled') {
    console.log(`Enhanced KYC failed for user ${userId}`);
    // sendVerificationFailedEmail(userId);
  }
}