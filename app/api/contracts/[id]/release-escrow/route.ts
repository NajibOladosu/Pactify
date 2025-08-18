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

    // Check if there are any payments for this contract (simplified approach)
    const { data: contractPayments, error: paymentsError } = await serviceClient
      .from('contract_payments')
      .select('*')
      .eq('contract_id', contractId)
      .in('status', ['completed', 'funded', 'held'])
      .order('created_at', { ascending: false });

    if (paymentsError || !contractPayments || contractPayments.length === 0) {
      return NextResponse.json({ 
        error: 'No funded payments found for this contract' 
      }, { status: 404 });
    }

    const totalAmount = contractPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);

    // Get freelancer profile
    const { data: freelancerProfile, error: freelancerError } = await serviceClient
      .from('profiles')
      .select('id, display_name')
      .eq('id', contract.freelancer_id)
      .single();

    if (freelancerError || !freelancerProfile) {
      return NextResponse.json({ 
        error: 'Freelancer profile not found' 
      }, { status: 404 });
    }

    // Get freelancer email from auth.users (placeholder for now)
    const freelancerEmail = 'freelancer@example.com'; // TODO: Get from auth.users table

    // Get request body for release options
    const body = await request.json();
    const { amount, reason, release_method, auto_approve_deliverables } = body;

    console.log(`[Release Payment] Contract ${contractId} status: ${contract.status}`);

    // If contract needs deliverable approval, handle it automatically
    if (auto_approve_deliverables && ['in_review', 'pending_delivery'].includes(contract.status)) {
      console.log(`[Release Payment] Auto-approving deliverables for contract ${contractId}`);
      
      const { error: approvalError } = await serviceClient
        .from("contracts")
        .update({ status: 'pending_completion' })
        .eq("id", contractId);

      if (approvalError) {
        console.error("Error auto-approving deliverables:", approvalError);
        return NextResponse.json({ 
          error: "Failed to approve deliverables before payment release" 
        }, { status: 500 });
      }
      
      console.log(`[Release Payment] Contract ${contractId} status updated to pending_completion`);
    }

    // Default to full contract amount if no specific amount provided
    const releaseAmount = amount || totalAmount;
    
    if (releaseAmount <= 0 || releaseAmount > totalAmount) {
      return NextResponse.json({ 
        error: 'Invalid release amount' 
      }, { status: 400 });
    }

    // Create a payment record for the freelancer
    const paymentRecord = {
      contract_id: contractId,
      payer_id: user.id, // Client who is releasing payment
      payee_id: contract.freelancer_id, // Freelancer receiving payment
      amount: releaseAmount,
      fee: releaseAmount * 0.05, // 5% platform fee (you can adjust this)
      net_amount: releaseAmount * 0.95, // Amount freelancer receives after fee
      currency: 'USD',
      status: 'released',
      payment_type: 'contract_release',
      stripe_payment_intent_id: null, // Not using Stripe for now
      completed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: newPayment, error: paymentCreateError } = await serviceClient
      .from('payments')
      .insert(paymentRecord)
      .select()
      .single();

    if (paymentCreateError) {
      console.error('Failed to create payment record:', paymentCreateError);
      return NextResponse.json({ 
        error: 'Failed to create payment record',
        details: paymentCreateError.message 
      }, { status: 500 });
    }

    // Update contract payment status if exists
    const { error: paymentUpdateError } = await serviceClient
      .from('contract_payments')
      .update({ status: 'released' })
      .eq('contract_id', contractId)
      .in('status', ['completed', 'funded', 'held']);

    if (paymentUpdateError) {
      console.error('Failed to update contract payments:', paymentUpdateError);
    }

    // Update contract status to completed
    const { error: contractUpdateError } = await serviceClient
      .from('contracts')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', contractId);

    if (contractUpdateError) {
      console.error('Failed to update contract status:', contractUpdateError);
      return NextResponse.json({ 
        error: 'Failed to complete contract' 
      }, { status: 500 });
    }

    // Skip notifications for now to avoid missing table errors
    // TODO: Implement email notifications

    return NextResponse.json({
      success: true,
      payment_id: newPayment.id,
      amount_released: releaseAmount,
      net_amount: paymentRecord.net_amount,
      platform_fee: paymentRecord.fee,
      freelancer_name: freelancerProfile.display_name,
      freelancer_email: freelancerEmail,
      release_status: 'completed',
      message: `Successfully released $${releaseAmount.toFixed(2)} to ${freelancerProfile.display_name}. Net amount: $${paymentRecord.net_amount.toFixed(2)} (after $${paymentRecord.fee.toFixed(2)} platform fee).`,
      next_steps: {
        freelancer: `Payment of $${paymentRecord.net_amount.toFixed(2)} available in your payments dashboard`,
        client: 'Payment release completed successfully',
        platform: 'Contract completed and payment processed',
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

    // Get contract payments
    const { data: contractPayments, error: paymentsError } = await serviceClient
      .from('contract_payments')
      .select('*')
      .eq('contract_id', contractId);

    if (paymentsError) {
      return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
    }

    const releaseStatus = {
      can_release: contractPayments?.some(p => ['completed', 'funded', 'held'].includes(p.status)) || false,
      total_amount: contractPayments?.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0) || 0,
      released_amount: contractPayments?.filter(p => p.status === 'released').reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0) || 0,
      pending_amount: contractPayments?.filter(p => ['completed', 'funded', 'held'].includes(p.status)).reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0) || 0,
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