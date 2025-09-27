import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
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

    // Create service role client for database operations that need to bypass RLS
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );
    
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

    if (!destination) {
      return NextResponse.json({ error: 'Destination account required' }, { status: 400 });
    }

    console.log('Fetching connected account for user:', user.id);
    
    // Get user's connected account
    const { data: connectedAccount, error: accountError } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single();

    console.log('Connected account result:', { connectedAccount: !!connectedAccount, accountError });

    if (accountError || !connectedAccount) {
      console.error('Connected account error:', accountError);
      return NextResponse.json({ 
        error: 'No connected account found. Please complete account verification first.',
        details: accountError?.message
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

    // Calculate available balance the same way as payments page - from released payments
    console.log('Calculating available balance from released payments...');
    
    // Get released payments where user is the payee (freelancer receiving payment)
    const { data: releasedPayments, error: paymentsError } = await supabase
      .from("payments")
      .select("*")
      .eq("payee_id", user.id)
      .eq("status", "released");
    
    console.log('Released payments found:', releasedPayments?.length || 0);
    
    if (paymentsError) {
      console.error('Error fetching payments for balance calculation:', paymentsError);
      return NextResponse.json({ 
        error: 'Unable to calculate payment balance. Please try again.',
        details: paymentsError.message
      }, { status: 500 });
    }
    
    // Calculate total from released payments
    const totalFromPayments = releasedPayments?.reduce((sum: number, payment: any) => {
      return sum + (parseFloat(payment.net_amount) || parseFloat(payment.amount) || 0);
    }, 0) || 0;
    
    // Get existing withdrawals to subtract from balance
    const { data: existingWithdrawals, error: withdrawalsError } = await supabase
      .from("withdrawals")
      .select("amount, status")
      .eq("user_id", user.id)
      .in("status", ["processing", "paid"]);
    
    const totalWithdrawn = existingWithdrawals?.reduce((sum: number, withdrawal: any) => {
      return sum + (parseFloat(withdrawal.amount) || 0);
    }, 0) || 0;
    
    const availableBalance = Math.max(0, totalFromPayments - totalWithdrawn);

    console.log('Available balance calculation:', { 
      totalFromPayments, 
      totalWithdrawn, 
      availableBalance, 
      requestedAmount: amount 
    });

    // Get external account details to determine the fee
    const externalAccounts = await stripe.accounts.listExternalAccounts(
      connectedAccount.stripe_account_id,
      { limit: 100 }
    );

    // Find the selected external account
    const selectedAccount = externalAccounts.data.find(account => account.id === destination);

    if (!selectedAccount) {
      return NextResponse.json({
        error: 'Selected payout method not found'
      }, { status: 400 });
    }

    // Calculate withdrawal fee based on account type and location
    let withdrawalFee = 0;
    if (selectedAccount.object === 'bank_account') {
      // Bank account fees
      withdrawalFee = selectedAccount.country === 'US' ? 0 : 1.50;
    } else if (selectedAccount.object === 'card') {
      // Card fees (instant payouts)
      withdrawalFee = 1.50;
    }

    const totalDeduction = amount + withdrawalFee;

    if (availableBalance < totalDeduction) {
      console.log('Insufficient balance for withdrawal including fees');
      return NextResponse.json({
        error: `Insufficient balance. Available: $${availableBalance.toFixed(2)}, Required: $${totalDeduction.toFixed(2)} (including $${withdrawalFee.toFixed(2)} fee)`
      }, { status: 400 });
    }

    console.log('Creating Connect transfer and payout flow...');

    let transfer, payout;
    try {
      // Step 1: Transfer funds from platform account to connected account
      console.log('Step 1: Transferring funds to connected account...');
      transfer = await stripe.transfers.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        destination: connectedAccount.stripe_account_id,
        description: `Platform withdrawal for user ${user.id}`,
        metadata: {
          user_id: user.id,
          withdrawal_amount: amount.toString(),
          fee_amount: withdrawalFee.toString(),
          withdrawal_type: 'user_requested'
        }
      });

      console.log('Transfer created:', transfer.id);

      // Step 2: Create payout from connected account to external account
      console.log('Step 2: Creating payout to external account...');
      payout = await stripe.payouts.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        destination: destination,
        method: method === 'instant' ? 'instant' : 'standard',
        description: `User withdrawal to ${selectedAccount.object}`,
        metadata: {
          user_id: user.id,
          transfer_id: transfer.id,
          withdrawal_amount: amount.toString(),
          fee_amount: withdrawalFee.toString()
        }
      }, {
        stripeAccount: connectedAccount.stripe_account_id
      });

      console.log('Payout created:', payout.id);
    } catch (stripeError) {
      console.error('Connect withdrawal flow failed:', stripeError);
      return NextResponse.json({
        error: 'Failed to process withdrawal through Stripe Connect',
        details: stripeError instanceof Error ? stripeError.message : 'Unknown Stripe error'
      }, { status: 500 });
    }

    console.log('Recording withdrawal in database...');
    
    // Record the withdrawal in our database using service role client to bypass RLS
    const { data: withdrawal, error: withdrawalError } = await serviceSupabase
      .from('withdrawals')
      .insert({
        user_id: user.id,
        connected_account_id: connectedAccount?.id,
        stripe_payout_id: payout.id,
        amount: amount,
        currency: 'USD',
        status: 'processing',
        expected_arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : null,
      })
      .select()
      .single();

    // Also record the withdrawal fee as a separate transaction
    if (withdrawal && withdrawalFee > 0) {
      await serviceSupabase
        .from('withdrawals')
        .insert({
          user_id: user.id,
          connected_account_id: connectedAccount?.id,
          stripe_payout_id: `${payout.id}_fee`,
          amount: withdrawalFee,
          currency: 'USD',
          status: 'processing',
          expected_arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : null,
        });
    }

    console.log('Withdrawal database result:', { withdrawal, withdrawalError });

    if (withdrawalError) {
      console.error('Error recording withdrawal:', withdrawalError);
      // Don't fail the request since Stripe transfer was successful
      
      // Return error to help debug
      return NextResponse.json({
        success: false,
        error: 'Withdrawal processed with Stripe but failed to record in database',
        details: withdrawalError.message,
        stripe_payout_id: payout.id
      }, { status: 500 });
    }

    console.log('Withdrawal created and recorded:', {
      withdrawal_id: withdrawal?.id,
      stripe_payout_id: payout.id,
      amount: amount,
      status: 'processing'
    });

    // Update account stats using service role client (include fee in total withdrawn)
    await serviceSupabase
      .from('connected_accounts')
      .update({
        total_withdrawn: (connectedAccount.total_withdrawn || 0) + totalDeduction,
        last_withdrawal_at: new Date().toISOString(),
      })
      .eq('id', connectedAccount.id);

    return NextResponse.json({
      success: true,
      payout_id: payout.id,
      amount: amount,
      fee: withdrawalFee,
      total_deducted: totalDeduction,
      currency: 'USD',
      status: payout.status,
      arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : null,
      method: payout.method,
      message: withdrawalFee > 0
        ? `Withdrawal of $${amount.toFixed(2)} initiated (fee: $${withdrawalFee.toFixed(2)}). Funds will arrive according to your selected method.`
        : `Withdrawal of $${amount.toFixed(2)} initiated (no fees). Funds will arrive according to your selected method.`
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