import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(
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

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
      
    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
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

    // Get contract parties separately
    const { data: contractParties, error: partiesError } = await supabase
      .from('contract_parties')
      .select('user_id, role, status')
      .eq('contract_id', resolvedParams.id);

    if (partiesError || !contractParties) {
      return NextResponse.json({ 
        error: 'Failed to fetch contract parties' 
      }, { status: 500 });
    }

    // Check if user is the client (payer)
    const clientParty = contractParties.find(
      (party: any) => party.role === 'client'
    );
    
    if (!clientParty || clientParty.user_id !== user.id) {
      return NextResponse.json({ 
        error: 'Only the client can fund the escrow' 
      }, { status: 403 });
    }

    // Get freelancer party
    const freelancerParty = contractParties.find(
      (party: any) => party.role === 'freelancer'
    );
    
    if (!freelancerParty) {
      return NextResponse.json({ 
        error: 'Freelancer not found for this contract' 
      }, { status: 400 });
    }

    // Get freelancer profile to check Stripe Connect account
    const { data: freelancerProfile, error: freelancerError } = await supabase
      .from('profiles')
      .select('stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled')
      .eq('id', freelancerParty.user_id)
      .single();

    if (freelancerError || !freelancerProfile) {
      return NextResponse.json({ error: 'Freelancer profile not found' }, { status: 404 });
    }

    if (!freelancerProfile.stripe_connect_account_id) {
      return NextResponse.json({ 
        error: 'Freelancer has not set up payment account. They need to complete Stripe Connect onboarding first.' 
      }, { status: 400 });
    }

    if (!freelancerProfile.stripe_connect_charges_enabled || !freelancerProfile.stripe_connect_payouts_enabled) {
      return NextResponse.json({ 
        error: 'Freelancer payment account is not fully verified. They need to complete verification first.' 
      }, { status: 400 });
    }

    // Validate contract status
    if (contract.status !== 'signed' && contract.status !== 'pending_funding') {
      return NextResponse.json({ 
        error: 'Contract must be signed before funding' 
      }, { status: 400 });
    }

    // Check if already funded
    if (contract.is_funded) {
      return NextResponse.json({ 
        error: 'Contract is already funded' 
      }, { status: 400 });
    }

    // Validate contract amount
    if (!contract.total_amount || contract.total_amount <= 0) {
      return NextResponse.json({ 
        error: 'Contract amount must be greater than 0' 
      }, { status: 400 });
    }

    // Get request body
    const body = await request.json();
    const { success_url, cancel_url } = body;

    // Calculate fees
    const contractAmount = parseFloat(contract.total_amount.toString());
    
    // Get platform fee based on subscription tier
    const platformFeePercentage = getPlatformFeePercentage(profile.subscription_tier);
    const platformFee = contractAmount * (platformFeePercentage / 100);
    
    // Stripe processing fee: 2.9% + $0.30 (applied to total)
    const stripeFee = (contractAmount + platformFee) * 0.029 + 0.30;
    
    // Total amount to charge client
    const totalCharge = contractAmount + platformFee + stripeFee;

    // Create Stripe instance
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-07-30.basil',
    });
    
    const baseUrl = new URL(request.url).origin;
    
    // Use Stripe Connect's separate charges approach for escrow
    // Create checkout session on platform account, then transfer to freelancer later
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: contract.currency.toLowerCase(),
            product_data: {
              name: `Contract: ${contract.title}`,
              description: `Escrow funding for contract ${contract.contract_number}`,
            },
            unit_amount: Math.round(contractAmount * 100), // Convert to cents
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: contract.currency.toLowerCase(),
            product_data: {
              name: 'Platform Fee',
              description: `Platform fee (${platformFeePercentage}%)`,
            },
            unit_amount: Math.round(platformFee * 100),
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: contract.currency.toLowerCase(),
            product_data: {
              name: 'Processing Fee',
              description: 'Payment processing fee',
            },
            unit_amount: Math.round(stripeFee * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: success_url || `${baseUrl}/dashboard/contracts/${resolvedParams.id}/funded`,
      cancel_url: cancel_url || `${baseUrl}/dashboard/contracts/${resolvedParams.id}`,
      customer_email: user.email,
      metadata: {
        contract_id: resolvedParams.id,
        user_id: user.id,
        freelancer_stripe_account: freelancerProfile.stripe_connect_account_id,
        contract_amount: contractAmount.toString(),
        platform_fee: platformFee.toString(),
        stripe_fee: stripeFee.toString(),
        total_charge: totalCharge.toString(),
        type: 'escrow_funding',
        payment_flow: 'separate_charges_transfers',
      },
    });

    // Create escrow payment record
    const { data: escrowPayment, error: escrowError } = await supabase
      .from('escrow_payments')
      .insert({
        contract_id: resolvedParams.id,
        amount: contractAmount,
        platform_fee: platformFee,
        stripe_fee: stripeFee,
        total_charged: totalCharge,
        stripe_payment_intent_id: session.payment_intent || session.id,
        freelancer_stripe_account: freelancerProfile.stripe_connect_account_id,
        payment_flow: 'separate_charges_transfers',
        status: 'pending',
      })
      .select()
      .single();

    if (escrowError) {
      console.error('Error creating escrow payment:', escrowError);
      return NextResponse.json({ 
        error: 'Failed to create escrow payment record' 
      }, { status: 500 });
    }

    // Create contract payment record for compatibility
    const { error: paymentError } = await supabase
      .from('contract_payments')
      .insert({
        contract_id: resolvedParams.id,
        user_id: user.id,
        amount: totalCharge,
        status: 'pending',
        payment_type: 'escrow',
        stripe_payment_id: session.id,
        metadata: {
          escrow_payment_id: escrowPayment.id,
          freelancer_stripe_account: freelancerProfile.stripe_connect_account_id,
          contract_amount: contractAmount,
          platform_fee: platformFee,
          stripe_fee: stripeFee,
          payment_flow: 'separate_charges_transfers',
        },
      });

    if (paymentError) {
      console.error('Error creating contract payment:', paymentError);
      // Don't fail the request, just log the error
    }

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      sessionUrl: session.url,
      paymentId: escrowPayment.id,
      freelancer_account: freelancerProfile.stripe_connect_account_id,
      payment_flow: 'separate_charges_transfers',
      amounts: {
        contract: contractAmount,
        platform_fee: platformFee,
        stripe_fee: stripeFee,
        total: totalCharge,
      },
      message: 'Escrow funding session created. Funds will be held on platform until work is completed.',
    });

  } catch (error) {
    console.error('Escrow funding error:', error);
    return NextResponse.json({ 
      error: 'Failed to create escrow funding',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

function getPlatformFeePercentage(subscriptionTier: string): number {
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