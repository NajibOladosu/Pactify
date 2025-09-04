import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ensureUserProfile } from '@/utils/profile-helpers';
import { validateRequestBody } from '@/utils/security/validation';
import { z } from 'zod';

const createAccountSchema = z.object({
  country: z.string().min(2).max(2).default('US'),
  business_type: z.enum(['individual', 'company']).default('individual'),
});

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

    // Check if user already has a connected account
    const { data: existingAccount } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (existingAccount) {
      return NextResponse.json({ 
        error: 'User already has a connected account',
        accountId: existingAccount.stripe_account_id
      }, { status: 400 });
    }

    // Validate request body
    const body = await request.json();
    const validatedData = validateRequestBody(createAccountSchema, body);

    // Create Stripe instance
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-07-30.basil',
    });
    
    // 1) Create account with required capabilities
    const account = await stripe.accounts.create({
      type: 'express',
      country: validatedData.country,
      capabilities: {
        transfers: { requested: true },
        // card_payments: { requested: true }, // if needed
      },
      business_type: validatedData.business_type,
      email: user.email,
      metadata: {
        platform_user_id: user.id,
        user_email: user.email || '',
        account_purpose: 'freelancer_escrow',
        created_at: new Date().toISOString(),
      },
    });

    // persist account.id to connected_accounts
    const { data: connectedAccount, error: insertError } = await supabase
      .from('connected_accounts')
      .insert({
        user_id: user.id,
        stripe_account_id: account.id,
        cap_transfers: 'inactive',
        cap_card_payments: 'inactive',
        payouts_enabled: false,
        charges_enabled: false,
        details_submitted: false,
        country: validatedData.country,
        business_type: validatedData.business_type,
        account_type: 'express',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating connected account record:', {
        error: insertError,
        user_id: user.id,
        stripe_account_id: account.id,
        profile_exists: profile ? true : false
      });
      
      // Clean up the Stripe account if database insert failed
      try {
        await stripe.accounts.del(account.id);
      } catch (cleanupError) {
        console.error('Failed to cleanup Stripe account:', cleanupError);
      }
      
      return NextResponse.json({ 
        error: 'Failed to create connected account record',
        details: insertError.message 
      }, { status: 500 });
    }

    const baseUrl = new URL(request.url).origin;

    // 2) Create onboarding link (hosted)
    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${baseUrl}/dashboard/kyc/onboarding/refresh`,
      return_url: `${baseUrl}/dashboard/kyc/onboarding/complete`,
      type: 'account_onboarding',
    });

    // Store onboarding session
    const { error: sessionError } = await supabase
      .from('onboarding_sessions')
      .insert({
        user_id: user.id,
        connected_account_id: connectedAccount.id,
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
    });

  } catch (error) {
    console.error('Stripe Connect account creation error:', error);
    return NextResponse.json({ 
      error: 'Failed to create Stripe Connect account',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}