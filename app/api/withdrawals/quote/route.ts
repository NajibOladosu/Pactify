import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { payoutDecisionEngine } from '@/lib/payout/decision-engine';
import { RailSelectionInput, PayoutError } from '@/lib/payout/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { method_id, amount, currency = 'USD', urgency = 'standard' } = body;

    if (!method_id || !amount || amount <= 0) {
      return NextResponse.json({ 
        error: 'method_id and amount are required' 
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
        error: 'Invalid withdrawal method' 
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

    // Get all available quotes
    let quotes;
    try {
      quotes = await payoutDecisionEngine.getQuotes(railSelectionInput);
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

    if (quotes.length === 0) {
      return NextResponse.json({ 
        error: 'No available payout methods for this request' 
      }, { status: 400 });
    }

    // Get recommended rail
    const recommendedRail = await payoutDecisionEngine.chooseRail(railSelectionInput);
    const recommendedQuote = quotes.find(q => q.rail === recommendedRail);

    // Format quotes for response
    const formattedQuotes = quotes.map(quote => ({
      rail: quote.rail,
      rail_name: getRailDisplayName(quote.rail),
      amount: quote.amount,
      currency: quote.currency,
      fees: {
        platform_fee: quote.platform_fee,
        provider_fee: quote.provider_fee,
        total_fees: quote.platform_fee + quote.provider_fee
      },
      fx_rate: quote.fx_rate,
      net_amount: quote.net_amount,
      processing_time: quote.processing_time,
      estimated_arrival: quote.estimated_arrival,
      supports_instant: quote.supports_instant,
      instant_fee: quote.instant_fee,
      recommended: quote.rail === recommendedRail
    }));

    return NextResponse.json({
      success: true,
      method: {
        id: withdrawalMethod.id,
        label: withdrawalMethod.label,
        rail: withdrawalMethod.rail,
        currency: withdrawalMethod.currency,
        country: withdrawalMethod.country
      },
      amount,
      currency,
      quotes: formattedQuotes,
      recommended_rail: recommendedRail,
      recommended_quote: recommendedQuote ? {
        rail: recommendedQuote.rail,
        rail_name: getRailDisplayName(recommendedQuote.rail),
        net_amount: recommendedQuote.net_amount,
        total_fees: recommendedQuote.platform_fee + recommendedQuote.provider_fee,
        processing_time: recommendedQuote.processing_time,
        estimated_arrival: recommendedQuote.estimated_arrival
      } : null,
      kyc_status: {
        basic_kyc: userKycOk,
        enhanced_kyc: enhancedKycOk,
        kyc_required: !userKycOk,
        enhanced_kyc_required: amount > 1000000 && !enhancedKycOk
      }
    });

  } catch (error) {
    console.error('Quote generation error:', error);

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

function getRailDisplayName(rail: string): string {
  const names: Record<string, string> = {
    stripe: 'Bank Transfer (Stripe)',
    wise: 'International Transfer (Wise)',
    payoneer: 'Payoneer Wallet',
    paypal: 'PayPal',
    local: 'Local Payment'
  };
  return names[rail] || rail;
}