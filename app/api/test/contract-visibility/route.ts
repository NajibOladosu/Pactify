import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Test the new functions
    const { data: contractCount, error: countError } = await supabase
      .rpc('get_user_contract_count', { p_user_id: user.id });

    const { data: contracts, error: contractsError } = await supabase
      .rpc('get_user_contracts', { p_user_id: user.id });

    if (countError) {
      console.error('Count error:', countError);
      return NextResponse.json({ error: 'Count function failed', details: countError }, { status: 500 });
    }

    if (contractsError) {
      console.error('Contracts error:', contractsError);
      return NextResponse.json({ error: 'Contracts function failed', details: contractsError }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      user_id: user.id,
      contract_count: contractCount,
      contracts: contracts?.slice(0, 5), // Return first 5 contracts for verification
      total_contracts_returned: contracts?.length || 0
    });

  } catch (error) {
    console.error('Test endpoint error:', error);
    return NextResponse.json({ 
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}