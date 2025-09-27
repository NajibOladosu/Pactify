const { createClient } = require('@supabase/supabase-js');

module.exports = async () => {
  console.log('🔧 Setting up Stripe Connect test environment...');
  
  // Verify environment variables
  const requiredEnvVars = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE'
  ];

  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Initialize test database
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE
  );

  try {
    // Clean up any existing test data
    await cleanupTestData(supabase);
    
    // Create test users
    await createTestUsers(supabase);
    
    console.log('✅ Test environment setup complete');
  } catch (error) {
    console.error('❌ Test environment setup failed:', error);
    throw error;
  }
};

async function cleanupTestData(supabase) {
  console.log('🧹 Cleaning up existing test data...');
  
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

  // Delete test profiles (but keep real ones)
  await supabase
    .from('profiles')
    .delete()
    .like('email', '%@test.example.com');
}

async function createTestUsers(supabase) {
  console.log('👥 Creating test users...');
  
  const testUsers = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'verified-user@test.example.com',
      display_name: 'Verified Test User',
      identity_status: 'verified',
      stripe_account_id: 'acct_test_verified',
      stripe_account_type: 'express',
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      email: 'pending-user@test.example.com',
      display_name: 'Pending Test User',
      identity_status: 'pending',
      stripe_account_id: 'acct_test_pending',
      stripe_account_type: 'express',
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      email: 'new-user@test.example.com',
      display_name: 'New Test User',
      identity_status: 'unstarted',
      created_at: new Date().toISOString(), // Just created
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      email: 'high-risk-user@test.example.com',
      display_name: 'High Risk Test User',
      identity_status: 'verified',
      stripe_account_id: 'acct_test_highrisk',
      stripe_account_type: 'express',
      kyc_risk_score: 85,
      created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    }
  ];

  for (const user of testUsers) {
    await supabase
      .from('profiles')
      .upsert(user, { onConflict: 'id' });
  }

  // Create test payout methods for verified user
  await supabase
    .from('payout_methods')
    .upsert({
      id: '11111111-1111-1111-1111-111111111111',
      user_id: '11111111-1111-1111-1111-111111111111',
      stripe_external_account_id: 'ba_test_verified_bank',
      stripe_account_id: 'acct_test_verified',
      method_type: 'bank_account',
      last_four: '6789',
      bank_name: 'Test Bank',
      country: 'US',
      currency: 'USD',
      is_default: true,
      is_verified: true,
      verification_status: 'verified',
      added_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
      verified_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'id' });

  // Create test payments for balance calculation
  await supabase
    .from('payments')
    .upsert([
      {
        id: '11111111-1111-1111-1111-111111111111',
        contract_id: '11111111-1111-1111-1111-111111111111',
        payer_id: '22222222-2222-2222-2222-222222222222',
        payee_id: '11111111-1111-1111-1111-111111111111',
        amount: 1000,
        fee: 50,
        net_amount: 950,
        currency: 'USD',
        status: 'released',
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      }
    ], { onConflict: 'id' });
}