import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = await createClient();

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Error fetching user:', userError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create service role client for database operations
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );

    // Enforce contract limits first
    const { error: contractLimitError } = await serviceSupabase.rpc('enforce_contract_limits', { p_user_id: user.id });
    if (contractLimitError) {
      console.error('Contract limit enforcement failed:', contractLimitError);
    }

    // Get all contracts with lock status
    const { data: contracts, error: contractsError } = await serviceSupabase
      .from('contracts')
      .select('id, title, status, locked, created_at')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: true });

    if (contractsError) {
      console.error('Error fetching contracts:', contractsError);
      return NextResponse.json({ error: 'Failed to fetch contracts' }, { status: 500 });
    }

    // Get user's subscription info
    const { data: profile } = await serviceSupabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();

    const activeContracts = contracts?.filter(c => 
      ['draft', 'pending_signatures', 'pending_funding'].includes(c.status)
    ) || [];

    const lockedContracts = activeContracts.filter(c => c.locked);
    const unlockedContracts = activeContracts.filter(c => !c.locked);

    return NextResponse.json({
      subscriptionTier: profile?.subscription_tier || 'free',
      totalContracts: contracts?.length || 0,
      activeContracts: activeContracts.length,
      lockedContracts: lockedContracts.length,
      unlockedContracts: unlockedContracts.length,
      contractLimit: profile?.subscription_tier === 'free' ? 3 : null,
      contracts: contracts?.map(contract => ({
        id: contract.id,
        title: contract.title,
        status: contract.status,
        locked: contract.locked,
        createdAt: contract.created_at
      })) || []
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST endpoint to manually enforce contract limits
export async function POST() {
  const supabase = await createClient();

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );

    // Enforce contract limits
    const { error: contractLimitError } = await serviceSupabase.rpc('enforce_contract_limits', { p_user_id: user.id });
    
    if (contractLimitError) {
      console.error('Contract limit enforcement failed:', contractLimitError);
      return NextResponse.json({ error: 'Failed to enforce contract limits' }, { status: 500 });
    }

    return NextResponse.json({ 
      message: 'Contract limits enforced successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}