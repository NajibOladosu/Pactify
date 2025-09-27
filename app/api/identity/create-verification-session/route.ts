import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ensureUserProfile } from '@/utils/profile-helpers';
import { validateRequestBody } from '@/utils/security/validation';
import { z } from 'zod';

// Input validation schema
const createSessionSchema = z.object({
  type: z.enum(['document', 'id_number']).default('document'),
  return_url: z.string().url().optional(),
});

// Rate limiting: 3 verification attempts per hour
const VERIFICATION_RATE_LIMIT = 3;
const VERIFICATION_WINDOW = 60 * 60 * 1000; // 1 hour

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure user profile exists
    const profile = await ensureUserProfile(user.id);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Check if user has a Stripe Connect account
    if (!profile.stripe_account_id) {
      return NextResponse.json({ 
        error: 'No Stripe Connect account found. Please create one first.' 
      }, { status: 400 });
    }

    // Check if already verified
    if (profile.identity_status === 'verified') {
      return NextResponse.json({ 
        error: 'Identity already verified',
        status: 'verified'
      }, { status: 400 });
    }

    // Rate limiting check
    const { data: recentAttempts } = await supabase
      .from('identity_verification_sessions')
      .select('created_at')
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - VERIFICATION_WINDOW).toISOString())
      .order('created_at', { ascending: false });

    if (recentAttempts && recentAttempts.length >= VERIFICATION_RATE_LIMIT) {
      return NextResponse.json({ 
        error: 'Too many verification attempts. Please wait before trying again.',
        retry_after: VERIFICATION_WINDOW
      }, { status: 429 });
    }

    // Validate request body
    const body = await request.json();
    const validatedData = validateRequestBody(createSessionSchema, body);

    // Create Stripe instance
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-07-30.basil',
    });

    const baseUrl = new URL(request.url).origin;
    const returnUrl = validatedData.return_url || `${baseUrl}/dashboard/kyc/identity/complete`;

    // Create Stripe Identity verification session
    const session = await stripe.identity.verificationSessions.create({
      type: validatedData.type,
      metadata: {
        user_id: user.id,
        stripe_account_id: profile.stripe_account_id,
        platform: 'pactify',
      },
      return_url: returnUrl,
      // Options for document verification
      ...(validatedData.type === 'document' && {
        options: {
          document: {
            allowed_types: ['driving_license', 'passport', 'id_card'],
            require_id_number: true,
            require_live_capture: true,
            require_matching_selfie: true,
          },
        },
      }),
    });

    // Store verification session in database
    const { data: verificationSession, error: sessionError } = await supabase
      .from('identity_verification_sessions')
      .insert({
        user_id: user.id,
        stripe_session_id: session.id,
        session_type: validatedData.type,
        status: session.status,
        client_secret: session.client_secret,
        return_url: returnUrl,
        metadata: {
          stripe_account_id: profile.stripe_account_id,
          created_from_ip: request.headers.get('x-forwarded-for') || 'unknown',
          user_agent: request.headers.get('user-agent') || 'unknown',
        },
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Error storing verification session:', sessionError);
      return NextResponse.json({ 
        error: 'Failed to store verification session',
        details: sessionError.message 
      }, { status: 500 });
    }

    // Update profile status to pending
    await supabase
      .from('profiles')
      .update({ 
        identity_status: 'pending',
        identity_verification_session_id: session.id,
        last_kyc_check_at: new Date().toISOString()
      })
      .eq('id', user.id);

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        client_secret: session.client_secret,
        status: session.status,
        type: session.type,
        url: session.url,
        return_url: returnUrl,
      },
      next_steps: [
        'Complete identity verification',
        'Upload required documents',
        'Take selfie for verification',
      ],
    });

  } catch (error) {
    console.error('Identity verification session creation error:', error);
    return NextResponse.json({ 
      error: 'Failed to create identity verification session',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET endpoint to check verification status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile with identity info
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('identity_status, identity_verification_session_id, last_kyc_check_at')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Get latest verification session
    const { data: latestSession } = await supabase
      .from('identity_verification_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let stripeSessionStatus = null;
    if (profile.identity_verification_session_id) {
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
          apiVersion: '2025-07-30.basil',
        });

        const session = await stripe.identity.verificationSessions.retrieve(
          profile.identity_verification_session_id
        );
        stripeSessionStatus = {
          id: session.id,
          status: session.status,
          type: session.type,
          last_error: session.last_error,
          verified_outputs: session.verified_outputs,
        };
      } catch (stripeError) {
        console.error('Error fetching Stripe session:', stripeError);
      }
    }

    return NextResponse.json({
      identity_status: profile.identity_status,
      verification_session_id: profile.identity_verification_session_id,
      last_kyc_check: profile.last_kyc_check_at,
      latest_session: latestSession,
      stripe_session: stripeSessionStatus,
      can_create_new_session: profile.identity_status !== 'verified' && 
                             (!latestSession || latestSession.status === 'failed'),
    });

  } catch (error) {
    console.error('Identity verification status check error:', error);
    return NextResponse.json({ 
      error: 'Failed to check verification status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}