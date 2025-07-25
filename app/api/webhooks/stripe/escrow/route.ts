import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { headers } from 'next/headers';

// Stripe instance will be created dynamically when needed

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    // Create Stripe instance for webhook verification
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-06-30.basil',
    });

    // Verify webhook signature
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const supabase = await createClient();

    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object, supabase);
        break;
      
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object, supabase);
        break;
      
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object, supabase);
        break;
      
      case 'transfer.created':
        await handleTransferCreated(event.data.object, supabase);
        break;
      
      case 'transfer.updated':
        await handleTransferUpdated(event.data.object, supabase);
        break;
      
      case 'refund.created':
        await handleRefundCreated(event.data.object, supabase);
        break;
      
      default:
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: any, supabase: any) {
  try {
    // Update escrow payment status to funded
    const { error: updateError } = await supabase
      .from('escrow_payments')
      .update({
        status: 'funded',
        funded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_payment_intent_id', paymentIntent.id);

    if (updateError) {
      console.error('Error updating escrow payment:', updateError);
      return;
    }

    // Get the escrow payment to find the contract
    const { data: escrowPayment, error: escrowError } = await supabase
      .from('escrow_payments')
      .select('*')
      .eq('stripe_payment_intent_id', paymentIntent.id)
      .single();

    if (escrowError || !escrowPayment) {
      console.error('Error finding escrow payment:', escrowError);
      return;
    }

    // Update contract status to active and mark as funded
    const { error: contractError } = await supabase
      .from('contracts')
      .update({
        status: 'active',
        is_funded: true,
        funded_at: new Date().toISOString(),
        funding_amount: escrowPayment.amount,
        platform_fee_amount: escrowPayment.platform_fee,
        stripe_fee_amount: escrowPayment.stripe_fee,
        total_charged_amount: escrowPayment.total_charged,
        updated_at: new Date().toISOString(),
      })
      .eq('id', escrowPayment.contract_id);

    if (contractError) {
      console.error('Error updating contract:', contractError);
      return;
    }

    // Update contract payment record
    const { error: paymentError } = await supabase
      .from('contract_payments')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_payment_id', paymentIntent.id);

    if (paymentError) {
      console.error('Error updating contract payment:', paymentError);
    }

    // Get contract details for notifications
    const { data: contract, error: contractDetailError } = await supabase
      .from('contracts')
      .select(`
        *,
        contract_parties!inner (
          user_id,
          role
        )
      `)
      .eq('id', escrowPayment.contract_id)
      .single();

    if (contractDetailError || !contract) {
      console.error('Error getting contract details:', contractDetailError);
      return;
    }

    // Create notifications for both parties
    const freelancerParty = contract.contract_parties.find(
      (party: any) => party.role === 'freelancer'
    );

    if (freelancerParty) {
      const { error: notificationError } = await supabase
        .from('contract_notifications')
        .insert({
          contract_id: escrowPayment.contract_id,
          user_id: freelancerParty.user_id,
          notification_type: 'contract_funded',
          title: 'Contract Funded',
          message: `Contract ${contract.contract_number} has been funded and is now active. You can begin work.`,
          metadata: {
            amount: escrowPayment.amount,
            payment_intent_id: paymentIntent.id,
          },
        });

      if (notificationError) {
        console.error('Error creating notification:', notificationError);
      }
    }

  } catch (error) {
    console.error('Error handling payment intent succeeded:', error);
  }
}

async function handlePaymentIntentFailed(paymentIntent: any, supabase: any) {
  try {
    // Update escrow payment status to failed
    const { error: updateError } = await supabase
      .from('escrow_payments')
      .update({
        status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_payment_intent_id', paymentIntent.id);

    if (updateError) {
      console.error('Error updating escrow payment:', updateError);
      return;
    }

    // Update contract payment record
    const { error: paymentError } = await supabase
      .from('contract_payments')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_payment_id', paymentIntent.id);

    if (paymentError) {
      console.error('Error updating contract payment:', paymentError);
    }

  } catch (error) {
    console.error('Error handling payment intent failed:', error);
  }
}

async function handleCheckoutSessionCompleted(session: any, supabase: any) {
  try {
    if (session.metadata?.type === 'escrow_funding') {
      // This is handled by payment_intent.succeeded, but we can add additional logic here
    }
  } catch (error) {
    console.error('Error handling checkout session completed:', error);
  }
}

async function handleTransferCreated(transfer: any, supabase: any) {
  try {
    
    // Update escrow payment with transfer ID if needed
    if (transfer.metadata?.escrow_payment_id) {
      const { error: updateError } = await supabase
        .from('escrow_payments')
        .update({
          stripe_transfer_id: transfer.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transfer.metadata.escrow_payment_id);

      if (updateError) {
        console.error('Error updating escrow payment with transfer ID:', updateError);
      }
    }
  } catch (error) {
    console.error('Error handling transfer created:', error);
  }
}

async function handleTransferUpdated(transfer: any, supabase: any) {
  try {
    
    // Handle transfer status updates (paid, failed, etc.)
    if (transfer.status === 'paid' && transfer.metadata?.escrow_payment_id) {
      const { error: updateError } = await supabase
        .from('escrow_payments')
        .update({
          status: 'released',
          released_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', transfer.metadata.escrow_payment_id);

      if (updateError) {
        console.error('Error updating escrow payment status:', updateError);
      }
    }
  } catch (error) {
    console.error('Error handling transfer updated:', error);
  }
}

async function handleRefundCreated(refund: any, supabase: any) {
  try {
    
    // Update escrow payment status if it's related to a contract refund
    if (refund.metadata?.escrow_payment_id) {
      const { error: updateError } = await supabase
        .from('escrow_payments')
        .update({
          status: 'refunded',
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', refund.metadata.escrow_payment_id);

      if (updateError) {
        console.error('Error updating escrow payment for refund:', updateError);
      }
    }
  } catch (error) {
    console.error('Error handling refund created:', error);
  }
}