const { createClient } = require('@supabase/supabase-js');

module.exports = async () => {
  console.log('🧹 Cleaning up Stripe Connect test environment...');
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE
  );

  try {
    // Clean up test data
    await cleanupTestData(supabase);
    console.log('✅ Test environment cleanup complete');
  } catch (error) {
    console.error('❌ Test environment cleanup failed:', error);
    // Don't throw - we don't want to fail tests due to cleanup issues
  }
};

async function cleanupTestData(supabase) {
  // Delete test withdrawals
  await supabase
    .from('withdrawals')
    .delete()
    .like('idempotency_key', 'test_%');

  // Delete test payout methods
  await supabase
    .from('payout_methods')
    .delete()
    .like('stripe_external_account_id', 'ba_test_%');

  // Delete test identity sessions
  await supabase
    .from('identity_verification_sessions')
    .delete()
    .like('stripe_session_id', 'vs_test_%');

  // Delete test security logs
  await supabase
    .from('withdrawal_security_logs')
    .delete()
    .eq('ip_address', '127.0.0.1');

  // Delete test rate limits
  await supabase
    .from('withdrawal_rate_limits')
    .delete()
    .in('user_id', [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444'
    ]);

  // Delete test payments
  await supabase
    .from('payments')
    .delete()
    .eq('id', '11111111-1111-1111-1111-111111111111');

  // Delete test profiles
  await supabase
    .from('profiles')
    .delete()
    .like('email', '%@test.example.com');
}