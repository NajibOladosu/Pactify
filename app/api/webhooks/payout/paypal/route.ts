import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { reconciliationManager } from '@/lib/payout/reconciliation';
import { createClient } from '@/utils/supabase/server';
import crypto from 'crypto';

const webhookId = process.env.PAYPAL_WEBHOOK_ID!;
const clientId = process.env.PAYPAL_CLIENT_ID!;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET!;
const paypalApiUrl = process.env.PAYPAL_API_URL || 'https://api.paypal.com';

interface PayPalWebhookEvent {
  id: string;
  event_version: string;
  create_time: string;
  resource_type: string;
  event_type: string;
  summary: string;
  resource: {
    payout_item_id?: string;
    payout_batch_id?: string;
    sender_batch_id?: string;
    payout_item?: {
      recipient_type: string;
      amount: {
        currency: string;
        value: string;
      };
      note: string;
      receiver: string;
      sender_item_id: string;
    };
    payout_item_fee?: {
      currency: string;
      value: string;
    };
    activity_id?: string;
    transaction_status: string;
    errors?: Array<{
      name: string;
      message: string;
    }>;
  };
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

export async function POST(request: NextRequest) {
  if (!webhookId || !clientId || !clientSecret) {
    console.error('PayPal webhook configuration is incomplete');
    return NextResponse.json({ error: 'Webhook configuration incomplete' }, { status: 500 });
  }

  try {
    const body = await request.text();
    const headersList = await headers();

    // Get PayPal headers for verification
    const authAlgo = headersList.get('paypal-auth-algo');
    const transmission = headersList.get('paypal-transmission-id');
    const certId = headersList.get('paypal-cert-id');
    const signature = headersList.get('paypal-transmission-sig');
    const timestamp = headersList.get('paypal-transmission-time');

    if (!authAlgo || !transmission || !certId || !signature || !timestamp) {
      return NextResponse.json({ error: 'Missing PayPal webhook headers' }, { status: 400 });
    }

    // Verify webhook signature
    const isValid = await verifyPayPalSignature({
      authAlgo,
      transmission,
      certId,
      signature,
      timestamp,
      webhookId,
      body
    });

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const event: PayPalWebhookEvent = JSON.parse(body);
    console.log(`PayPal webhook received: ${event.event_type}`);

    // Handle different event types
    switch (event.event_type) {
      case 'PAYMENT.PAYOUTSBATCH.SUCCESS':
        await handlePayoutBatchSuccess(event);
        break;
      
      case 'PAYMENT.PAYOUTSBATCH.DENIED':
        await handlePayoutBatchDenied(event);
        break;
      
      case 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED':
        await handlePayoutItemSucceeded(event);
        break;
      
      case 'PAYMENT.PAYOUTS-ITEM.FAILED':
        await handlePayoutItemFailed(event);
        break;
      
      case 'PAYMENT.PAYOUTS-ITEM.CANCELED':
        await handlePayoutItemCanceled(event);
        break;
      
      case 'PAYMENT.PAYOUTS-ITEM.DENIED':
        await handlePayoutItemDenied(event);
        break;
      
      case 'PAYMENT.PAYOUTS-ITEM.RETURNED':
        await handlePayoutItemReturned(event);
        break;
      
      default:
        console.log(`Unhandled PayPal event type: ${event.event_type}`);
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('PayPal webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function verifyPayPalSignature(params: {
  authAlgo: string;
  transmission: string;
  certId: string;
  signature: string;
  timestamp: string;
  webhookId: string;
  body: string;
}): Promise<boolean> {
  try {
    // Get access token
    const token = await getPayPalAccessToken();
    
    // Verify webhook signature using PayPal API
    const response = await fetch(`${paypalApiUrl}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth_algo: params.authAlgo,
        cert_id: params.certId,
        transmission_id: params.transmission,
        transmission_sig: params.signature,
        transmission_time: params.timestamp,
        webhook_id: params.webhookId,
        webhook_event: JSON.parse(params.body)
      })
    });

    const result = await response.json();
    return response.ok && result.verification_status === 'SUCCESS';

  } catch (error) {
    console.error('Error verifying PayPal signature:', error);
    return false;
  }
}

async function getPayPalAccessToken(): Promise<string> {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  const response = await fetch(`${paypalApiUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    throw new Error(`PayPal authentication failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function handlePayoutBatchSuccess(event: PayPalWebhookEvent) {
  console.log(`PayPal batch success: ${event.resource.payout_batch_id}`);
  
  // Log batch success for audit
  await reconciliationManager.logEntry({
    payout_id: '', // This is batch level, not specific payout
    rail: 'paypal',
    event_time: new Date().toISOString(),
    action: 'batch_success',
    provider_reference: event.resource.payout_batch_id,
    provider_status: 'success',
    notes: `Payout batch ${event.resource.payout_batch_id} processed successfully`,
    created_by: 'webhook',
    request_payload: {
      event_type: event.event_type,
      batch_data: event.resource
    }
  });
}

async function handlePayoutBatchDenied(event: PayPalWebhookEvent) {
  console.log(`PayPal batch denied: ${event.resource.payout_batch_id}`);
  
  // Find all payouts in this batch and mark them as failed
  // This would require tracking batch IDs in our payout records
  
  await reconciliationManager.logEntry({
    payout_id: '', // This is batch level
    rail: 'paypal',
    event_time: new Date().toISOString(),
    action: 'batch_denied',
    provider_reference: event.resource.payout_batch_id,
    provider_status: 'denied',
    notes: `Payout batch ${event.resource.payout_batch_id} was denied`,
    created_by: 'webhook',
    request_payload: {
      event_type: event.event_type,
      batch_data: event.resource
    }
  });
}

async function handlePayoutItemSucceeded(event: PayPalWebhookEvent) {
  const itemId = event.resource.payout_item_id!;
  console.log(`PayPal payout item succeeded: ${itemId}`);
  
  const payoutId = await findPayoutByProviderReference(itemId);
  if (!payoutId) {
    console.warn(`No matching payout found for PayPal item ${itemId}`);
    return;
  }

  await reconciliationManager.updatePayoutStatus(
    payoutId,
    'paid',
    itemId,
    event.resource.transaction_status,
    undefined,
    {
      event_type: event.event_type,
      item_data: event.resource
    }
  );
}

async function handlePayoutItemFailed(event: PayPalWebhookEvent) {
  const itemId = event.resource.payout_item_id!;
  console.log(`PayPal payout item failed: ${itemId}`);
  
  const payoutId = await findPayoutByProviderReference(itemId);
  if (!payoutId) {
    console.warn(`No matching payout found for PayPal item ${itemId}`);
    return;
  }

  const errors = event.resource.errors || [];
  const failureReason = errors.length > 0 
    ? errors.map(e => e.message).join(', ')
    : 'PayPal payout failed';

  await reconciliationManager.updatePayoutStatus(
    payoutId,
    'failed',
    itemId,
    event.resource.transaction_status,
    failureReason,
    {
      event_type: event.event_type,
      item_data: event.resource,
      errors
    }
  );
}

async function handlePayoutItemCanceled(event: PayPalWebhookEvent) {
  const itemId = event.resource.payout_item_id!;
  console.log(`PayPal payout item canceled: ${itemId}`);
  
  const payoutId = await findPayoutByProviderReference(itemId);
  if (!payoutId) {
    console.warn(`No matching payout found for PayPal item ${itemId}`);
    return;
  }

  await reconciliationManager.updatePayoutStatus(
    payoutId,
    'cancelled',
    itemId,
    event.resource.transaction_status,
    'PayPal payout was canceled',
    {
      event_type: event.event_type,
      item_data: event.resource
    }
  );
}

async function handlePayoutItemDenied(event: PayPalWebhookEvent) {
  const itemId = event.resource.payout_item_id!;
  console.log(`PayPal payout item denied: ${itemId}`);
  
  const payoutId = await findPayoutByProviderReference(itemId);
  if (!payoutId) {
    console.warn(`No matching payout found for PayPal item ${itemId}`);
    return;
  }

  const errors = event.resource.errors || [];
  const failureReason = errors.length > 0 
    ? `Denied: ${errors.map(e => e.message).join(', ')}`
    : 'PayPal payout was denied';

  await reconciliationManager.updatePayoutStatus(
    payoutId,
    'failed',
    itemId,
    event.resource.transaction_status,
    failureReason,
    {
      event_type: event.event_type,
      item_data: event.resource,
      errors
    }
  );
}

async function handlePayoutItemReturned(event: PayPalWebhookEvent) {
  const itemId = event.resource.payout_item_id!;
  console.log(`PayPal payout item returned: ${itemId}`);
  
  const payoutId = await findPayoutByProviderReference(itemId);
  if (!payoutId) {
    console.warn(`No matching payout found for PayPal item ${itemId}`);
    return;
  }

  await reconciliationManager.updatePayoutStatus(
    payoutId,
    'returned',
    itemId,
    event.resource.transaction_status,
    'PayPal payout was returned',
    {
      event_type: event.event_type,
      item_data: event.resource
    }
  );
}

async function findPayoutByProviderReference(providerReference: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('payouts')
      .select('id')
      .eq('provider_reference', providerReference)
      .eq('rail', 'paypal')
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