import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    // Use service role client for reliable data access
    const { createClient: createServiceClient } = await import('@supabase/supabase-js');
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );
    
    // Fetch payments where user is either payer or payee
    const { data: paymentsData, error } = await serviceClient
      .from('payments')
      .select('*')
      .or(`payer_id.eq.${user.id},payee_id.eq.${user.id}`)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching payments:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch payments',
        details: error.message 
      }, { status: 500 });
    }

    // Enrich payments with related data
    const enrichedPayments = [];
    for (const payment of paymentsData || []) {
      const { data: contract } = await serviceClient
        .from('contracts')
        .select('title')
        .eq('id', payment.contract_id)
        .single();
      
      const { data: payer } = await serviceClient
        .from('profiles')
        .select('display_name')
        .eq('id', payment.payer_id)
        .single();
        
      const { data: payee } = await serviceClient
        .from('profiles')
        .select('display_name')
        .eq('id', payment.payee_id)
        .single();

      enrichedPayments.push({
        ...payment,
        contract,
        payer,
        payee
      });
    }

    return NextResponse.json({
      success: true,
      payments: enrichedPayments,
      user_id: user.id
    });

  } catch (error) {
    console.error('Payments API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}