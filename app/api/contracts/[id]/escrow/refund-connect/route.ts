import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ensureUserProfile } from '@/utils/profile-helpers';
import { validateRequestBody } from '@/utils/security/validation';
import { z } from 'zod';

const refundSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
  amount: z.number().positive().optional(),
  milestone_id: z.string().uuid().optional(),
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

    // Check if user is the client (who can request refunds)
    const clientParty = contract.contract_parties.find(
      (party: any) => party.role === 'client'
    );
    
    if (!clientParty || clientParty.user_id !== user.id) {
      return NextResponse.json({ 
        error: 'Only the client can request refunds' 
      }, { status: 403 });
    }

    // Validate contract status
    if (!contract.is_funded) {
      return NextResponse.json({ 
        error: 'Contract is not funded, no refund needed' 
      }, { status: 400 });
    }

    // Check if contract is in a state that allows refunds
    const refundableStates = ['active', 'pending_delivery', 'in_review', 'revision_requested', 'cancelled', 'disputed'];
    if (!refundableStates.includes(contract.status)) {
      return NextResponse.json({ 
        error: 'Contract is not in a state that allows refunds' 
      }, { status: 400 });
    }

    // Validate request body
    const body = await request.json();
    const validatedData = validateRequestBody(refundSchema, body);

    // Get escrow payment records for this contract
    const { data: escrowPayments, error: escrowError } = await supabase
      .from('escrow_payments')
      .select('*')
      .eq('contract_id', resolvedParams.id)
      .in('status', ['funded', 'held'])
      .order('created_at', { ascending: true });

    if (escrowError) {
      console.error('Error fetching escrow payments:', escrowError);
      return NextResponse.json({ error: 'Failed to fetch escrow payments' }, { status: 500 });
    }

    if (!escrowPayments || escrowPayments.length === 0) {
      return NextResponse.json({ 
        error: 'No funded escrow payments found for this contract' 
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

    // Calculate refund amount - ONLY the contract amount
    const refundAmount = validatedData.amount || targetPayment.amount;

    if (refundAmount > targetPayment.amount) {
      return NextResponse.json({ 
        error: 'Refund amount cannot exceed contract amount' 
      }, { status: 400 });
    }

    // Create Stripe instance
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-07-30.basil',
    });
    
    try {
      // For Stripe Connect's separate charges and transfers model:
      // 1. If no transfer has been made yet, we can refund the original charge
      // 2. If transfer was made, we need to reverse the transfer first, then refund
      
      // Check if there are any transfers made for this payment
      const { data: releasedPayments } = await supabase
        .from('escrow_payments')
        .select('*')
        .eq('contract_id', resolvedParams.id)
        .eq('status', 'released');

      let transferReversal = null;

      if (releasedPayments && releasedPayments.length > 0) {
        // If funds were already transferred to freelancer, we need to reverse the transfer first
        const releasedPayment = releasedPayments.find(p => p.stripe_transfer_id);
        
        if (releasedPayment && releasedPayment.stripe_transfer_id) {
          // Reverse the transfer to get funds back to platform account
          transferReversal = await stripe.transfers.createReversal(
            releasedPayment.stripe_transfer_id,
            {
              amount: Math.round(refundAmount * 100), // Amount to reverse in cents
              metadata: {
                contract_id: resolvedParams.id,
                escrow_payment_id: targetPayment.id,
                refund_reason: validatedData.reason,
                requested_by: user.id,
              },
            }
          );
        }
      }

      // Now create the refund to the original payment method
      if (!targetPayment.stripe_payment_intent_id) {
        return NextResponse.json({ 
          error: 'No payment intent found for this escrow payment' 
        }, { status: 400 });
      }

      // Create refund - only refund the contract amount, platform keeps fees
      const refund = await stripe.refunds.create({
        payment_intent: targetPayment.stripe_payment_intent_id,
        amount: Math.round(refundAmount * 100), // Convert to cents
        reason: 'requested_by_customer',
        metadata: {
          contract_id: resolvedParams.id,
          escrow_payment_id: targetPayment.id,
          refund_amount: refundAmount.toString(),
          refund_reason: validatedData.reason,
          requested_by: user.id,
          transfer_reversal_id: transferReversal?.id || '',
        },
      });

      // Update escrow payment status
      const { error: updateError } = await supabase
        .from('escrow_payments')
        .update({
          status: 'refunded',
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetPayment.id);

      if (updateError) {
        console.error('Error updating escrow payment:', updateError);
        return NextResponse.json({ error: 'Failed to update escrow payment' }, { status: 500 });
      }

      // Create contract payment record for the refund
      const { error: paymentError } = await supabase
        .from('contract_payments')
        .insert({
          contract_id: resolvedParams.id,
          user_id: user.id,
          amount: refundAmount,
          status: 'completed',
          payment_type: 'refund',
          stripe_payment_id: refund.id,
          metadata: {
            escrow_payment_id: targetPayment.id,
            refund_id: refund.id,
            refund_reason: validatedData.reason,
            requested_by: user.id,
            transfer_reversal_id: transferReversal?.id || '',
            payment_flow: 'stripe_connect_refund',
          },
        });

      if (paymentError) {
        console.error('Error creating contract payment:', paymentError);
        // Don't fail the request, just log the error
      }

      // Update contract status if all payments are refunded
      const { data: remainingPayments } = await supabase
        .from('escrow_payments')
        .select('*')
        .eq('contract_id', resolvedParams.id)
        .in('status', ['funded', 'held']);

      if (!remainingPayments || remainingPayments.length === 0) {
        // All payments refunded, mark contract as cancelled
        const { error: contractUpdateError } = await supabase
          .from('contracts')
          .update({
            status: 'cancelled',
            is_funded: false,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', resolvedParams.id);

        if (contractUpdateError) {
          console.error('Error updating contract status:', contractUpdateError);
        }
      }

      // Get freelancer for notification
      const freelancerParty = contract.contract_parties.find(
        (party: any) => party.role === 'freelancer'
      );

      // Create notification for freelancer
      if (freelancerParty) {
        const { error: notificationError } = await supabase
          .from('contract_notifications')
          .insert({
            contract_id: resolvedParams.id,
            user_id: freelancerParty.user_id,
            notification_type: 'payment_refunded',
            title: 'Payment Refunded',
            message: `Payment of $${refundAmount.toFixed(2)} has been refunded for contract ${contract.contract_number}. Reason: ${validatedData.reason}`,
            metadata: {
              amount: refundAmount,
              refund_id: refund.id,
              reason: validatedData.reason,
              requested_by: user.id,
              transfer_reversal_id: transferReversal?.id || '',
            },
          });

        if (notificationError) {
          console.error('Error creating notification:', notificationError);
        }
      }

      return NextResponse.json({
        success: true,
        refund: {
          id: refund.id,
          amount: refundAmount,
          currency: contract.currency,
          status: refund.status,
          reason: validatedData.reason,
        },
        transfer_reversal: transferReversal ? {
          id: transferReversal.id,
          amount: transferReversal.amount / 100, // Convert back from cents
          status: (transferReversal as any).status,
        } : null,
        escrow_payment: {
          id: targetPayment.id,
          status: 'refunded',
          refunded_at: new Date().toISOString(),
        },
        message: `Refund of $${refundAmount.toFixed(2)} has been processed. ${transferReversal ? 'Transfer was reversed and ' : ''}Funds will be returned to your original payment method within 5-10 business days.`,
      });

    } catch (stripeError: any) {
      console.error('Stripe refund error:', stripeError);
      return NextResponse.json({ 
        error: 'Failed to create refund',
        details: stripeError.message || 'Stripe refund failed'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Escrow refund error:', error);
    return NextResponse.json({ 
      error: 'Failed to process refund',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}