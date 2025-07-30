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
      console.log('Authentication failed:', authError || 'No user found');
      return NextResponse.json({ 
        error: 'Unauthorized',
        details: 'You must be logged in to fund a contract'
      }, { status: 401 });
    }

    console.log(`[Fund Request] User ${user.id} requesting to fund contract ${contractId}`);

    // Debug: Check if we can access contracts at all
    const { data: allContracts, error: allContractsError } = await supabase
      .from('contracts')
      .select('id, client_id, freelancer_id, creator_id')
      .limit(5);
    
    console.log('User can access contracts:', allContracts?.length || 0, 'Error:', allContractsError);

    // Get contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      console.error('Contract fetch error:', contractError);
      
      // If PGRST116 (no rows returned), it could be due to RLS policies
      if (contractError?.code === 'PGRST116') {
        return NextResponse.json({ 
          error: 'Contract not found or access denied',
          details: 'You must be a party to this contract to access it'
        }, { status: 404 });
      }
      
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Get contract parties
    const { data: parties, error: partiesError } = await supabase
      .from('contract_parties')
      .select('user_id, role, status')
      .eq('contract_id', contractId);

    if (partiesError || !parties || parties.length === 0) {
      console.error('Parties fetch error:', partiesError);
      return NextResponse.json({ error: 'Contract parties not found' }, { status: 404 });
    }

    // Find client and freelancer
    const clientParty = parties.find(p => p.role === 'client');
    const freelancerParty = parties.find(p => p.role === 'freelancer');

    if (!clientParty || !freelancerParty) {
      return NextResponse.json({ 
        error: 'Contract must have both client and freelancer' 
      }, { status: 400 });
    }

    // Verify user is the client
    if (clientParty.user_id !== user.id) {
      return NextResponse.json({ 
        error: 'Only the client can fund the contract' 
      }, { status: 403 });
    }

    // Check contract status
    if (contract.status !== 'pending_funding') {
      return NextResponse.json({ 
        error: `Contract status must be pending_funding, current: ${contract.status}` 
      }, { status: 400 });
    }

    // Get freelancer profile for Stripe Connect account
    const { data: freelancerProfile, error: freelancerError } = await supabase
      .from('profiles')
      .select('id, display_name, stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled')
      .eq('id', freelancerParty.user_id)
      .single();

    if (freelancerError || !freelancerProfile) {
      return NextResponse.json({ error: 'Freelancer profile not found' }, { status: 404 });
    }

    // Check if freelancer has Stripe Connect set up
    if (!freelancerProfile.stripe_connect_account_id) {
      return NextResponse.json({ 
        error: 'Freelancer has not set up payment account. They need to complete Stripe Connect onboarding first.',
        fallback_required: true
      }, { status: 400 });
    }

    if (!freelancerProfile.stripe_connect_charges_enabled || !freelancerProfile.stripe_connect_payouts_enabled) {
      return NextResponse.json({ 
        error: 'Freelancer payment account is not fully verified. They need to complete verification first.',
        fallback_required: true
      }, { status: 400 });
    }

    // Get client profile for subscription tier
    const { data: clientProfile, error: clientError } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();

    if (clientError || !clientProfile) {
      return NextResponse.json({ error: 'Client profile not found' }, { status: 404 });
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

    // Get request body for URLs
    const body = await request.json();
    const { success_url, cancel_url } = body;
    
    const baseUrl = new URL(request.url).origin;

    // Create Stripe Checkout Session for Separate Charges and Transfers
    // This charges the client's card to the platform account, then we transfer to freelancer later
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: (contract.currency || 'USD').toLowerCase(),
            product_data: {
              name: `Contract: ${contract.title}`,
              description: `Escrow funding for contract ${contract.contract_number}`,
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
        freelancer_id: freelancerParty.user_id,
        freelancer_stripe_account: freelancerProfile.stripe_connect_account_id,
        contract_amount: contractAmount.toString(),
        platform_fee: platformFee.toString(),
        stripe_fee: stripeFee.toString(),
        total_charge: totalCharge.toString(),
        payment_flow: 'separate_charges_transfers',
        escrow_type: 'stripe_connect',
      },
    });

    // Create escrow payment record
    const { data: escrowPayment, error: escrowError } = await supabase
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

    // Also create contract payment record for compatibility
    await supabase
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
          freelancer_stripe_account: freelancerProfile.stripe_connect_account_id,
          payment_flow: 'separate_charges_transfers',
          platform_fee: platformFee,
          stripe_fee: stripeFee,
          contract_amount: contractAmount,
        },
      });

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
      freelancer_account: freelancerProfile.stripe_connect_account_id,
      message: 'Stripe Connect escrow funding session created successfully',
    });

  } catch (error) {
    console.error('Stripe Connect funding error:', error);
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

// GET method to check funding status
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

    const latestPayment = escrowPayments?.[0];
    const fundingStatus = {
      is_funded: latestPayment?.status === 'funded',
      status: latestPayment?.status || 'none',
      amount: latestPayment?.amount || 0,
      funded_at: latestPayment?.funded_at,
      payments: escrowPayments || [],
    };

    return NextResponse.json({
      success: true,
      contract_id: contractId,
      funding_status: fundingStatus,
    });

  } catch (error) {
    console.error('Funding status fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}