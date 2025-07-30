import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id, title, total_amount, currency, status')
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Get contract parties
    const { data: parties, error: partiesError } = await supabase
      .from('contract_parties')
      .select('user_id, role, status')
      .eq('contract_id', contractId);

    if (partiesError || !parties) {
      return NextResponse.json({ error: 'Contract parties not found' }, { status: 404 });
    }

    const clientParty = parties.find(p => p.role === 'client');
    const freelancerParty = parties.find(p => p.role === 'freelancer');

    if (!clientParty || !freelancerParty) {
      return NextResponse.json({ 
        error: 'Contract must have both client and freelancer' 
      }, { status: 400 });
    }

    // Verify user is the client (only client can release payment)
    if (clientParty.user_id !== user.id) {
      return NextResponse.json({ 
        error: 'Only the client can release payment' 
      }, { status: 403 });
    }

    // Get the funded escrow payment
    const { data: escrowPayment, error: escrowError } = await supabase
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

    // Get freelancer's Stripe Connect account
    const { data: freelancerProfile, error: freelancerError } = await supabase
      .from('profiles')
      .select('stripe_connect_account_id, display_name')
      .eq('id', freelancerParty.user_id)
      .single();

    if (freelancerError || !freelancerProfile?.stripe_connect_account_id) {
      return NextResponse.json({ 
        error: 'Freelancer Stripe Connect account not found' 
      }, { status: 404 });
    }

    // Get request body for any release options
    const body = await request.json();
    const { amount, reason } = body;

    // Default to full contract amount if no specific amount provided
    const releaseAmount = amount || parseFloat(escrowPayment.amount.toString());
    
    if (releaseAmount <= 0 || releaseAmount > parseFloat(escrowPayment.amount.toString())) {
      return NextResponse.json({ 
        error: 'Invalid release amount' 
      }, { status: 400 });
    }

    // Create transfer to freelancer's Stripe Connect account
    // This transfers money from the platform account to the freelancer
    const transfer = await stripe.transfers.create({
      amount: Math.round(releaseAmount * 100), // Convert to cents
      currency: (contract.currency || 'USD').toLowerCase(),
      destination: freelancerProfile.stripe_connect_account_id,
      description: `Payment release for contract: ${contract.title}`,
      metadata: {
        contract_id: contractId,
        escrow_payment_id: escrowPayment.id,
        client_id: user.id,
        freelancer_id: freelancerParty.user_id,
        release_reason: reason || 'work_completed',
        release_type: 'full_release',
      },
    });

    // Update escrow payment status
    const { error: updateError } = await supabase
      .from('escrow_payments')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        stripe_transfer_id: transfer.id,
      })
      .eq('id', escrowPayment.id);

    if (updateError) {
      console.error('Failed to update escrow payment:', updateError);
      // Don't fail the request since the transfer succeeded
    }

    // Update contract payment status
    await supabase
      .from('contract_payments')
      .update({ status: 'released' })
      .eq('contract_id', contractId)
      .eq('status', 'funded');

    // Update contract status to completed if fully released
    if (releaseAmount === parseFloat(escrowPayment.amount.toString())) {
      await supabase
        .from('contracts')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', contractId);
    }

    return NextResponse.json({
      success: true,
      transfer_id: transfer.id,
      amount_released: releaseAmount,
      freelancer_account: freelancerProfile.stripe_connect_account_id,
      freelancer_name: freelancerProfile.display_name,
      transfer_status: transfer.status || 'pending',
      message: `Successfully released $${releaseAmount.toFixed(2)} to ${freelancerProfile.display_name}`,
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

    // Get escrow payments for this contract
    const { data: escrowPayments, error: paymentsError } = await supabase
      .from('escrow_payments')
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false });

    if (paymentsError) {
      return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
    }

    const releaseStatus = {
      can_release: escrowPayments?.some(p => p.status === 'funded') || false,
      released_payments: escrowPayments?.filter(p => p.status === 'released') || [],
      funded_payments: escrowPayments?.filter(p => p.status === 'funded') || [],
      total_released: escrowPayments
        ?.filter(p => p.status === 'released')
        .reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0) || 0,
      total_held: escrowPayments
        ?.filter(p => p.status === 'funded')
        .reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0) || 0,
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