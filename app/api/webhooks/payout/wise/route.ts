import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { reconciliationManager } from '@/lib/payout/reconciliation';
import { createClient } from '@/utils/supabase/server';
import crypto from 'crypto';

const webhookSecret = process.env.WISE_WEBHOOK_SECRET!;

interface WiseWebhookEvent {
  data: {
    resource: {
      id: number;
      profile_id: number;
      account_id: number;
      type: string;
    };
    current_state: string;
    previous_state: string;
  };
  subscription_id: string;
  event_type: string;
  schema_version: string;
  sent_at: string;
}

export async function POST(request: NextRequest) {
  if (!webhookSecret) {
    console.error('Wise webhook secret is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  try {
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('x-signature-sha256');
    const timestamp = headersList.get('x-delivery-timestamp');

    if (!signature || !timestamp) {
      return NextResponse.json({ error: 'Missing signature or timestamp' }, { status: 400 });
    }

    // Verify webhook signature
    if (!verifyWiseSignature(body, signature, timestamp)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const event: WiseWebhookEvent = JSON.parse(body);
    console.log(`Wise webhook received: ${event.event_type}`);

    // Handle different event types
    switch (event.event_type) {
      case 'transfers#state-change':
        await handleTransferStateChange(event);
        break;
      
      case 'transfers#active-cases':
        await handleTransferActiveCases(event);
        break;
      
      default:
        console.log(`Unhandled Wise event type: ${event.event_type}`);
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Wise webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

function verifyWiseSignature(body: string, signature: string, timestamp: string): boolean {
  try {
    // Wise signature format: sha256=<signature>
    const providedSignature = signature.replace('sha256=', '');
    
    // Create expected signature
    const payload = `${body}${webhookSecret}${timestamp}`;
    const expectedSignature = crypto
      .createHash('sha256')
      .update(payload, 'utf8')
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(providedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    console.error('Error verifying Wise signature:', error);
    return false;
  }
}

async function handleTransferStateChange(event: WiseWebhookEvent) {
  const { resource, current_state, previous_state } = event.data;
  
  console.log(`Transfer ${resource.id} state changed: ${previous_state} -> ${current_state}`);

  // Find our payout record by provider reference
  const payoutId = await findPayoutByProviderReference(resource.id.toString());
  if (!payoutId) {
    console.warn(`No matching payout found for Wise transfer ${resource.id}`);
    return;
  }

  const status = mapWiseTransferState(current_state);
  let failureReason: string | undefined;

  // Extract failure reason if transfer failed
  if (current_state === 'funds_refunded' || current_state === 'cancelled') {
    failureReason = `Transfer ${current_state.replace('_', ' ')}`;
  }

  await reconciliationManager.updatePayoutStatus(
    payoutId,
    status,
    resource.id.toString(),
    current_state,
    failureReason,
    {
      event_type: 'transfers#state-change',
      transfer_data: {
        id: resource.id,
        current_state,
        previous_state,
        profile_id: resource.profile_id,
        account_id: resource.account_id
      }
    }
  );

  // Log additional reconciliation entry for state change
  await reconciliationManager.logEntry({
    payout_id: payoutId,
    rail: 'wise',
    event_time: new Date().toISOString(),
    action: 'state_change',
    provider_reference: resource.id.toString(),
    provider_status: current_state,
    notes: `Transfer state changed from ${previous_state} to ${current_state}`,
    created_by: 'webhook',
    request_payload: {
      event_type: 'transfers#state-change',
      resource,
      current_state,
      previous_state
    }
  });
}

async function handleTransferActiveCases(event: WiseWebhookEvent) {
  const { resource } = event.data;
  
  console.log(`Transfer ${resource.id} has active cases`);

  // Find our payout record
  const payoutId = await findPayoutByProviderReference(resource.id.toString());
  if (!payoutId) {
    console.warn(`No matching payout found for Wise transfer ${resource.id}`);
    return;
  }

  // Log the active cases event
  await reconciliationManager.logEntry({
    payout_id: payoutId,
    rail: 'wise',
    event_time: new Date().toISOString(),
    action: 'active_cases',
    provider_reference: resource.id.toString(),
    notes: `Transfer has active cases - may require attention`,
    created_by: 'webhook',
    request_payload: {
      event_type: 'transfers#active-cases',
      resource
    }
  });

  // TODO: Optionally update payout status or notify user
  // For now, we'll just log it for investigation
}

async function findPayoutByProviderReference(providerReference: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('payouts')
      .select('id')
      .eq('provider_reference', providerReference)
      .eq('rail', 'wise')
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

function mapWiseTransferState(wiseState: string): 'requested' | 'queued' | 'processing' | 'paid' | 'failed' | 'returned' | 'cancelled' {
  switch (wiseState.toLowerCase()) {
    case 'incoming_payment_waiting':
    case 'processing':
      return 'processing';
    case 'funds_converted':
    case 'outgoing_payment_sent':
      return 'paid';
    case 'cancelled':
      return 'cancelled';
    case 'funds_refunded':
      return 'failed';
    case 'bounced_back':
    case 'charged_back':
      return 'returned';
    case 'waiting_recipient_input_to_proceed':
      return 'processing';
    default:
      console.warn(`Unknown Wise transfer state: ${wiseState}`);
      return 'processing';
  }
}