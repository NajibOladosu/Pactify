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

    // Get user's connected account
    const { data: connectedAccount, error: accountError } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (accountError || !connectedAccount) {
      return NextResponse.json({
        error: 'No connected account found. Please complete account verification first.'
      }, { status: 400 });
    }

    console.log('Fetching external accounts for Stripe account:', connectedAccount.stripe_account_id);

    // Get external accounts from Stripe
    const externalAccounts = await stripe.accounts.listExternalAccounts(
      connectedAccount.stripe_account_id,
      {
        object: 'bank_account',
        limit: 10,
      }
    );

    // Get debit cards for instant payouts
    const debitCards = await stripe.accounts.listExternalAccounts(
      connectedAccount.stripe_account_id,
      {
        object: 'card',
        limit: 10,
      }
    );

    // Get account balance to check instant payout eligibility
    const balance = await stripe.balance.retrieve({
      stripeAccount: connectedAccount.stripe_account_id,
    });

    // Format external accounts for frontend with Deel-like information
    const formattedAccounts = [
      ...externalAccounts.data.map((account: any) => ({
        id: account.id,
        type: 'bank_account' as const,
        object: account.object,
        account_holder_type: account.account_holder_type,
        bank_name: account.bank_name,
        country: account.country,
        currency: account.currency,
        fingerprint: account.fingerprint,
        last4: account.last4,
        routing_number: account.routing_number?.slice(-4) || 'N/A',
        status: account.status,
        default_for_currency: account.default_for_currency,
        // Deel-inspired payout options
        supports_standard_payouts: true,
        supports_instant_payouts: false, // Most bank accounts don't support instant
        provider: account.bank_name || 'Bank Transfer',
        display_name: `${account.bank_name || 'Bank Transfer'} •••• ${account.last4}`,
        description: 'Bank Transfer',
        processing_time: account.country === 'US' ? '1-3 business days' : '1-5 business days',
        fee: account.country === 'US' ? 'Free' : '$1.50',
        fee_amount: account.country === 'US' ? 0 : 1.50, // Actual fee amount for calculations
        icon: '🏦',
      })),
      ...debitCards.data.map((card: any) => ({
        id: card.id,
        type: 'card' as const,
        object: card.object,
        brand: card.brand,
        country: card.country,
        currency: card.currency,
        fingerprint: card.fingerprint,
        last4: card.last4,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
        default_for_currency: card.default_for_currency,
        // Deel-inspired payout options
        supports_standard_payouts: false,
        supports_instant_payouts: true,
        provider: card.brand?.toUpperCase() || 'Debit Card',
        display_name: `${card.brand?.toUpperCase() || 'Debit Card'} •••• ${card.last4}`,
        description: 'Instant Card Transfer',
        processing_time: 'Within 30 minutes',
        fee: '$1.50',
        fee_amount: 1.50, // Actual fee amount for instant card transfers
        icon: card.brand?.toLowerCase() === 'visa' ? '💳' : card.brand?.toLowerCase() === 'mastercard' ? '💳' : '💳',
      })),
    ];

    return NextResponse.json({
      success: true,
      external_accounts: formattedAccounts,
      balance_info: {
        available: balance.available,
        pending: balance.pending,
        instant_available: balance.instant_available || [],
      },
      account_id: connectedAccount.stripe_account_id,
      total_accounts: formattedAccounts.length,
    });

  } catch (error) {
    console.error('Error fetching external accounts:', error);
    
    // Handle specific Stripe errors
    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json({
        error: 'Unable to fetch payout methods',
        details: error.message
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}