import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.text();
    const signature = request.headers.get('stripe-signature')!;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log(`[Stripe Connect Webhook] Received event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        if (session.metadata?.payment_flow === 'separate_charges_transfers') {
          await handleEscrowFunding(session, supabase);
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        
        if (paymentIntent.metadata?.escrow_type === 'stripe_connect') {
          await handlePaymentSuccess(paymentIntent, supabase);
        }
        break;
      }

      case 'transfer.created': {
        const transfer = event.data.object as Stripe.Transfer;
        await handleTransferCreated(transfer, supabase);
        break;
      }

      case 'transfer.paid': {
        const transfer = event.data.object as Stripe.Transfer;
        await handleTransferPaid(transfer, supabase);
        break;
      }

      case 'transfer.failed': {
        const transfer = event.data.object as Stripe.Transfer;
        await handleTransferFailed(transfer, supabase);
        break;
      }

      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        await handleAccountUpdated(account, supabase);
        break;
      }

      default:
        console.log(`[Stripe Connect Webhook] Unhandled event type: ${event.type}`);
        break;
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function handleEscrowFunding(session: Stripe.Checkout.Session, supabase: any) {
  try {
    const contractId = session.metadata?.contract_id;
    if (!contractId) return;

    console.log(`[Escrow Funding] Processing funding for contract ${contractId}`);

    // Update escrow payment status
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

    console.log(`[Escrow Funding] Successfully processed funding for contract ${contractId}`);

  } catch (error) {
    console.error('Error processing escrow funding:', error);
  }
}

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent, supabase: any) {
  try {
    console.log(`[Payment Success] Processing payment ${paymentIntent.id}`);

    // Update any related records based on payment intent
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

async function handleTransferCreated(transfer: Stripe.Transfer, supabase: any) {
  try {
    const contractId = transfer.metadata?.contract_id;
    if (!contractId) return;

    console.log(`[Transfer Created] Processing transfer ${transfer.id} for contract ${contractId}`);

    // Log the transfer creation
    await supabase
      .from('escrow_payments')
      .update({
        stripe_transfer_id: transfer.id,
      })
      .eq('contract_id', contractId)
      .eq('status', 'funded');

  } catch (error) {
    console.error('Error processing transfer creation:', error);
  }
}

async function handleTransferPaid(transfer: Stripe.Transfer, supabase: any) {
  try {
    const contractId = transfer.metadata?.contract_id;
    if (!contractId) return;

    console.log(`[Transfer Paid] Processing successful transfer ${transfer.id} for contract ${contractId}`);

    // Update escrow payment to released
    await supabase
      .from('escrow_payments')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
      })
      .eq('stripe_transfer_id', transfer.id);

    // Update contract to completed if this was the final payment
    await supabase
      .from('contracts')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', contractId)
      .in('status', ['active', 'pending_completion']);

  } catch (error) {
    console.error('Error processing transfer paid:', error);
  }
}

async function handleTransferFailed(transfer: Stripe.Transfer, supabase: any) {
  try {
    const contractId = transfer.metadata?.contract_id;
    if (!contractId) return;

    console.log(`[Transfer Failed] Processing failed transfer ${transfer.id} for contract ${contractId}`);

    // Mark the transfer as failed but keep the escrow funded
    // This allows for retry or manual intervention
    await supabase
      .from('escrow_payments')
      .update({
        status: 'transfer_failed',
      })
      .eq('stripe_transfer_id', transfer.id);

    // Could also notify admins or users about the failed transfer

  } catch (error) {
    console.error('Error processing transfer failure:', error);
  }
}

async function handleAccountUpdated(account: Stripe.Account, supabase: any) {
  try {
    console.log(`[Account Updated] Processing account update for ${account.id}`);

    // Update the profile with the latest account capabilities
    const { error } = await supabase
      .from('profiles')
      .update({
        stripe_connect_charges_enabled: account.charges_enabled,
        stripe_connect_payouts_enabled: account.payouts_enabled,
        stripe_connect_onboarded: account.details_submitted && account.charges_enabled,
      })
      .eq('stripe_connect_account_id', account.id);

    if (error) {
      console.error('Failed to update profile with account status:', error);
    }

  } catch (error) {
    console.error('Error processing account update:', error);
  }
}