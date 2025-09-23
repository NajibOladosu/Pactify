import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { reconciliationManager } from '@/lib/payout/reconciliation';
import { createClient } from '@/utils/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
});

const webhookSecret = process.env.STRIPE_PAYOUT_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  if (!webhookSecret) {
    console.error('Stripe payout webhook secret is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  try {
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log(`Stripe payout webhook received: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case 'payout.created':
        await handlePayoutCreated(event.data.object as Stripe.Payout);
        break;
      
      case 'payout.updated':
        await handlePayoutUpdated(event.data.object as Stripe.Payout);
        break;
      
      case 'payout.paid':
        await handlePayoutPaid(event.data.object as Stripe.Payout);
        break;
      
      case 'payout.failed':
        await handlePayoutFailed(event.data.object as Stripe.Payout);
        break;
      
      case 'payout.canceled':
        await handlePayoutCanceled(event.data.object as Stripe.Payout);
        break;
      
      case 'transfer.created':
        await handleTransferCreated(event.data.object as Stripe.Transfer);
        break;
      
      case 'transfer.updated':
        await handleTransferUpdated(event.data.object as Stripe.Transfer);
        break;
      
      default:
        console.log(`Unhandled Stripe payout event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Stripe payout webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handlePayoutCreated(payout: Stripe.Payout) {
  console.log(`Payout created: ${payout.id}`);
  
  // Find our payout record by provider reference
  const payoutId = await findPayoutByProviderReference(payout.id);
  if (!payoutId) {
    console.warn(`No matching payout found for Stripe payout ${payout.id}`);
    return;
  }

  await reconciliationManager.updatePayoutStatus(
    payoutId,
    'processing',
    payout.id,
    payout.status,
    undefined,
    {
      event_type: 'payout.created',
      payout_data: {
        id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        arrival_date: payout.arrival_date,
        method: payout.method,
        status: payout.status
      }
    }
  );
}

async function handlePayoutUpdated(payout: Stripe.Payout) {
  console.log(`Payout updated: ${payout.id}, status: ${payout.status}`);
  
  const payoutId = await findPayoutByProviderReference(payout.id);
  if (!payoutId) {
    console.warn(`No matching payout found for Stripe payout ${payout.id}`);
    return;
  }

  const status = mapStripePayoutStatus(payout.status);
  
  await reconciliationManager.updatePayoutStatus(
    payoutId,
    status,
    payout.id,
    payout.status,
    payout.failure_code || undefined,
    {
      event_type: 'payout.updated',
      payout_data: {
        id: payout.id,
        status: payout.status,
        failure_code: payout.failure_code,
        failure_message: payout.failure_message,
        arrival_date: payout.arrival_date
      }
    }
  );
}

async function handlePayoutPaid(payout: Stripe.Payout) {
  console.log(`Payout paid: ${payout.id}`);
  
  const payoutId = await findPayoutByProviderReference(payout.id);
  if (!payoutId) {
    console.warn(`No matching payout found for Stripe payout ${payout.id}`);
    return;
  }

  await reconciliationManager.updatePayoutStatus(
    payoutId,
    'paid',
    payout.id,
    payout.status,
    undefined,
    {
      event_type: 'payout.paid',
      payout_data: {
        id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        arrival_date: payout.arrival_date
      }
    }
  );
}

async function handlePayoutFailed(payout: Stripe.Payout) {
  console.log(`Payout failed: ${payout.id}, reason: ${payout.failure_code}`);
  
  const payoutId = await findPayoutByProviderReference(payout.id);
  if (!payoutId) {
    console.warn(`No matching payout found for Stripe payout ${payout.id}`);
    return;
  }

  const failureReason = payout.failure_message || payout.failure_code || 'Payout failed';

  await reconciliationManager.updatePayoutStatus(
    payoutId,
    'failed',
    payout.id,
    payout.status,
    failureReason,
    {
      event_type: 'payout.failed',
      payout_data: {
        id: payout.id,
        failure_code: payout.failure_code,
        failure_message: payout.failure_message,
        failure_balance_transaction: payout.failure_balance_transaction
      }
    }
  );
}

async function handlePayoutCanceled(payout: Stripe.Payout) {
  console.log(`Payout canceled: ${payout.id}`);
  
  const payoutId = await findPayoutByProviderReference(payout.id);
  if (!payoutId) {
    console.warn(`No matching payout found for Stripe payout ${payout.id}`);
    return;
  }

  await reconciliationManager.updatePayoutStatus(
    payoutId,
    'cancelled',
    payout.id,
    payout.status,
    'Payout was canceled',
    {
      event_type: 'payout.canceled',
      payout_data: {
        id: payout.id,
        status: payout.status
      }
    }
  );
}

async function handleTransferCreated(transfer: Stripe.Transfer) {
  console.log(`Transfer created: ${transfer.id} -> ${transfer.destination}`);
  
  // Log transfer creation for audit trail
  if (transfer.metadata?.payout_id) {
    await reconciliationManager.logEntry({
      payout_id: transfer.metadata.payout_id,
      rail: 'stripe',
      event_time: new Date().toISOString(),
      action: 'transfer_created',
      amount: transfer.amount,
      currency: transfer.currency,
      provider_reference: transfer.id,
      provider_status: 'created',
      notes: `Transfer created to connected account ${transfer.destination}`,
      created_by: 'webhook',
      request_payload: {
        event_type: 'transfer.created',
        transfer_data: {
          id: transfer.id,
          amount: transfer.amount,
          currency: transfer.currency,
          destination: transfer.destination
        }
      }
    });
  }
}

async function handleTransferUpdated(transfer: Stripe.Transfer) {
  console.log(`Transfer updated: ${transfer.id}, status: ${transfer.object}`);
  
  // Log transfer update for audit trail
  if (transfer.metadata?.payout_id) {
    await reconciliationManager.logEntry({
      payout_id: transfer.metadata.payout_id,
      rail: 'stripe',
      event_time: new Date().toISOString(),
      action: 'transfer_updated',
      amount: transfer.amount,
      currency: transfer.currency,
      provider_reference: transfer.id,
      notes: `Transfer updated`,
      created_by: 'webhook',
      request_payload: {
        event_type: 'transfer.updated',
        transfer_data: {
          id: transfer.id,
          amount: transfer.amount,
          currency: transfer.currency,
          destination: transfer.destination
        }
      }
    });
  }
}

async function findPayoutByProviderReference(providerReference: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('payouts')
      .select('id')
      .eq('provider_reference', providerReference)
      .eq('rail', 'stripe')
      .single();

    if (error || !data) {
      return null;
    }

    return data.id;
  } catch (error) {
    console.error('Error finding payout by provider reference:', error);
    return null;
  }
}

function mapStripePayoutStatus(stripeStatus: string): 'requested' | 'queued' | 'processing' | 'paid' | 'failed' | 'returned' | 'cancelled' {
  switch (stripeStatus) {
    case 'pending':
      return 'processing';
    case 'paid':
      return 'paid';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'cancelled';
    case 'in_transit':
      return 'processing';
    default:
      console.warn(`Unknown Stripe payout status: ${stripeStatus}`);
      return 'processing';
  }
}