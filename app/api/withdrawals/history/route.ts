import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createOptimizedResponse, getOptimizedPaymentHistory } from '@/lib/api/optimized-responses';
import { getUserCacheKey } from '@/lib/cache/redis-cache';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const currency = url.searchParams.get('currency') || 'USD';
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    return await createOptimizedResponse(
      async () => {
        // Execute parallel queries
        const [payouts, stats] = await Promise.all([
          getOptimizedPaymentHistory(user.id, currency, limit, offset),
          supabase.rpc('get_user_payout_stats', {
            _user_id: user.id,
            _currency: currency
          }).single().then(result => result.data)
        ]);

        // Filter by status if provided
        const filteredPayouts = status 
          ? payouts.filter(p => p.status === status)
          : payouts;

        // Format response
        const formattedPayouts = filteredPayouts.map(payout => ({
          id: payout.id,
          amount: payout.amount,
          currency: payout.currency,
          net_amount: payout.net_amount,
          status: payout.status,
          rail: payout.rail,
          rail_name: getRailDisplayName(payout.rail),
          method: {
            label: (payout.withdrawal_method as any)?.[0]?.label || '',
            provider_name: (payout.withdrawal_method as any)?.[0]?.provider_name || '',
            icon: (payout.withdrawal_method as any)?.[0]?.icon || '',
            last_four: (payout.withdrawal_method as any)?.[0]?.last_four || ''
          },
          fees: {
            platform_fee: payout.platform_fee || 0,
            provider_fee: payout.provider_fee || 0,
            total_fees: (payout.platform_fee || 0) + (payout.provider_fee || 0)
          },
          trace_id: payout.trace_id,
          failure_reason: payout.failure_reason,
          created_at: payout.created_at,
          completed_at: payout.completed_at,
          expected_arrival_date: payout.expected_arrival_date
        }));

        return {
          payouts: formattedPayouts,
          pagination: {
            limit,
            offset,
            total: filteredPayouts.length,
            has_more: filteredPayouts.length === limit
          },
          stats: stats ? {
            available_balance: (stats as any).available_balance || 0,
            pending_balance: (stats as any).pending_balance || 0,
            total_earned: (stats as any).total_earned || 0,
            total_withdrawn: (stats as any).total_withdrawn || 0,
            pending_payouts: (stats as any).pending_payouts || 0,
            successful_payouts: (stats as any).successful_payouts || 0,
            failed_payouts: (stats as any).failed_payouts || 0
          } : null,
          currency
        };
      },
      getUserCacheKey(user.id, `withdrawal-history-${currency}-${status || 'all'}-${limit}-${offset}`),
      60 // 1 minute cache
    );

  } catch (error) {
    console.error('Payout history error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

function getRailDisplayName(rail: string): string {
  const names: Record<string, string> = {
    stripe: 'Bank Transfer',
    wise: 'Wise Transfer',
    payoneer: 'Payoneer',
    paypal: 'PayPal',
    local: 'Local Payment'
  };
  return names[rail] || rail;
}