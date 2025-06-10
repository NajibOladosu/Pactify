// Script to sync profile subscription tiers with actual user subscriptions
// Run with: node scripts/sync-profiles.js

const { createClient } = require('@supabase/supabase-js');

async function syncProfiles() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !supabaseServiceRole) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRole);

  try {
    console.log('🔄 Syncing profile subscription tiers...');

    // Update profiles to match active subscriptions
    const { data: updated, error: updateError } = await supabase.rpc('exec', {
      sql: `
        UPDATE profiles 
        SET subscription_tier = us.plan_id
        FROM user_subscriptions us
        WHERE profiles.id = us.user_id 
        AND us.status IN ('active', 'trialing', 'past_due');
      `
    });

    if (updateError) {
      console.error('❌ Error updating active subscriptions:', updateError);
    } else {
      console.log('✅ Updated profiles with active subscriptions');
    }

    // Reset profiles without active subscriptions to free
    const { data: resetData, error: resetError } = await supabase.rpc('exec', {
      sql: `
        UPDATE profiles 
        SET subscription_tier = 'free'
        WHERE id NOT IN (
          SELECT user_id FROM user_subscriptions 
          WHERE status IN ('active', 'trialing', 'past_due')
        )
        AND subscription_tier != 'free';
      `
    });

    if (resetError) {
      console.error('❌ Error resetting inactive subscriptions:', resetError);
    } else {
      console.log('✅ Reset inactive subscriptions to free');
    }

    // Show summary
    const { data: summary, error: summaryError } = await supabase
      .from('profiles')
      .select('subscription_tier, count(*)')
      .group('subscription_tier');

    if (!summaryError && summary) {
      console.log('\n📊 Profile subscription tier summary:');
      summary.forEach(row => {
        console.log(`  ${row.subscription_tier}: ${row.count} users`);
      });
    }

    console.log('\n✅ Profile sync completed!');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

syncProfiles();