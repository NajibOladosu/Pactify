import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ensureUserProfile } from '@/utils/profile-helpers';
import { validateRequestBody } from '@/utils/security/validation';
import { withFullSecurity } from '@/utils/security/middleware';
import { z } from 'zod';
import type { User } from '@supabase/supabase-js';

const fundEscrowSchema = z.object({
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
});

async function handleFundEscrow(
  request: NextRequest,
  user: User
) {
  const resolvedParams = await request.nextUrl.pathname.split('/')[3]; // Extract contract ID
  const contractId = resolvedParams;
  
  try {
    const supabase = await createClient();

    // Ensure user profile exists
    const profile = await ensureUserProfile(user.id);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Get contract and validate access
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        *,
        contract_parties!inner (
          user_id,
          role,
          status
        )
      `)
      .eq('id', resolvedParams.id)
      .single();

    if (contractError || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Check if user is the client (payer)
    const clientParty = contract.contract_parties.find(
      (party: any) => party.role === 'client'
    );
    
    if (!clientParty || clientParty.user_id !== user.id) {
      return NextResponse.json({ 
        error: 'Only the client can fund the escrow' 
      }, { status: 403 });
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

    // Get freelancer party to check for connected account
    const freelancerParty = contract.contract_parties.find(
      (party: any) => party.role === 'freelancer'
    );
    
    if (!freelancerParty) {
      return NextResponse.json({ 
        error: 'Freelancer not found for this contract' 
      }, { status: 400 });
    }

    // Check if freelancer has a connected account (required for escrow)
    const { data: connectedAccount, error: accountError } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('user_id', freelancerParty.user_id)
      .single();

    if (accountError || !connectedAccount) {
      return NextResponse.json({ 
        error: 'Freelancer must set up payment account before contract can be funded',
        action_required: 'freelancer_kyc_setup'
      }, { status: 400 });
    }

    // Validate contract amount
    if (!contract.total_amount || contract.total_amount <= 0) {
      return NextResponse.json({ 
        error: 'Contract amount must be greater than 0' 
      }, { status: 400 });
    }

    // Validate request body
    const body = await request.json();
    const validatedData = validateRequestBody(fundEscrowSchema, body);

    // Calculate fees
    const contractAmount = parseFloat(contract.total_amount.toString());
    
    // Get platform fee based on subscription tier
    const platformFeePercentage = getPlatformFeePercentage(profile.subscription_tier);
    const platformFee = contractAmount * (platformFeePercentage / 100);
    
    // Stripe processing fee: 2.9% + $0.30
    const stripeFee = (contractAmount + platformFee) * 0.029 + 0.30;
    
    // Total amount to charge client
    const totalCharge = contractAmount + platformFee + stripeFee;

    // Create Stripe instance
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-07-30.basil',
    });
    
    const baseUrl = new URL(request.url).origin;
    
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
      success_url: validatedData.success_url || `${baseUrl}/dashboard/contracts/${resolvedParams.id}/funded`,
      cancel_url: validatedData.cancel_url || `${baseUrl}/dashboard/contracts/${resolvedParams.id}`,
      customer_email: user.email,
      metadata: {
        contract_id: resolvedParams.id,
        user_id: user.id,
        contract_amount: contractAmount.toString(),
        platform_fee: platformFee.toString(),
        stripe_fee: stripeFee.toString(),
        total_charge: totalCharge.toString(),
        type: 'escrow_funding',
      },
    });

    // Create escrow payment record (keep existing table for compatibility)
    const { data: escrowPayment, error: escrowError } = await supabase
      .from('escrow_payments')
      .insert({
        contract_id: resolvedParams.id,
        amount: contractAmount,
        platform_fee: platformFee,
        stripe_fee: stripeFee,
        total_charged: totalCharge,
        stripe_payment_intent_id: session.payment_intent,
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

    // Create escrow ledger entry (new KYC-compliant table)
    // Record it in your escrow_ledger - this will be used for KYC-gated releases
    const { data: escrowLedgerEntry, error: ledgerError } = await supabase
      .from('escrow_ledger')
      .insert({
        payment_intent_id: session.payment_intent as string,
        buyer_user_id: user.id,
        payee_account_id: connectedAccount.id,
        amount: Math.round(contractAmount * 100), // store in smallest currency unit (cents)
        currency: contract.currency,
        platform_fee: Math.round(platformFee * 100),
        status: 'held', // held until KYC verification passes and work is complete
        contract_id: resolvedParams.id,
        description: `Escrow funding for contract ${contract.contract_number}`,
        metadata: {
          contract_number: contract.contract_number,
          total_charged: totalCharge,
          stripe_fee: stripeFee,
          escrow_payment_id: escrowPayment.id,
        },
      })
      .select()
      .single();

    if (ledgerError) {
      console.error('Error creating escrow ledger entry:', ledgerError);
      return NextResponse.json({ 
        error: 'Failed to create escrow ledger entry' 
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
          escrow_ledger_id: escrowLedgerEntry.id,
          contract_amount: contractAmount,
          platform_fee: platformFee,
          stripe_fee: stripeFee,
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
      escrowLedgerId: escrowLedgerEntry.id,
      amounts: {
        contract: contractAmount,
        platform_fee: platformFee,
        stripe_fee: stripeFee,
        total: totalCharge,
      },
      escrow: {
        id: escrowLedgerEntry.id,
        status: 'held',
        description: escrowLedgerEntry.description,
      },
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

// Apply comprehensive security to this critical payment endpoint
export const POST = withFullSecurity(handleFundEscrow);