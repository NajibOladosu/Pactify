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
    const { amount, destination, method = 'standard' } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
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

    // Verify account is eligible for payouts
    if (!connectedAccount.details_submitted || !connectedAccount.payouts_enabled) {
      return NextResponse.json({ 
        error: 'Account verification required. Please complete your account setup first.' 
      }, { status: 400 });
    }

    // Get Stripe account details to verify payout eligibility
    const stripeAccount = await stripe.accounts.retrieve(connectedAccount.stripe_account_id);
    
    if (!stripeAccount.payouts_enabled) {
      return NextResponse.json({ 
        error: 'Payouts are not enabled for your account. Please complete verification or contact support.' 
      }, { status: 400 });
    }

    // Get user's available balance from completed contracts
    // Use the same RPC function as payments API with retry logic
    let contractsFromRPC = null;
    let contractsError = null;
    
    // Try RPC function first
    try {
      const result = await supabase
        .rpc('get_user_contracts', { 
          p_user_id: user.id,
          p_apply_free_tier_limit: false
        });
      contractsFromRPC = result.data;
      contractsError = result.error;
    } catch (rpcError) {
      console.warn('RPC function failed, falling back to direct query:', rpcError);
      
      // Fallback to direct query if RPC fails
      try {
        const { data, error } = await supabase
          .from('contracts')
          .select('*')
          .or(`freelancer_id.eq.${user.id},client_id.eq.${user.id}`);
          
        contractsFromRPC = data;
        contractsError = error;
      } catch (directError) {
        console.error('Both RPC and direct query failed:', directError);
        contractsError = directError;
      }
    }

    if (contractsError) {
      console.error('Error fetching contracts for withdrawal:', contractsError);
      return NextResponse.json({ 
        error: 'Unable to fetch payment balance. Please try again.' 
      }, { status: 500 });
    }

    // Calculate available balance from completed contracts where user is freelancer
    // This matches the logic in payments API
    let availableBalance = 0;
    if (contractsFromRPC && contractsFromRPC.length > 0) {
      availableBalance = contractsFromRPC
        .filter((contract: any) => 
          contract.status === "completed" && 
          contract.freelancer_id === user.id  // User is the freelancer receiving payment
        )
        .reduce((sum: number, contract: any) => {
          const amount = parseFloat(contract.total_amount) || 0;
          const fee = Math.round(amount * 0.05 * 100) / 100;
          const netAmount = amount - fee;
          return sum + netAmount;
        }, 0);
    }

    if (availableBalance < amount) {
      return NextResponse.json({ 
        error: `Insufficient balance. Available: $${availableBalance.toFixed(2)}, Requested: $${amount.toFixed(2)}` 
      }, { status: 400 });
    }

    // First, we need to transfer funds from platform to connected account
    // This represents the actual payment from completed contracts
    try {
      await stripe.transfers.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        destination: connectedAccount.stripe_account_id,
        description: `Pactify contract payment transfer for withdrawal`,
        metadata: {
          user_id: user.id,
          withdrawal_amount: amount.toString(),
          purpose: 'contract_payment_transfer'
        }
      });
    } catch (transferError) {
      console.error('Error transferring funds to connected account:', transferError);
      return NextResponse.json({ 
        error: 'Unable to transfer funds for withdrawal. Please contact support.' 
      }, { status: 500 });
    }

    // Create payout to the connected account's default external account
    // Stripe will automatically send to the user's bank account (local, domiciliary, etc.)
    // that they set up during onboarding
    const payout = await stripe.payouts.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      method: 'standard', // Standard payout (2-7 business days)
      statement_descriptor: 'Pactify Withdrawal',
    }, {
      stripeAccount: connectedAccount.stripe_account_id,
    });

    // Record the withdrawal in our database
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('withdrawals')
      .insert({
        user_id: user.id,
        connected_account_id: connectedAccount.id,
        stripe_payout_id: payout.id,
        amount: amount,
        currency: 'USD',
        status: 'processing',
        expected_arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : null,
      })
      .select()
      .single();

    if (withdrawalError) {
      console.error('Error recording withdrawal:', withdrawalError);
      // Don't fail the request since Stripe transfer was successful
    }

    console.log('Withdrawal created and recorded:', {
      withdrawal_id: withdrawal?.id,
      stripe_payout_id: payout.id,
      amount: amount,
      status: 'processing'
    });

    // Update account stats
    await supabase
      .from('connected_accounts')
      .update({
        total_withdrawn: (connectedAccount.total_withdrawn || 0) + amount,
        last_withdrawal_at: new Date().toISOString(),
      })
      .eq('id', connectedAccount.id);

    return NextResponse.json({
      success: true,
      payout_id: payout.id,
      amount: amount,
      currency: 'USD',
      status: payout.status,
      arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : null,
      method: payout.method,
      message: `Withdrawal of $${amount.toFixed(2)} initiated. Funds will arrive in your account within 2-7 business days.`
    });

  } catch (error) {
    console.error('Error processing withdrawal:', error);
    
    // Handle specific Stripe errors
    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json({
        error: 'Payment processing error',
        details: error.message
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}