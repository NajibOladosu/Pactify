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
      return NextResponse.json({ 
        error: 'Unauthorized',
        details: 'You must be logged in to fund a contract'
      }, { status: 401 });
    }

    console.log(`[Escrow Fund] User ${user.id} funding contract ${contractId}`);

    // Use service role client to bypass RLS issues
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
      console.error('Contract fetch error:', contractError);
      return NextResponse.json({ 
        error: 'Contract not found',
        details: 'Contract does not exist'
      }, { status: 404 });
    }
    
    // Manual authorization - user must be client, freelancer, or creator
    if (contract.client_id !== user.id && 
        contract.freelancer_id !== user.id && 
        contract.creator_id !== user.id) {
      return NextResponse.json({ 
        error: 'Access denied',
        details: 'You are not authorized to access this contract'
      }, { status: 403 });
    }

    // Verify user is the client (only client can fund)
    if (contract.client_id !== user.id) {
      return NextResponse.json({ 
        error: 'Only the client can fund the contract' 
      }, { status: 403 });
    }

    // Ensure we have both client and freelancer IDs
    if (!contract.client_id || !contract.freelancer_id) {
      return NextResponse.json({ 
        error: 'Contract must have both client and freelancer assigned' 
      }, { status: 400 });
    }

    // Check contract status
    if (contract.status !== 'pending_funding') {
      return NextResponse.json({ 
        error: `Contract status must be pending_funding, current: ${contract.status}` 
      }, { status: 400 });
    }

    // Check if already funded
    const { data: existingEscrow } = await serviceClient
      .from('escrow_payments')
      .select('*')
      .eq('contract_id', contractId)
      .in('status', ['funded', 'pending'])
      .single();

    if (existingEscrow) {
      return NextResponse.json({ 
        error: 'Contract is already funded or has pending payment' 
      }, { status: 400 });
    }

    // Get client profile for subscription tier
    const { data: clientProfile, error: clientError } = await serviceClient
      .from('profiles')
      .select('subscription_tier, display_name')
      .eq('id', user.id)
      .single();

    if (clientError || !clientProfile) {
      return NextResponse.json({ error: 'Client profile not found' }, { status: 404 });
    }

    // Get freelancer profile for display
    const { data: freelancerProfile, error: freelancerError } = await serviceClient
      .from('profiles')
      .select('id, display_name, email')
      .eq('id', contract.freelancer_id)
      .single();

    if (freelancerError || !freelancerProfile) {
      console.error('Freelancer profile lookup error:', freelancerError);
      console.log('Looking for freelancer_id:', contract.freelancer_id);
      return NextResponse.json({ 
        error: 'Freelancer profile not found',
        details: `Unable to find profile for freelancer ID: ${contract.freelancer_id}`
      }, { status: 404 });
    }

    // Calculate fees based on subscription tier
    const contractAmount = parseFloat(contract.total_amount?.toString() || '0');
    if (contractAmount <= 0) {
      return NextResponse.json({ error: 'Invalid contract amount' }, { status: 400 });
    }

    // Platform fee based on subscription tier
    const platformFeeRate = getPlatformFeeRate(clientProfile.subscription_tier);
    const platformFee = contractAmount * (platformFeeRate / 100);
    
    // Stripe processing fee: 2.9% + $0.30
    const stripeFee = (contractAmount + platformFee) * 0.029 + 0.30;
    const totalCharge = contractAmount + platformFee + stripeFee;

    // Get request body
    const body = await request.json();
    const { success_url, cancel_url } = body;
    
    const baseUrl = new URL(request.url).origin;

    // Create Stripe Checkout Session for PLATFORM ESCROW
    // Money goes to platform account and is held there
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: (contract.currency || 'USD').toLowerCase(),
            product_data: {
              name: `Escrow: ${contract.title}`,
              description: `Escrow payment for contract ${contract.contract_number}. Funds will be held securely until work is completed.`,
            },
            unit_amount: Math.round(contractAmount * 100),
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: (contract.currency || 'USD').toLowerCase(),
            product_data: {
              name: 'Platform Fee',
              description: `Platform service fee (${platformFeeRate}%)`,
            },
            unit_amount: Math.round(platformFee * 100),
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: (contract.currency || 'USD').toLowerCase(),
            product_data: {
              name: 'Processing Fee',
              description: 'Payment processing fee',
            },
            unit_amount: Math.round(stripeFee * 100),
          },
          quantity: 1,
        },
      ],
      success_url: success_url || `${baseUrl}/dashboard/contracts/${contractId}?funded=true`,
      cancel_url: cancel_url || `${baseUrl}/dashboard/contracts/${contractId}`,
      customer_email: user.email,
      metadata: {
        contract_id: contractId,
        client_id: user.id,
        freelancer_id: contract.freelancer_id,
        contract_amount: contractAmount.toString(),
        platform_fee: platformFee.toString(),
        stripe_fee: stripeFee.toString(),
        total_charge: totalCharge.toString(),
        escrow_type: 'platform_escrow',
        payment_flow: 'platform_holds_funds',
      },
    });

    // Create escrow payment record
    const { data: escrowPayment, error: escrowError } = await serviceClient
      .from('escrow_payments')
      .insert({
        contract_id: contractId,
        amount: contractAmount,
        platform_fee: platformFee,
        stripe_fee: stripeFee,
        total_charged: totalCharge,
        stripe_payment_intent_id: session.payment_intent || session.id,
        status: 'pending',
      })
      .select()
      .single();

    if (escrowError) {
      console.error('Escrow payment creation error:', escrowError);
      return NextResponse.json({ 
        error: 'Failed to create escrow payment record' 
      }, { status: 500 });
    }

    // Create contract payment record for compatibility
    const { error: paymentError } = await serviceClient
      .from('contract_payments')
      .insert({
        contract_id: contractId,
        user_id: user.id,
        amount: totalCharge,
        currency: contract.currency || 'USD',
        status: 'pending',
        payment_type: 'escrow',
        stripe_payment_id: session.id,
        metadata: {
          escrow_payment_id: escrowPayment.id,
          payment_flow: 'platform_escrow',
          platform_fee: platformFee,
          stripe_fee: stripeFee,
          contract_amount: contractAmount,
          freelancer_id: contract.freelancer_id,
          freelancer_email: freelancerProfile.email,
        },
      });

    if (paymentError) {
      console.error('Contract payment creation error:', paymentError);
      // Don't fail the request, just log the error
    }

    return NextResponse.json({
      success: true,
      sessionUrl: session.url,
      sessionId: session.id,
      paymentId: escrowPayment.id,
      amounts: {
        contract: contractAmount,
        platform_fee: platformFee,
        stripe_fee: stripeFee,
        total: totalCharge,
      },
      escrow_details: {
        type: 'platform_escrow',
        held_by: 'Pactify Platform',
        freelancer_name: freelancerProfile.display_name,
        release_method: 'manual_release_or_bank_transfer',
      },
      message: 'Platform escrow funding session created. Funds will be held securely until work completion.',
    });

  } catch (error) {
    console.error('Escrow funding error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

function getPlatformFeeRate(subscriptionTier: string): number {
  switch (subscriptionTier) {
    case 'business':
      return 5.0;
    case 'professional':
      return 7.5;
    case 'free':
    default:
      return 10.0;
  }
}

// GET method to check escrow status
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

    // Get escrow payments for this contract
    const { data: escrowPayments, error: paymentsError } = await serviceClient
      .from('escrow_payments')
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false });

    if (paymentsError) {
      return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
    }

    const latestPayment = escrowPayments?.[0];
    const escrowStatus = {
      is_funded: latestPayment?.status === 'funded',
      status: latestPayment?.status || 'none',
      amount: latestPayment?.amount || 0,
      funded_at: latestPayment?.funded_at,
      can_release: latestPayment?.status === 'funded',
      payments: escrowPayments || [],
      escrow_type: 'platform_escrow',
    };

    return NextResponse.json({
      success: true,
      contract_id: contractId,
      escrow_status: escrowStatus,
    });

  } catch (error) {
    console.error('Escrow status fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}