import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get contract to verify access
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', resolvedParams.id)
      .single();

    if (contractError || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Check if user has access to this contract
    const hasAccess = 
      contract.creator_id === user.id ||
      contract.client_id === user.id ||
      contract.freelancer_id === user.id;

    if (!hasAccess) {
      return NextResponse.json({ 
        error: 'Access denied to this contract' 
      }, { status: 403 });
    }

    // Get escrow summary using the new database function
    const { data: escrowSummary, error: summaryError } = await supabase
      .rpc('get_contract_escrow_summary', { 
        contract_id_param: resolvedParams.id 
      });

    if (summaryError) {
      console.error('Error fetching escrow summary:', summaryError);
      return NextResponse.json({ 
        error: 'Failed to fetch escrow summary' 
      }, { status: 500 });
    }

    // Get detailed escrow payments
    const { data: escrowPayments, error: paymentsError } = await supabase
      .from('escrow_payments')
      .select('*')
      .eq('contract_id', resolvedParams.id)
      .order('created_at', { ascending: false });

    if (paymentsError) {
      console.error('Error fetching escrow payments:', paymentsError);
      return NextResponse.json({ 
        error: 'Failed to fetch escrow payments' 
      }, { status: 500 });
    }

    // Check if freelancer is ready for escrow
    let freelancerReady = false;
    if (contract.freelancer_id) {
      const { data: isReady, error: readyError } = await supabase
        .rpc('is_freelancer_escrow_ready', { 
          freelancer_id: contract.freelancer_id 
        });
      
      if (!readyError) {
        freelancerReady = isReady || false;
      }
    }

    const summary = escrowSummary?.[0] || {
      total_escrowed: 0,
      total_released: 0,
      total_refunded: 0,
      remaining_balance: 0,
      payment_count: 0,
      last_activity: null
    };

    return NextResponse.json({
      success: true,
      contract: {
        id: contract.id,
        title: contract.title,
        status: contract.status,
        total_amount: contract.total_amount,
        is_funded: contract.is_funded,
      },
      escrow: {
        summary: summary,
        payments: escrowPayments || [],
        freelancer_ready: freelancerReady,
      },
      permissions: {
        can_fund: contract.client_id === user.id,
        can_release: contract.client_id === user.id,
        can_request_release: contract.freelancer_id === user.id,
      }
    });

  } catch (error) {
    console.error('Escrow status error:', error);
    return NextResponse.json({ 
      error: 'Failed to get escrow status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const supabase = await createClient();
    const body = await request.json();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action } = body; // Actions: 'retry_failed_transfer', 'mark_as_disputed', 'request_refund'

    if (!action) {
      return NextResponse.json({ error: 'Action required' }, { status: 400 });
    }

    // Get contract first
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', resolvedParams.id)
      .single();

    if (contractError || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    switch (action) {
      case 'retry_failed_transfer':
        return await retryFailedTransfer(resolvedParams.id, user.id, supabase);
      
      case 'mark_as_disputed':
        return await markAsDisputed(resolvedParams.id, user.id, body.reason, supabase);
      
      case 'request_refund':
        return await requestRefund(resolvedParams.id, user.id, body.reason, supabase);
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Escrow action error:', error);
    return NextResponse.json({ 
      error: 'Failed to process escrow action',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function retryFailedTransfer(contractId: string, userId: string, supabase: any) {
  // Find failed transfers for this contract
  const { data: failedPayments, error } = await supabase
    .from('escrow_payments')
    .select('*')
    .eq('contract_id', contractId)
    .eq('status', 'transfer_failed');

  if (error || !failedPayments?.length) {
    return NextResponse.json({ 
      error: 'No failed transfers found for retry' 
    }, { status: 404 });
  }

  // Reset status to funded so it can be released again
  const { error: updateError } = await supabase
    .from('escrow_payments')
    .update({ status: 'funded' })
    .eq('contract_id', contractId)
    .eq('status', 'transfer_failed');

  if (updateError) {
    return NextResponse.json({ 
      error: 'Failed to reset transfer status' 
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: 'Failed transfers reset. Payment can now be released again.',
  });
}

async function markAsDisputed(contractId: string, userId: string, reason: string, supabase: any) {
  // Update contract status to disputed
  const { error: contractError } = await supabase
    .from('contracts')
    .update({ 
      status: 'disputed',
      updated_at: new Date().toISOString()
    })
    .eq('id', contractId);

  if (contractError) {
    return NextResponse.json({ 
      error: 'Failed to mark contract as disputed' 
    }, { status: 500 });
  }

  // Create dispute record if table exists
  const { error: disputeError } = await supabase
    .from('contract_disputes')
    .insert({
      contract_id: contractId,
      initiated_by: userId,
      description: reason,
      dispute_type: 'payment',
      status: 'open',
    });

  // Log the dispute creation
  await supabase
    .from('contract_activities')
    .insert({
      contract_id: contractId,
      user_id: userId,
      activity_type: 'dispute_created',
      description: `Contract disputed: ${reason}`,
    });

  return NextResponse.json({
    success: true,
    message: 'Contract marked as disputed. Support will be notified.',
  });
}

async function requestRefund(contractId: string, userId: string, reason: string, supabase: any) {
  // Check if user is client
  const { data: contract } = await supabase
    .from('contracts')
    .select('client_id')
    .eq('id', contractId)
    .single();

  if (!contract || contract.client_id !== userId) {
    return NextResponse.json({ 
      error: 'Only the client can request refunds' 
    }, { status: 403 });
  }

  // Update escrow payments to refund requested
  const { error: updateError } = await supabase
    .from('escrow_payments')
    .update({ status: 'refund_requested' })
    .eq('contract_id', contractId)
    .in('status', ['funded', 'held']);

  if (updateError) {
    return NextResponse.json({ 
      error: 'Failed to request refund' 
    }, { status: 500 });
  }

  // Log the refund request
  await supabase
    .from('contract_activities')
    .insert({
      contract_id: contractId,
      user_id: userId,
      activity_type: 'refund_requested',
      description: `Refund requested: ${reason}`,
    });

  return NextResponse.json({
    success: true,
    message: 'Refund requested. This will be processed by support.',
  });
}