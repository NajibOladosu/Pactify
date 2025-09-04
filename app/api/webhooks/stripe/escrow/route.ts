import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
// Use Supabase Admin client for elevated privileges in webhooks
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Initialize Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
  typescript: true,
});

// Initialize Supabase Admin Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;

let supabaseAdmin: SupabaseClient | null = null;
if (supabaseUrl && supabaseServiceRole) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);
} else {
    throw new Error("Missing Supabase configuration for escrow webhook handler");
}

// Escrow-specific webhook events
const relevantEvents = new Set([
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
]);

export async function POST(request: Request) {
  if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Webhook internal configuration error.' }, { status: 500 });
  }

  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('Stripe-Signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET; // Use main webhook secret for escrow events

  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }
  if (!webhookSecret) {
     return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Escrow webhook signature verification failed:', err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  if (relevantEvents.has(event.type)) {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          await handlePaymentSucceeded(paymentIntent);
          break;
        }
        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          await handlePaymentFailed(paymentIntent);
          break;
        }
        case 'payment_intent.canceled': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          await handlePaymentCanceled(paymentIntent);
          break;
        }
        default:
          console.warn(`Unhandled relevant escrow event type: ${event.type}`);
      }
    } catch (error: any) {
      console.error(`Error handling escrow webhook event ${event.type}:`, error);
      return NextResponse.json({ error: `Webhook handler failed: ${error.message || 'Unknown error'}` }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}

// --- Escrow Webhook Handlers ---

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  if (!supabaseAdmin) return;
  
  console.log(`Handling payment_intent.succeeded for payment: ${paymentIntent.id}`);

  // Check if this is an escrow funding payment by looking at metadata
  if (paymentIntent.metadata?.type !== 'escrow_funding') {
    console.log(`Payment ${paymentIntent.id} is not an escrow funding payment, skipping`);
    return;
  }

  // Update escrow_ledger entry status from 'held' to 'held' (funds are now confirmed held in platform balance)
  const { error: ledgerError } = await supabaseAdmin
    .from('escrow_ledger')
    .update({
      status: 'held', // This confirms the funds are held in platform balance
      metadata: {
        ...{}, // preserve existing metadata
        payment_confirmed_at: new Date().toISOString(),
        stripe_payment_intent_status: paymentIntent.status,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('payment_intent_id', paymentIntent.id);

  if (ledgerError) {
    console.error(`Failed to update escrow ledger for payment ${paymentIntent.id}:`, ledgerError);
    throw new Error(`Database error during escrow ledger update: ${ledgerError.message}`);
  }

  // Update the legacy escrow_payments table status
  const { error: escrowError } = await supabaseAdmin
    .from('escrow_payments')
    .update({
      status: 'funded',
      funded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  if (escrowError) {
    console.error(`Failed to update escrow payment for payment ${paymentIntent.id}:`, escrowError);
    // Don't throw error for legacy table update failure
  }

  // Update contract status to funded
  if (paymentIntent.metadata?.contract_id) {
    const { error: contractError } = await supabaseAdmin
      .from('contracts')
      .update({
        is_funded: true,
        funded_at: new Date().toISOString(),
        funding_amount: paymentIntent.metadata.contract_amount ? 
          parseFloat(paymentIntent.metadata.contract_amount) : null,
        platform_fee_amount: paymentIntent.metadata.platform_fee ? 
          parseFloat(paymentIntent.metadata.platform_fee) : null,
        stripe_fee_amount: paymentIntent.metadata.stripe_fee ? 
          parseFloat(paymentIntent.metadata.stripe_fee) : null,
        total_charged_amount: paymentIntent.metadata.total_charge ? 
          parseFloat(paymentIntent.metadata.total_charge) : null,
        status: 'active', // Contract is now active and funded
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentIntent.metadata.contract_id);

    if (contractError) {
      console.error(`Failed to update contract ${paymentIntent.metadata.contract_id}:`, contractError);
    }
  }

  console.log(`Successfully processed escrow funding for payment ${paymentIntent.id}`);
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  if (!supabaseAdmin) return;
  
  console.log(`Handling payment_intent.payment_failed for payment: ${paymentIntent.id}`);

  // Check if this is an escrow funding payment
  if (paymentIntent.metadata?.type !== 'escrow_funding') {
    return;
  }

  // Update escrow_ledger entry status to 'failed'
  const { error: ledgerError } = await supabaseAdmin
    .from('escrow_ledger')
    .update({
      status: 'failed',
      metadata: {
        ...{}, // preserve existing metadata
        payment_failed_at: new Date().toISOString(),
        stripe_payment_intent_status: paymentIntent.status,
        failure_reason: paymentIntent.last_payment_error?.message || 'Payment failed',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('payment_intent_id', paymentIntent.id);

  if (ledgerError) {
    console.error(`Failed to update escrow ledger for failed payment ${paymentIntent.id}:`, ledgerError);
  }

  // Update the legacy escrow_payments table status
  await supabaseAdmin
    .from('escrow_payments')
    .update({
      status: 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  console.log(`Processed failed escrow payment ${paymentIntent.id}`);
}

async function handlePaymentCanceled(paymentIntent: Stripe.PaymentIntent) {
  if (!supabaseAdmin) return;
  
  console.log(`Handling payment_intent.canceled for payment: ${paymentIntent.id}`);

  // Check if this is an escrow funding payment
  if (paymentIntent.metadata?.type !== 'escrow_funding') {
    return;
  }

  // Update escrow_ledger entry status to 'failed'
  const { error: ledgerError } = await supabaseAdmin
    .from('escrow_ledger')
    .update({
      status: 'failed',
      metadata: {
        ...{}, // preserve existing metadata
        payment_canceled_at: new Date().toISOString(),
        stripe_payment_intent_status: paymentIntent.status,
        cancellation_reason: paymentIntent.cancellation_reason || 'Payment canceled',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('payment_intent_id', paymentIntent.id);

  if (ledgerError) {
    console.error(`Failed to update escrow ledger for canceled payment ${paymentIntent.id}:`, ledgerError);
  }

  // Update the legacy escrow_payments table status
  await supabaseAdmin
    .from('escrow_payments')
    .update({
      status: 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  console.log(`Processed canceled escrow payment ${paymentIntent.id}`);
}