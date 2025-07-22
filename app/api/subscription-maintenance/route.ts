import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST() {
  const supabase = await createClient();

  try {
    console.log('🔧 Running subscription maintenance...');

    // Run expiration handling
    const { error: expirationError } = await supabase.rpc('handle_subscription_expiration');
    
    if (expirationError) {
      console.error('Error handling subscription expiration:', expirationError);
      return NextResponse.json({ error: 'Failed to handle expiration' }, { status: 500 });
    }

    // Run profile sync
    const { error: syncError } = await supabase.rpc('sync_profile_subscription_tiers');
    
    if (syncError) {
      console.error('Error syncing profile tiers:', syncError);
      return NextResponse.json({ error: 'Failed to sync profiles' }, { status: 500 });
    }

    console.log('✅ Subscription maintenance completed');

    return NextResponse.json({
      message: 'Subscription maintenance completed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Unexpected error during maintenance:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  const supabase = await createClient();

  try {
    // Get subscription health report
    const { data: activeCount } = await supabase
      .from('user_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { data: expiredCount } = await supabase
      .from('user_subscriptions')
      .select('*', { count: 'exact', head: true })
      .lt('current_period_end', new Date().toISOString());

    const { data: profileMismatches } = await supabase
      .from('profiles')
      .select(`
        id,
        subscription_tier,
        user_subscriptions!inner(plan_id, status)
      `)
      .neq('user_subscriptions.status', 'cancelled');

    const inconsistencies = profileMismatches?.filter(profile => {
      const activeSubscription = profile.user_subscriptions?.[0];
      return activeSubscription && profile.subscription_tier !== activeSubscription.plan_id;
    }) || [];

    return NextResponse.json({
      activeSubscriptions: activeCount || 0,
      expiredSubscriptions: expiredCount || 0,
      profileMismatches: inconsistencies.length,
      healthScore: inconsistencies.length === 0 ? 'Healthy' : 'Needs Attention'
    });

  } catch (error) {
    console.error('Error generating health report:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}