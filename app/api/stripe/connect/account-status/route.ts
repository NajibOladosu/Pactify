import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ensureUserProfile } from '@/utils/profile-helpers';

export async function GET(request: NextRequest) {
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
    if (!profile.stripe_connect_account_id) {
      return NextResponse.json({ 
        connected: false,
        account: null,
        kyc: null,
      });
    }

    // Create Stripe instance
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-06-20',
    });
    
    const account = await stripe.accounts.retrieve(profile.stripe_connect_account_id);

    // Get KYC verification status
    const { data: kycData } = await supabase
      .from('kyc_verifications')
      .select('*')
      .eq('profile_id', user.id)
      .single();

    // Update profile with latest account status
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        stripe_connect_charges_enabled: account.charges_enabled,
        stripe_connect_payouts_enabled: account.payouts_enabled,
        stripe_connect_onboarded: account.details_submitted,
        kyc_verified: account.charges_enabled && account.payouts_enabled,
        kyc_verification_date: account.charges_enabled && account.payouts_enabled ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating profile:', updateError);
    }

    // Update KYC verification status
    let kycStatus = 'not_started';
    if (account.charges_enabled && account.payouts_enabled) {
      kycStatus = 'approved';
    } else if (account.details_submitted) {
      kycStatus = 'pending_review';
    } else if (kycData?.status === 'in_progress') {
      kycStatus = 'in_progress';
    }

    const { error: kycUpdateError } = await supabase
      .from('kyc_verifications')
      .update({
        status: kycStatus,
        approved_at: kycStatus === 'approved' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('profile_id', user.id);

    if (kycUpdateError) {
      console.error('Error updating KYC verification:', kycUpdateError);
    }

    return NextResponse.json({
      connected: true,
      account: {
        id: account.id,
        type: account.type,
        country: account.country,
        business_type: account.business_type,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        currently_due: account.requirements?.currently_due || [],
        eventually_due: account.requirements?.eventually_due || [],
        past_due: account.requirements?.past_due || [],
      },
      kyc: {
        status: kycStatus,
        verified: account.charges_enabled && account.payouts_enabled,
        verification_date: account.charges_enabled && account.payouts_enabled ? new Date().toISOString() : null,
      },
    });

  } catch (error) {
    console.error('Stripe Connect account status error:', error);
    return NextResponse.json({ 
      error: 'Failed to get account status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}