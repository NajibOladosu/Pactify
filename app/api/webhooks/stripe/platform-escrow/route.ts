import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

// Use service role client for webhooks
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature')!;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log(`[Platform Escrow Webhook] Received event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        if (session.metadata?.escrow_type === 'platform_escrow') {
          await handleEscrowFunding(session);
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        
        if (paymentIntent.metadata?.payment_flow === 'platform_holds_funds') {
          await handlePaymentSuccess(paymentIntent);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailed(paymentIntent);
        break;
      }

      default:
        console.log(`[Platform Escrow Webhook] Unhandled event type: ${event.type}`);
        break;
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function handleEscrowFunding(session: Stripe.Checkout.Session) {
  try {
    const contractId = session.metadata?.contract_id;
    if (!contractId) return;

    console.log(`[Escrow Funding] Processing funding for contract ${contractId}`);

    // Update escrow payment status to funded
    const { error: escrowError } = await supabase
      .from('escrow_payments')
      .update({
        status: 'funded',
        funded_at: new Date().toISOString(),
        stripe_payment_intent_id: session.payment_intent,
      })
      .eq('contract_id', contractId)
      .eq('status', 'pending');

    if (escrowError) {
      console.error('Failed to update escrow payment:', escrowError);
      return;
    }

    // Update contract payment status
    await supabase
      .from('contract_payments')
      .update({ status: 'funded' })
      .eq('contract_id', contractId)
      .eq('status', 'pending');

    // Update contract status to active (funded and ready for work)
    await supabase
      .from('contracts')
      .update({ status: 'active' })
      .eq('id', contractId)
      .eq('status', 'pending_funding');

    // Get contract details for notifications
    const { data: contract } = await supabase
      .from('contracts')
      .select('title, client_id, freelancer_id')
      .eq('id', contractId)
      .single();

    if (contract) {
      // Notify client
      await supabase
        .from('notifications')
        .insert({
          user_id: contract.client_id,
          type: 'escrow_funded',
          title: 'Escrow Funded Successfully',
          message: `Your escrow payment for "${contract.title}" has been funded. The freelancer can now begin work.`,
          is_read: false,
          related_entity_type: 'contract',
          related_entity_id: contractId,
        });

      // Notify freelancer
      await supabase
        .from('notifications')
        .insert({
          user_id: contract.freelancer_id,
          type: 'contract_funded',
          title: 'Contract Funded - Work Can Begin',
          message: `The contract "${contract.title}" has been funded. You can now begin work. Payment will be released upon completion.`,
          is_read: false,
          related_entity_type: 'contract',
          related_entity_id: contractId,
        });
    }

    console.log(`[Escrow Funding] Successfully processed funding for contract ${contractId}`);

  } catch (error) {
    console.error('Error processing escrow funding:', error);
  }
}

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  try {
    console.log(`[Payment Success] Processing payment ${paymentIntent.id}`);

    // Update escrow payment status
    const { error } = await supabase
      .from('escrow_payments')
      .update({
        status: 'funded',
        funded_at: new Date().toISOString(),
      })
      .eq('stripe_payment_intent_id', paymentIntent.id)
      .eq('status', 'pending');

    if (error) {
      console.error('Failed to update payment success:', error);
    }

  } catch (error) {
    console.error('Error processing payment success:', error);
  }
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  try {
    console.log(`[Payment Failed] Processing failed payment ${paymentIntent.id}`);

    // Update escrow payment status to failed
    const { error } = await supabase
      .from('escrow_payments')
      .update({
        status: 'failed',
      })
      .eq('stripe_payment_intent_id', paymentIntent.id);

    if (error) {
      console.error('Failed to update payment failure:', error);
    }

    // Get contract details for notification
    const { data: escrowPayment } = await supabase
      .from('escrow_payments')
      .select('contract_id')
      .eq('stripe_payment_intent_id', paymentIntent.id)
      .single();

    if (escrowPayment) {
      const { data: contract } = await supabase
        .from('contracts')
        .select('title, client_id')
        .eq('id', escrowPayment.contract_id)
        .single();

      if (contract) {
        // Notify client of payment failure
        await supabase
          .from('notifications')
          .insert({
            user_id: contract.client_id,
            type: 'payment_failed',
            title: 'Payment Failed',
            message: `Payment for "${contract.title}" failed. Please try funding the contract again.`,
            is_read: false,
            related_entity_type: 'contract',
            related_entity_id: escrowPayment.contract_id,
          });
      }
    }

  } catch (error) {
    console.error('Error processing payment failure:', error);
  }
}