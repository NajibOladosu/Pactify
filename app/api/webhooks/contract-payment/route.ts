import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { balanceSyncManager } from '@/lib/payout/balance-sync';

// Webhook for internal contract payment events
// This handles real-time balance updates when payments are released
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event_type, payment, contract } = body;

    // Validate webhook payload
    if (!event_type || !payment || !contract) {
      return NextResponse.json(
        { error: 'Invalid webhook payload' },
        { status: 400 }
      );
    }

    console.log(`Contract payment webhook received: ${event_type}`);

    // Handle the payment event
    await balanceSyncManager.handleContractPaymentWebhook(
      event_type,
      payment,
      contract
    );

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Contract payment webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

// Helper function to send contract payment webhook events
// This can be called from the contract payment release endpoint
export async function sendContractPaymentWebhook(
  eventType: string,
  payment: any,
  contract: any
): Promise<void> {
  try {
    const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/contract-payment`;
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: eventType,
        payment,
        contract,
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      console.error('Failed to send contract payment webhook:', response.statusText);
    }

  } catch (error) {
    console.error('Error sending contract payment webhook:', error);
  }
}