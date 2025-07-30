import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params;
    const supabase = await createClient();
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ 
        error: 'Unauthorized',
        details: 'You must be logged in to release payment'
      }, { status: 401 });
    }

    console.log(`[Escrow Release] User ${user.id} releasing payment for contract ${contractId}`);

    // Use service role client
    const { createClient: createServiceClient } = await import('@supabase/supabase-js');
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );
    
    // Get contract
    const { data: contract, error: contractError } = await serviceClient
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .single();
    
    if (contractError || !contract) {
      return NextResponse.json({ 
        error: 'Contract not found' 
      }, { status: 404 });
    }
    
    // Check authorization - only client can release payment
    if (contract.client_id !== user.id) {
      return NextResponse.json({ 
        error: 'Only the client can release payment' 
      }, { status: 403 });
    }

    // Get the funded escrow payment
    const { data: escrowPayment, error: escrowError } = await serviceClient
      .from('escrow_payments')
      .select('*')
      .eq('contract_id', contractId)
      .eq('status', 'funded')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (escrowError || !escrowPayment) {
      return NextResponse.json({ 
        error: 'No funded escrow payment found for this contract' 
      }, { status: 404 });
    }

    // Get freelancer profile
    const { data: freelancerProfile, error: freelancerError } = await serviceClient
      .from('profiles')
      .select('id, display_name, email')
      .eq('id', contract.freelancer_id)
      .single();

    if (freelancerError || !freelancerProfile) {
      return NextResponse.json({ 
        error: 'Freelancer profile not found' 
      }, { status: 404 });
    }

    // Get request body for release options
    const body = await request.json();
    const { amount, reason, release_method } = body;

    // Default to full contract amount if no specific amount provided
    const releaseAmount = amount || parseFloat(escrowPayment.amount.toString());
    
    if (releaseAmount <= 0 || releaseAmount > parseFloat(escrowPayment.amount.toString())) {
      return NextResponse.json({ 
        error: 'Invalid release amount' 
      }, { status: 400 });
    }

    // Create a release request record
    const { data: releaseRequest, error: releaseError } = await serviceClient
      .from('escrow_releases')
      .insert({
        escrow_payment_id: escrowPayment.id,
        contract_id: contractId,
        freelancer_id: contract.freelancer_id,
        client_id: user.id,
        amount: releaseAmount,
        release_method: release_method || 'pending_payout',
        reason: reason || 'work_completed',
        status: 'pending',
        requested_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (releaseError) {
      console.error('Release request creation error:', releaseError);
      return NextResponse.json({ 
        error: 'Failed to create release request' 
      }, { status: 500 });
    }

    // Update escrow payment status to "released"
    const { error: updateError } = await serviceClient
      .from('escrow_payments')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
      })
      .eq('id', escrowPayment.id);

    if (updateError) {
      console.error('Failed to update escrow payment:', updateError);
    }

    // Update contract payment status
    await serviceClient
      .from('contract_payments')
      .update({ status: 'released' })
      .eq('contract_id', contractId)
      .eq('status', 'funded');

    // Update contract status to completed if fully released
    if (releaseAmount === parseFloat(escrowPayment.amount.toString())) {
      await serviceClient
        .from('contracts')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', contractId);
    }

    // Send notification to freelancer (you can implement email notification here)
    await serviceClient
      .from('notifications')
      .insert({
        user_id: contract.freelancer_id,
        type: 'payment_released',
        title: 'Payment Released',
        message: `Payment of $${releaseAmount.toFixed(2)} has been released for contract "${contract.title}". You will receive payout instructions via email.`,
        is_read: false,
        related_entity_type: 'contract',
        related_entity_id: contractId,
      });

    return NextResponse.json({
      success: true,
      release_id: releaseRequest.id,
      amount_released: releaseAmount,
      freelancer_name: freelancerProfile.display_name,
      freelancer_email: freelancerProfile.email,
      release_status: 'pending_payout',
      message: `Successfully released $${releaseAmount.toFixed(2)} to ${freelancerProfile.display_name}. Payout will be processed within 2-3 business days.`,
      next_steps: {
        freelancer: 'Will receive payout instructions via email',
        client: 'Release completed successfully',
        platform: 'Will process payout to freelancer',
      }
    });

  } catch (error) {
    console.error('Payment release error:', error);
    return NextResponse.json({ 
      error: 'Failed to release payment',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET method to check release status  
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params;
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use service role client
    const { createClient: createServiceClient } = await import('@supabase/supabase-js');
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );

    // Get release requests for this contract
    const { data: releases, error: releasesError } = await serviceClient
      .from('escrow_releases')
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false });

    if (releasesError) {
      return NextResponse.json({ error: 'Failed to fetch releases' }, { status: 500 });
    }

    // Get escrow payments
    const { data: escrowPayments, error: paymentsError } = await serviceClient
      .from('escrow_payments')
      .select('*')
      .eq('contract_id', contractId);

    const releaseStatus = {
      can_release: escrowPayments?.some(p => p.status === 'funded') || false,
      releases: releases || [],
      total_released: releases?.reduce((sum, r) => sum + parseFloat(r.amount.toString()), 0) || 0,
      pending_releases: releases?.filter(r => r.status === 'pending') || [],
      completed_releases: releases?.filter(r => r.status === 'completed') || [],
    };

    return NextResponse.json({
      success: true,
      contract_id: contractId,
      release_status: releaseStatus,
    });

  } catch (error) {
    console.error('Release status fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}