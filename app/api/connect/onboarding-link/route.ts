import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ensureUserProfile } from '@/utils/profile-helpers';

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

    // Get user's connected account
    const { data: connectedAccount, error: accountError } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (accountError || !connectedAccount) {
      return NextResponse.json({ 
        error: 'No connected account found. Please create one first.' 
      }, { status: 404 });
    }

    // Create Stripe instance
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-07-30.basil',
    });

    const baseUrl = new URL(request.url).origin;

    // Create new onboarding link
    const link = await stripe.accountLinks.create({
      account: connectedAccount.stripe_account_id,
      refresh_url: `${baseUrl}/dashboard/kyc/onboarding/refresh`,
      return_url: `${baseUrl}/dashboard/kyc/onboarding/complete`,
      type: 'account_onboarding',
    });

    // Update onboarding session
    const { error: sessionError } = await supabase
      .from('onboarding_sessions')
      .upsert({
        user_id: user.id,
        connected_account_id: connectedAccount.id,
        session_url: link.url,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        flow_type: 'onboarding',
        return_url: `${baseUrl}/dashboard/kyc/onboarding/complete`,
        refresh_url: `${baseUrl}/dashboard/kyc/onboarding/refresh`,
        status: 'active',
      }, {
        onConflict: 'user_id'
      });

    if (sessionError) {
      console.error('Error updating onboarding session:', sessionError);
      // Don't fail the request, just log the error
    }

    return NextResponse.json({
      success: true,
      onboardingUrl: link.url,
      accountId: connectedAccount.stripe_account_id,
    });

  } catch (error) {
    console.error('Onboarding link creation error:', error);
    return NextResponse.json({ 
      error: 'Failed to create onboarding link',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}