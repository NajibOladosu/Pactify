import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ensureUserProfile } from '@/utils/profile-helpers';
import { payoutDecisionEngine } from '@/lib/payout/decision-engine';
import {
  PayoutRequest,
  PayoutError,
  InsufficientBalanceError,
  KYCRequiredError,
  RailSelectionInput
} from '@/lib/payout/types';

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

    const body = await request.json();
    const { method_id, amount, currency = 'USD', urgency = 'standard', description } = body as PayoutRequest;

    if (!method_id || !amount || amount <= 0) {
      return NextResponse.json({ 
        error: 'Invalid request. method_id and amount are required.' 
      }, { status: 400 });
    }

    // Get withdrawal method details
    const { data: withdrawalMethod, error: methodError } = await supabase
      .from('withdrawal_methods')
      .select('*')
      .eq('id', method_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (methodError || !withdrawalMethod) {
      return NextResponse.json({ 
        error: 'Invalid or inactive withdrawal method' 
      }, { status: 400 });
    }

    // Check user's KYC status
    const { data: connectedAccount } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const userKycOk = connectedAccount?.details_submitted && 
                     connectedAccount?.cap_transfers === 'active' &&
                     connectedAccount?.payouts_enabled;

    const enhancedKycOk = connectedAccount?.enhanced_kyc_status === 'verified';

    // Check user's balance
    const { data: balance } = await supabase
      .from('wallet_balances')
      .select('available')
      .eq('user_id', user.id)
      .eq('currency', currency)
      .single();

    const availableBalance = balance?.available || 0;
    if (availableBalance < amount) {
      throw new InsufficientBalanceError(availableBalance, amount);
    }

    // Prepare rail selection input
    const railSelectionInput: RailSelectionInput = {
      user_id: user.id,
      userKycOk: Boolean(userKycOk),
      enhancedKycOk: Boolean(enhancedKycOk),
      targetCountry: withdrawalMethod.country,
      currency,
      method: getPayoutMethodType(withdrawalMethod.rail),
      amount,
      railsEnabled: ['stripe', 'wise', 'payoneer', 'paypal', 'local'],
      userPrefs: [withdrawalMethod.rail],
      urgency
    };

    // Get best rail selection
    let selectedRail;
    try {
      selectedRail = await payoutDecisionEngine.chooseRail(railSelectionInput);
    } catch (error) {
      if (error instanceof PayoutError) {
        return NextResponse.json({ 
          error: error.message,
          code: error.code,
          retryable: error.retryable
        }, { status: 400 });
      }
      throw error;
    }

    // Override rail if different from withdrawal method's rail
    if (selectedRail !== withdrawalMethod.rail) {
      console.log(`Rail override: requested ${withdrawalMethod.rail}, selected ${selectedRail}`);
    }

    // Get quote for the selected rail
    const quotes = await payoutDecisionEngine.getQuotes(railSelectionInput);
    const selectedQuote = quotes.find(q => q.rail === selectedRail) || quotes[0];

    if (!selectedQuote) {
      return NextResponse.json({ 
        error: 'No available payout methods for this request' 
      }, { status: 400 });
    }

    // Generate trace ID for idempotency
    const traceId = `payout_${user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Start transaction: debit balance and create payout record
    const { data: debitResult, error: debitError } = await supabase
      .rpc('debit_balance', {
        _user_id: user.id,
        _amount: amount,
        _currency: currency
      });

    if (debitError || !debitResult) {
      return NextResponse.json({ 
        error: 'Insufficient balance or failed to reserve funds' 
      }, { status: 400 });
    }

    // Create payout record
    const { data: payout, error: payoutError } = await supabase
      .from('payouts')
      .insert({
        user_id: user.id,
        method_id: method_id,
        rail: selectedRail,
        amount,
        currency,
        platform_fee: selectedQuote.platform_fee,
        provider_fee: selectedQuote.provider_fee,
        net_amount: selectedQuote.net_amount,
        status: 'queued',
        trace_id: traceId,
        description: description || `Withdrawal to ${withdrawalMethod.label}`,
        expected_arrival_date: selectedQuote.estimated_arrival,
        metadata: {
          original_rail: withdrawalMethod.rail,
          selected_rail: selectedRail,
          urgency,
          quote: selectedQuote
        }
      })
      .select()
      .single();

    if (payoutError) {
      console.error('Failed to create payout record:', payoutError);
      
      // Rollback balance debit
      await supabase.rpc('credit_balance', {
        _user_id: user.id,
        _amount: amount,
        _currency: currency
      });

      return NextResponse.json({ 
        error: 'Failed to create payout request' 
      }, { status: 500 });
    }

    // Log reconciliation entry
    await supabase
      .from('reconciliation_ledger')
      .insert({
        payout_id: payout.id,
        rail: selectedRail,
        action: 'debit_balance',
        amount,
        currency,
        balance_after: availableBalance - amount,
        notes: `Balance debited for payout request`,
        created_by: user.id
      });

    // TODO: Enqueue background job to process the payout
    // For now, we'll return the payout request details
    
    return NextResponse.json({
      success: true,
      payout_id: payout.id,
      trace_id: traceId,
      amount,
      currency,
      net_amount: selectedQuote.net_amount,
      rail: selectedRail,
      method: withdrawalMethod.label,
      status: 'queued',
      estimated_arrival: selectedQuote.estimated_arrival,
      processing_time: selectedQuote.processing_time,
      fees: {
        platform_fee: selectedQuote.platform_fee,
        provider_fee: selectedQuote.provider_fee,
        total_fees: selectedQuote.platform_fee + selectedQuote.provider_fee
      },
      message: `Withdrawal request created. Funds will be processed via ${selectedRail} and arrive in ${selectedQuote.processing_time}.`
    });

  } catch (error) {
    console.error('Withdrawal request error:', error);

    if (error instanceof PayoutError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        retryable: error.retryable
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Map rail to payout method type for decision engine
 */
function getPayoutMethodType(rail: string) {
  switch (rail) {
    case 'paypal':
      return 'paypal';
    case 'payoneer':
      return 'wallet';
    case 'local':
      return 'mobile';
    case 'stripe':
    case 'wise':
    default:
      return 'bank';
  }
}