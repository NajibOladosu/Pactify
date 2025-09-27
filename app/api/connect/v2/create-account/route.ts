import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ensureUserProfile } from '@/utils/profile-helpers';
import { validateRequestBody } from '@/utils/security/validation';
import { z } from 'zod';
import { headers } from 'next/headers';

// Input validation schema
const createAccountSchema = z.object({
  country: z.string().min(2).max(2).default('US'),
  business_type: z.enum(['individual', 'company']).default('individual'),
  tos_acceptance: z.object({
    date: z.number().optional(),
    ip: z.string().ip().optional(),
    user_agent: z.string().optional(),
  }).optional(),
});

// Rate limiting: 1 account creation per user per 24 hours
const ACCOUNT_CREATION_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const headersList = await headers();
    const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure user profile exists and get current status
    const profile = await ensureUserProfile(user.id);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Check if user already has a Stripe account
    if (profile.stripe_account_id) {
      return NextResponse.json({ 
        error: 'User already has a connected account',
        accountId: profile.stripe_account_id,
        status: profile.identity_status
      }, { status: 400 });
    }

    // Rate limiting check - prevent multiple account creation attempts
    const { data: recentAttempts } = await supabase
      .from('withdrawal_security_logs')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('event_type', 'attempt')
      .gte('created_at', new Date(Date.now() - ACCOUNT_CREATION_COOLDOWN).toISOString())
      .order('created_at', { ascending: false });

    if (recentAttempts && recentAttempts.length > 0) {
      return NextResponse.json({ 
        error: 'Account creation attempted too recently. Please wait 24 hours.',
        retry_after: ACCOUNT_CREATION_COOLDOWN
      }, { status: 429 });
    }

    // Validate request body
    const body = await request.json();
    const validatedData = validateRequestBody(createAccountSchema, body);

    // Log security event
    await supabase.from('withdrawal_security_logs').insert({
      user_id: user.id,
      event_type: 'attempt',
      ip_address: ip,
      user_agent: userAgent,
      metadata: {
        action: 'create_connect_account',
        country: validatedData.country,
        business_type: validatedData.business_type
      }
    });

    // Create Stripe instance
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-07-30.basil',
    });
    
    // Create Express Connect account with enhanced settings
    const account = await stripe.accounts.create({
      type: 'express',
      country: validatedData.country,
      email: user.email,
      capabilities: {
        transfers: { requested: true },
        // Enable other capabilities as needed
      },
      business_type: validatedData.business_type,
      tos_acceptance: validatedData.tos_acceptance || {
        date: Math.floor(Date.now() / 1000),
        ip: ip,
        user_agent: userAgent,
      },
      metadata: {
        platform_user_id: user.id,
        user_email: user.email || '',
        account_purpose: 'freelancer_escrow',
        created_at: new Date().toISOString(),
        ip_address: ip,
        user_agent: userAgent,
      },
      settings: {
        payouts: {
          schedule: {
            interval: 'manual', // Manual payouts for better control
          },
        },
      },
    });

    // Update profile with Stripe account information
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({
        stripe_account_id: account.id,
        stripe_account_type: 'express',
        identity_status: 'pending',
        last_kyc_check_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (profileUpdateError) {
      console.error('Error updating profile with Stripe account:', profileUpdateError);
      
      // Clean up the Stripe account if database update failed
      try {
        await stripe.accounts.del(account.id);
      } catch (cleanupError) {
        console.error('Failed to cleanup Stripe account:', cleanupError);
      }
      
      return NextResponse.json({ 
        error: 'Failed to save account information',
        details: profileUpdateError.message 
      }, { status: 500 });
    }

    const baseUrl = new URL(request.url).origin;

    // Create account onboarding link
    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${baseUrl}/dashboard/kyc/onboarding/refresh`,
      return_url: `${baseUrl}/dashboard/kyc/onboarding/complete`,
      type: 'account_onboarding',
      collect: 'eventually_due', // Collect all required information
    });

    // Store onboarding session
    const { error: sessionError } = await supabase
      .from('onboarding_sessions')
      .insert({
        user_id: user.id,
        connected_account_id: account.id, // Store Stripe account ID directly
        session_url: link.url,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        flow_type: 'onboarding',
        return_url: `${baseUrl}/dashboard/kyc/onboarding/complete`,
        refresh_url: `${baseUrl}/dashboard/kyc/onboarding/refresh`,
        status: 'active',
      });

    if (sessionError) {
      console.error('Error creating onboarding session:', sessionError);
      // Don't fail the request, just log the error
    }

    // Log successful creation
    await supabase.from('withdrawal_security_logs').insert({
      user_id: user.id,
      event_type: 'success',
      ip_address: ip,
      user_agent: userAgent,
      metadata: {
        action: 'create_connect_account',
        stripe_account_id: account.id,
        country: validatedData.country,
        business_type: validatedData.business_type
      }
    });

    return NextResponse.json({
      success: true,
      accountId: account.id,
      onboardingUrl: link.url,
      account: {
        id: account.id,
        type: account.type,
        country: account.country,
        business_type: account.business_type,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        capabilities: account.capabilities,
        requirements: account.requirements,
      },
      next_steps: [
        'Complete Stripe onboarding',
        'Verify identity with Stripe Identity',
        'Add payout method',
      ],
    });

  } catch (error) {
    console.error('Stripe Connect account creation error:', error);
    
    // Log the error
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('withdrawal_security_logs').insert({
          user_id: user.id,
          event_type: 'failure',
          metadata: {
            action: 'create_connect_account',
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    return NextResponse.json({ 
      error: 'Failed to create Stripe Connect account',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET endpoint to check account status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile with Stripe account info
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_account_id, stripe_account_type, identity_status, withdrawal_hold_until')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (!profile.stripe_account_id) {
      return NextResponse.json({
        has_account: false,
        identity_status: 'unstarted',
        next_steps: ['Create Stripe Connect account'],
      });
    }

    // Get account details from Stripe
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-07-30.basil',
    });

    const account = await stripe.accounts.retrieve(profile.stripe_account_id);
    
    // Determine if account is ready for withdrawals
    const isReady = account.payouts_enabled && 
                   profile.identity_status === 'verified' &&
                   (!profile.withdrawal_hold_until || new Date(profile.withdrawal_hold_until) <= new Date());

    return NextResponse.json({
      has_account: true,
      account_id: account.id,
      account_type: profile.stripe_account_type,
      identity_status: profile.identity_status,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      requirements: account.requirements,
      withdrawal_ready: isReady,
      withdrawal_hold_until: profile.withdrawal_hold_until,
      capabilities: account.capabilities,
    });

  } catch (error) {
    console.error('Account status check error:', error);
    return NextResponse.json({ 
      error: 'Failed to check account status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}