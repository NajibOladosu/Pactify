import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  const supabase = await createClient();

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    // Test the exact query
    const { data: testSubscription, error: testError } = await supabase
      .from('user_subscriptions')
      .select(`
        *,
        subscription_plans (
          id,
          name,
          description,
          price_monthly,
          price_yearly,
          escrow_fee_percentage,
          max_contracts,
          features
        )
      `)
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing', 'past_due'])
      .order('created_at', { ascending: false })
      .maybeSingle();

    console.log('🧪 Test subscription result:', {
      testSubscription,
      testError,
      userId: user.id
    });

    return NextResponse.json({
      userId: user.id,
      testSubscription,
      testError,
      hasSubscription: !!testSubscription,
      hasSubscriptionPlans: !!(testSubscription && testSubscription.subscription_plans)
    });

  } catch (error) {
    console.error('🧪 Test error:', error);
    return NextResponse.json(
      { error: "Test failed" },
      { status: 500 }
    );
  }
}