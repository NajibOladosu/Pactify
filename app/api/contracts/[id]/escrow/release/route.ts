import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ensureUserProfile } from '@/utils/profile-helpers';
import { validateRequestBody } from '@/utils/security/validation';
import { z } from 'zod';

const releasePaymentSchema = z.object({
  milestone_id: z.string().uuid().optional(),
  amount: z.number().positive().optional(),
  reason: z.string().optional(),
});

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

    // Check if user is the client (payer) who can release payments
    const clientParty = contract.contract_parties.find(
      (party: any) => party.role === 'client'
    );
    
    if (!clientParty || clientParty.user_id !== user.id) {
      return NextResponse.json({ 
        error: 'Only the client can release escrow payments' 
      }, { status: 403 });
    }

    // Get freelancer party
    const freelancerParty = contract.contract_parties.find(
      (party: any) => party.role === 'freelancer'
    );
    
    if (!freelancerParty) {
      return NextResponse.json({ 
        error: 'Freelancer not found for this contract' 
      }, { status: 400 });
    }

    // Get freelancer's connected account from new KYC tables
    const { data: connectedAccount, error: accountError } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('user_id', freelancerParty.user_id)
      .single();

    if (accountError || !connectedAccount) {
      return NextResponse.json({ 
        error: 'Freelancer has not set up payment account' 
      }, { status: 400 });
    }

    // Create Stripe instance for account verification
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-06-20',
    });

    // *** KYC HARD GATE - The core verification logic ***
    // fetch escrow row -> get payee stripe_account_id & amount
    const payeeStripeAccountId = connectedAccount.stripe_account_id;
    
    // Re-fetch the connected account and enforce the gate
    const acct = await stripe.accounts.retrieve(payeeStripeAccountId);

    const transfersActive = acct.capabilities?.transfers === "active";
    const payoutsEnabled = Boolean((acct as any).payouts_enabled);
    
    if (!(transfersActive && payoutsEnabled)) {
      // populate reasons from requirements to show in UI
      const r = (acct as any).requirements;
      return NextResponse.json({
        ok: false,
        error: "kyc_not_verified",
        missing: r?.currently_due || [],
        past_due: r?.past_due || [],
        disabled_reason: r?.disabled_reason || null,
        message: "Freelancer account is not fully verified for payouts",
        verification_status: {
          transfers_active: transfersActive,
          payouts_enabled: payoutsEnabled,
          requirements_currently_due: r?.currently_due || [],
          requirements_past_due: r?.past_due || [],
          requirements_disabled_reason: r?.disabled_reason,
        }
      }, { status: 403 });
    }

    // Update our database with fresh account data
    await supabase
      .from('connected_accounts')
      .update({
        cap_transfers: acct.capabilities?.transfers || 'inactive',
        payouts_enabled: acct.payouts_enabled,
        charges_enabled: acct.charges_enabled,
        requirements_currently_due: acct.requirements?.currently_due || [],
        requirements_past_due: acct.requirements?.past_due || [],
        requirements_eventually_due: acct.requirements?.eventually_due || [],
        requirements_disabled_reason: acct.requirements?.disabled_reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectedAccount.id);

    // Validate contract status
    if (!contract.is_funded) {
      return NextResponse.json({ 
        error: 'Contract is not funded' 
      }, { status: 400 });
    }

    if (contract.status !== 'active' && contract.status !== 'pending_completion') {
      return NextResponse.json({ 
        error: 'Contract is not in a state that allows payment release' 
      }, { status: 400 });
    }

    // Validate request body
    const body = await request.json();
    const validatedData = validateRequestBody(releasePaymentSchema, body);

    // Get escrow ledger records for this contract
    const { data: escrowPayments, error: escrowError } = await supabase
      .from('escrow_ledger')
      .select('*')
      .eq('contract_id', resolvedParams.id)
      .eq('status', 'held')
      .order('created_at', { ascending: true });

    if (escrowError) {
      console.error('Error fetching escrow payments:', escrowError);
      return NextResponse.json({ error: 'Failed to fetch escrow payments' }, { status: 500 });
    }

    if (!escrowPayments || escrowPayments.length === 0) {
      return NextResponse.json({ 
        error: 'No held escrow payments found for this contract' 
      }, { status: 400 });
    }

    // If milestone_id is provided, find specific milestone payment
    let targetPayment = escrowPayments[0];
    if (validatedData.milestone_id) {
      const milestonePayment = escrowPayments.find(
        payment => payment.milestone_id === validatedData.milestone_id
      );
      if (!milestonePayment) {
        return NextResponse.json({ 
          error: 'Escrow payment not found for specified milestone' 
        }, { status: 404 });
      }
      targetPayment = milestonePayment;
    }

    // Calculate release amount (escrow_ledger stores amounts in smallest currency unit)
    const releaseAmount = validatedData.amount || (targetPayment.amount / 100); // Convert from cents to dollars
    const releaseAmountCents = validatedData.amount ? Math.round(validatedData.amount * 100) : targetPayment.amount;

    if (releaseAmountCents > targetPayment.amount) {
      return NextResponse.json({ 
        error: 'Release amount cannot exceed escrow amount' 
      }, { status: 400 });
    }
    
    try {
      // Passed -> release funds from platform balance
      const transfer = await stripe.transfers.create({
        amount: releaseAmountCents, // already in smallest currency unit
        currency: targetPayment.currency.toLowerCase(),
        destination: payeeStripeAccountId,
        transfer_group: `contract_${resolvedParams.id}`,
        metadata: {
          contract_id: resolvedParams.id,
          escrow_ledger_id: targetPayment.id,
          release_amount: releaseAmount.toString(),
          released_by: user.id,
          reason: validatedData.reason || 'Payment release',
        },
      });

      // mark escrow row released; store transfer.id
      const { error: updateError } = await supabase
        .from('escrow_ledger')
        .update({
          status: 'released',
          released_at: new Date().toISOString(),
          transfer_id: transfer.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetPayment.id);

      if (updateError) {
        console.error('Error updating escrow payment:', updateError);
        return NextResponse.json({ error: 'Failed to update escrow payment' }, { status: 500 });
      }

      // Create contract payment record for the release
      const { error: paymentError } = await supabase
        .from('contract_payments')
        .insert({
          contract_id: resolvedParams.id,
          user_id: user.id,
          amount: releaseAmount,
          status: 'completed',
          payment_type: 'release',
          stripe_payment_id: transfer.id,
          metadata: {
            escrow_ledger_id: targetPayment.id,
            transfer_id: transfer.id,
            freelancer_id: freelancerParty.user_id,
            released_by: user.id,
            reason: validatedData.reason || 'Payment release',
          },
        });

      if (paymentError) {
        console.error('Error creating contract payment:', paymentError);
        // Don't fail the request, just log the error
      }

      // Update contract status if all payments are released
      const { data: remainingPayments } = await supabase
        .from('escrow_ledger')
        .select('*')
        .eq('contract_id', resolvedParams.id)
        .eq('status', 'held');

      if (!remainingPayments || remainingPayments.length === 0) {
        // All payments released, mark contract as completed
        const { error: contractUpdateError } = await supabase
          .from('contracts')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', resolvedParams.id);

        if (contractUpdateError) {
          console.error('Error updating contract status:', contractUpdateError);
        }
      }

      // Create notification for freelancer
      const { error: notificationError } = await supabase
        .from('contract_notifications')
        .insert({
          contract_id: resolvedParams.id,
          user_id: freelancerParty.user_id,
          notification_type: 'payment_released',
          title: 'Payment Released',
          message: `Payment of $${releaseAmount.toFixed(2)} has been released for contract ${contract.contract_number}`,
          metadata: {
            amount: releaseAmount,
            transfer_id: transfer.id,
            released_by: user.id,
          },
        });

      if (notificationError) {
        console.error('Error creating notification:', notificationError);
      }

      return NextResponse.json({
        ok: true,
        transferId: transfer.id,
        transfer: {
          id: transfer.id,
          amount: releaseAmount,
          currency: targetPayment.currency,
          destination: payeeStripeAccountId,
          status: 'released',
        },
        escrow_ledger: {
          id: targetPayment.id,
          status: 'released',
          released_at: new Date().toISOString(),
        },
      });

    } catch (stripeError: any) {
      console.error('Stripe transfer error:', stripeError);
      return NextResponse.json({ 
        error: 'Failed to create payment transfer',
        details: stripeError.message || 'Stripe transfer failed'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Escrow release error:', error);
    return NextResponse.json({ 
      error: 'Failed to release escrow payment',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}