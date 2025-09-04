import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ensureUserProfile } from '@/utils/profile-helpers';

export async function GET(_request: NextRequest) {
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
        hasAccount: false,
        status: 'not_created',
        message: 'No connected account found'
      });
    }

    // Create Stripe instance
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-07-30.basil',
    });

    // Fetch latest account info from Stripe
    const stripeAccount = await stripe.accounts.retrieve(connectedAccount.stripe_account_id);

    // Update local database with fresh data
    const updateData = {
      cap_transfers: stripeAccount.capabilities?.transfers || 'inactive',
      cap_card_payments: stripeAccount.capabilities?.card_payments || 'inactive',
      payouts_enabled: stripeAccount.payouts_enabled,
      charges_enabled: stripeAccount.charges_enabled,
      details_submitted: stripeAccount.details_submitted,
      requirements_currently_due: stripeAccount.requirements?.currently_due || [],
      requirements_past_due: stripeAccount.requirements?.past_due || [],
      requirements_eventually_due: stripeAccount.requirements?.eventually_due || [],
      requirements_disabled_reason: stripeAccount.requirements?.disabled_reason,
      tos_acceptance: stripeAccount.tos_acceptance || null,
      updated_at: new Date().toISOString(),
    };

    // If account is fully set up, mark onboarding as completed
    if (stripeAccount.details_submitted && !connectedAccount.onboarding_completed_at) {
      (updateData as any).onboarding_completed_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('connected_accounts')
      .update(updateData)
      .eq('id', connectedAccount.id);

    if (updateError) {
      console.error('Error updating connected account:', updateError);
    }

    // Determine overall status
    const transfersActive = stripeAccount.capabilities?.transfers === 'active';
    const payoutsEnabled = Boolean(stripeAccount.payouts_enabled);
    const currentlyDue = stripeAccount.requirements?.currently_due || [];
    const pastDue = stripeAccount.requirements?.past_due || [];

    let status = 'pending';
    let message = 'Account verification in progress';

    if (transfersActive && payoutsEnabled && currentlyDue.length === 0 && pastDue.length === 0) {
      status = 'verified';
      message = 'Account fully verified and ready for payouts';
    } else if (pastDue.length > 0) {
      status = 'action_required';
      message = 'Account has past due requirements that need immediate attention';
    } else if (currentlyDue.length > 0) {
      status = 'action_required';
      message = 'Account has requirements that need to be completed';
    } else if (!stripeAccount.details_submitted) {
      status = 'onboarding_required';
      message = 'Account onboarding needs to be completed';
    }

    return NextResponse.json({
      success: true,
      hasAccount: true,
      status,
      message,
      account: {
        id: stripeAccount.id,
        type: stripeAccount.type,
        country: stripeAccount.country,
        business_type: stripeAccount.business_type,
        charges_enabled: stripeAccount.charges_enabled,
        payouts_enabled: stripeAccount.payouts_enabled,
        details_submitted: stripeAccount.details_submitted,
        capabilities: {
          transfers: stripeAccount.capabilities?.transfers,
          card_payments: stripeAccount.capabilities?.card_payments,
        },
        requirements: {
          currently_due: currentlyDue,
          past_due: pastDue,
          eventually_due: stripeAccount.requirements?.eventually_due || [],
          disabled_reason: stripeAccount.requirements?.disabled_reason,
        },
        verification_status: {
          is_verified: transfersActive && payoutsEnabled,
          can_receive_payouts: transfersActive && payoutsEnabled && currentlyDue.length === 0,
          missing_requirements: currentlyDue,
          onboarding_completed: Boolean(connectedAccount.onboarding_completed_at),
        }
      }
    });

  } catch (error) {
    console.error('Account status check error:', error);
    return NextResponse.json({ 
      error: 'Failed to check account status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}