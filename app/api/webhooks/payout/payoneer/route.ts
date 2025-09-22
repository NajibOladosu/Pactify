import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { reconciliationManager } from '@/lib/payout/reconciliation';
import { createClient } from '@/utils/supabase/server';
import crypto from 'crypto';

const webhookSecret = process.env.PAYONEER_WEBHOOK_SECRET!;

interface PayoneerWebhookEvent {
  event_type: string;
  event_time: string;
  resource_type: string;
  resource: {
    payout_id?: string;
    payee_id?: string;
    status: string;
    amount?: {
      currency: string;
      value: string;
    };
    description?: string;
    client_reference_id?: string;
    error?: {
      code: string;
      message: string;
    };
  };
  links?: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

export async function POST(request: NextRequest) {
  if (!webhookSecret) {
    console.error('Payoneer webhook secret is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  try {
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('x-payoneer-signature');
    const timestamp = headersList.get('x-payoneer-timestamp');

    if (!signature || !timestamp) {
      return NextResponse.json({ error: 'Missing signature or timestamp' }, { status: 400 });
    }

    // Verify webhook signature
    if (!verifyPayoneerSignature(body, signature, timestamp)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const event: PayoneerWebhookEvent = JSON.parse(body);
    console.log(`Payoneer webhook received: ${event.event_type}`);

    // Handle different event types
    switch (event.event_type) {
      case 'payout.completed':
        await handlePayoutCompleted(event);
        break;
      
      case 'payout.failed':
        await handlePayoutFailed(event);
        break;
      
      case 'payout.canceled':
        await handlePayoutCanceled(event);
        break;
      
      case 'payout.processing':
        await handlePayoutProcessing(event);
        break;
      
      case 'payee.verified':
        await handlePayeeVerified(event);
        break;
      
      case 'payee.verification_failed':
        await handlePayeeVerificationFailed(event);
        break;
      
      default:
        console.log(`Unhandled Payoneer event type: ${event.event_type}`);
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Payoneer webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

function verifyPayoneerSignature(body: string, signature: string, timestamp: string): boolean {
  try {
    // Payoneer signature format: sha256=<signature>
    const providedSignature = signature.replace('sha256=', '');
    
    // Create expected signature
    const payload = `${timestamp}.${body}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload, 'utf8')
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(providedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    console.error('Error verifying Payoneer signature:', error);
    return false;
  }
}

async function handlePayoutCompleted(event: PayoneerWebhookEvent) {
  const payoutId = event.resource.payout_id!;
  console.log(`Payoneer payout completed: ${payoutId}`);
  
  const internalPayoutId = await findPayoutByProviderReference(payoutId);
  if (!internalPayoutId) {
    console.warn(`No matching payout found for Payoneer payout ${payoutId}`);
    return;
  }

  await reconciliationManager.updatePayoutStatus(
    internalPayoutId,
    'paid',
    payoutId,
    event.resource.status,
    undefined,
    {
      event_type: event.event_type,
      payout_data: event.resource
    }
  );
}

async function handlePayoutFailed(event: PayoneerWebhookEvent) {
  const payoutId = event.resource.payout_id!;
  console.log(`Payoneer payout failed: ${payoutId}`);
  
  const internalPayoutId = await findPayoutByProviderReference(payoutId);
  if (!internalPayoutId) {
    console.warn(`No matching payout found for Payoneer payout ${payoutId}`);
    return;
  }

  const failureReason = event.resource.error 
    ? `${event.resource.error.code}: ${event.resource.error.message}`
    : 'Payoneer payout failed';

  await reconciliationManager.updatePayoutStatus(
    internalPayoutId,
    'failed',
    payoutId,
    event.resource.status,
    failureReason,
    {
      event_type: event.event_type,
      payout_data: event.resource,
      error: event.resource.error
    }
  );
}

async function handlePayoutCanceled(event: PayoneerWebhookEvent) {
  const payoutId = event.resource.payout_id!;
  console.log(`Payoneer payout canceled: ${payoutId}`);
  
  const internalPayoutId = await findPayoutByProviderReference(payoutId);
  if (!internalPayoutId) {
    console.warn(`No matching payout found for Payoneer payout ${payoutId}`);
    return;
  }

  await reconciliationManager.updatePayoutStatus(
    internalPayoutId,
    'cancelled',
    payoutId,
    event.resource.status,
    'Payoneer payout was canceled',
    {
      event_type: event.event_type,
      payout_data: event.resource
    }
  );
}

async function handlePayoutProcessing(event: PayoneerWebhookEvent) {
  const payoutId = event.resource.payout_id!;
  console.log(`Payoneer payout processing: ${payoutId}`);
  
  const internalPayoutId = await findPayoutByProviderReference(payoutId);
  if (!internalPayoutId) {
    console.warn(`No matching payout found for Payoneer payout ${payoutId}`);
    return;
  }

  // Log the processing update
  await reconciliationManager.logEntry({
    payout_id: internalPayoutId,
    rail: 'payoneer',
    event_time: new Date().toISOString(),
    action: 'status_update',
    provider_reference: payoutId,
    provider_status: event.resource.status,
    notes: 'Payoneer payout is being processed',
    created_by: 'webhook',
    request_payload: {
      event_type: event.event_type,
      payout_data: event.resource
    }
  });
}

async function handlePayeeVerified(event: PayoneerWebhookEvent) {
  const payeeId = event.resource.payee_id!;
  console.log(`Payoneer payee verified: ${payeeId}`);
  
  // Log verification success for audit
  await reconciliationManager.logEntry({
    payout_id: '', // This is payee level, not specific payout
    rail: 'payoneer',
    event_time: new Date().toISOString(),
    action: 'payee_verified',
    provider_reference: payeeId,
    provider_status: 'verified',
    notes: `Payee ${payeeId} has been successfully verified`,
    created_by: 'webhook',
    request_payload: {
      event_type: event.event_type,
      payee_data: event.resource
    }
  });

  // TODO: Update withdrawal methods table to mark Payoneer methods as verified
  // This would enable higher limits or remove verification requirements
}

async function handlePayeeVerificationFailed(event: PayoneerWebhookEvent) {
  const payeeId = event.resource.payee_id!;
  console.log(`Payoneer payee verification failed: ${payeeId}`);
  
  const failureReason = event.resource.error 
    ? `${event.resource.error.code}: ${event.resource.error.message}`
    : 'Payee verification failed';

  // Log verification failure for audit
  await reconciliationManager.logEntry({
    payout_id: '', // This is payee level, not specific payout
    rail: 'payoneer',
    event_time: new Date().toISOString(),
    action: 'payee_verification_failed',
    provider_reference: payeeId,
    provider_status: 'verification_failed',
    notes: `Payee ${payeeId} verification failed: ${failureReason}`,
    created_by: 'webhook',
    request_payload: {
      event_type: event.event_type,
      payee_data: event.resource,
      error: event.resource.error
    }
  });

  // TODO: Update withdrawal methods table to mark Payoneer methods as verification failed
  // This might disable the method or require re-verification
}

async function findPayoutByProviderReference(providerReference: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('payouts')
      .select('id')
      .eq('provider_reference', providerReference)
      .eq('rail', 'payoneer')
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