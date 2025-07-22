import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST() {
  const supabase = await createClient();

  try {
    console.log('🔄 Starting subscription data sync...');

    // Get all users with active subscriptions
    const { data: activeSubscriptions, error: subscriptionsError } = await supabase
      .from('user_subscriptions')
      .select('user_id, plan_id, status')
      .eq('status', 'active');

    if (subscriptionsError) {
      console.error('Error fetching active subscriptions:', subscriptionsError);
      return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
    }

    console.log(`📊 Found ${activeSubscriptions?.length || 0} active subscriptions`);

    let syncedCount = 0;
    let errors = [];

    // Update each user's profile to match their subscription
    for (const subscription of activeSubscriptions || []) {
      try {
        const { data: updated, error: updateError } = await supabase
          .from('profiles')
          .update({ subscription_tier: subscription.plan_id })
          .eq('id', subscription.user_id)
          .select('id, subscription_tier');

        if (updateError) {
          errors.push(`User ${subscription.user_id}: ${updateError.message}`);
          console.error(`❌ Failed to update profile for user ${subscription.user_id}:`, updateError);
        } else {
          syncedCount++;
          console.log(`✅ Synced user ${subscription.user_id} to ${subscription.plan_id}`);
        }
      } catch (err) {
        errors.push(`User ${subscription.user_id}: ${err}`);
        console.error(`❌ Exception updating user ${subscription.user_id}:`, err);
      }
    }

    // Also update users without active subscriptions to free
    const { data: freeProfiles, error: freeError } = await supabase
      .from('profiles')
      .update({ subscription_tier: 'free' })
      .not('id', 'in', `(${activeSubscriptions?.map(s => `'${s.user_id}'`).join(',') || "''"})`)
      .neq('subscription_tier', 'free')
      .select('id');

    if (freeError) {
      console.error('Error updating free profiles:', freeError);
      errors.push(`Free profiles update: ${freeError.message}`);
    } else {
      console.log(`✅ Updated ${freeProfiles?.length || 0} profiles to free tier`);
    }

    console.log('🎉 Subscription data sync completed');

    return NextResponse.json({
      message: 'Subscription data sync completed',
      syncedActiveSubscriptions: syncedCount,
      updatedFreeProfiles: freeProfiles?.length || 0,
      totalActiveSubscriptions: activeSubscriptions?.length || 0,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Unexpected error during sync:', error);
    return NextResponse.json({ error: 'Internal server error during sync' }, { status: 500 });
  }
}

// GET endpoint to check sync status
export async function GET() {
  const supabase = await createClient();

  try {
    // Get subscription vs profile mismatches
    const { data: mismatches, error } = await supabase
      .from('profiles')
      .select(`
        id,
        subscription_tier,
        user_subscriptions!inner(plan_id, status)
      `)
      .neq('user_subscriptions.status', 'cancelled');

    if (error) {
      console.error('Error checking sync status:', error);
      return NextResponse.json({ error: 'Failed to check sync status' }, { status: 500 });
    }

    const inconsistencies = mismatches?.filter(profile => {
      const activeSubscription = profile.user_subscriptions?.[0];
      return activeSubscription && profile.subscription_tier !== activeSubscription.plan_id;
    }) || [];

    return NextResponse.json({
      totalProfiles: mismatches?.length || 0,
      inconsistencies: inconsistencies.length,
      inconsistentProfiles: inconsistencies.map(p => ({
        userId: p.id,
        profileTier: p.subscription_tier,
        subscriptionPlan: p.user_subscriptions?.[0]?.plan_id,
        subscriptionStatus: p.user_subscriptions?.[0]?.status
      }))
    });

  } catch (error) {
    console.error('Unexpected error checking sync:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}