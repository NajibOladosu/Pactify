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
      apiVersion: '2025-06-30',
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
        
      case 'transfer.paid':
        await handleTransferPaid(event.data.object, supabase);
        break;
        
      case 'transfer.failed':
        await handleTransferFailed(event.data.object, supabase);
        break;
      
      case 'refund.created':
        await handleRefundCreated(event.data.object, supabase);
        break;
        
      case 'account.updated':
        await handleAccountUpdated(event.data.object, supabase);
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
    // Log transfer status change
    console.log(`Transfer ${transfer.id} updated to status: ${transfer.status}`);
    
    // Update escrow payment with transfer status if metadata contains escrow_payment_id
    if (transfer.metadata?.escrow_payment_id) {
      const { error: updateError } = await supabase
        .from('escrow_payments')
        .update({
          stripe_transfer_id: transfer.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transfer.metadata.escrow_payment_id);

      if (updateError) {
        console.error('Error updating escrow payment with transfer status:', updateError);
      }
    }
  } catch (error) {
    console.error('Error handling transfer updated:', error);
  }
}

async function handleTransferPaid(transfer: any, supabase: any) {
  try {
    console.log(`Transfer ${transfer.id} has been paid successfully`);
    
    // Update escrow payment status to released when transfer is successfully paid
    if (transfer.metadata?.escrow_payment_id) {
      const { error: updateError } = await supabase
        .from('escrow_payments')
        .update({
          status: 'released',
          released_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', transfer.metadata.escrow_payment_id);

      if (updateError) {
        console.error('Error updating escrow payment to released:', updateError);
        return;
      }

      // Update contract payment record
      const { error: paymentError } = await supabase
        .from('contract_payments')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_payment_id', transfer.id);

      if (paymentError) {
        console.error('Error updating contract payment status:', paymentError);
      }

      // Send notification to freelancer
      if (transfer.metadata?.contract_id && transfer.metadata?.freelancer_id) {
        const { error: notificationError } = await supabase
          .from('contract_notifications')
          .insert({
            contract_id: transfer.metadata.contract_id,
            user_id: transfer.metadata.freelancer_id,
            notification_type: 'payment_received',
            title: 'Payment Received',
            message: `Your payment of $${(transfer.amount / 100).toFixed(2)} has been successfully transferred to your account.`,
            metadata: {
              transfer_id: transfer.id,
              amount: transfer.amount / 100,
            },
          });

        if (notificationError) {
          console.error('Error creating payment received notification:', notificationError);
        }
      }
    }
  } catch (error) {
    console.error('Error handling transfer paid:', error);
  }
}

async function handleTransferFailed(transfer: any, supabase: any) {
  try {
    console.error(`Transfer ${transfer.id} failed: ${transfer.failure_message}`);
    
    // Update escrow payment status back to funded if transfer failed
    if (transfer.metadata?.escrow_payment_id) {
      const { error: updateError } = await supabase
        .from('escrow_payments')
        .update({
          status: 'funded', // Return to funded status
          updated_at: new Date().toISOString(),
        })
        .eq('id', transfer.metadata.escrow_payment_id);

      if (updateError) {
        console.error('Error reverting escrow payment status:', updateError);
      }

      // Create notification for both parties about the failed transfer
      if (transfer.metadata?.contract_id) {
        const notifications = [];
        
        if (transfer.metadata?.client_id) {
          notifications.push({
            contract_id: transfer.metadata.contract_id,
            user_id: transfer.metadata.client_id,
            notification_type: 'transfer_failed',
            title: 'Payment Transfer Failed',
            message: `The payment transfer failed and funds remain in escrow. Please contact support.`,
            metadata: {
              transfer_id: transfer.id,
              failure_reason: transfer.failure_message,
            },
          });
        }
        
        if (transfer.metadata?.freelancer_id) {
          notifications.push({
            contract_id: transfer.metadata.contract_id,
            user_id: transfer.metadata.freelancer_id,
            notification_type: 'transfer_failed',
            title: 'Payment Transfer Failed',
            message: `The payment transfer to your account failed. Please check your account details and contact support.`,
            metadata: {
              transfer_id: transfer.id,
              failure_reason: transfer.failure_message,
            },
          });
        }

        for (const notification of notifications) {
          const { error: notificationError } = await supabase
            .from('contract_notifications')
            .insert(notification);

          if (notificationError) {
            console.error('Error creating transfer failed notification:', notificationError);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error handling transfer failed:', error);
  }
}

async function handleAccountUpdated(account: any, supabase: any) {
  try {
    console.log(`Stripe Connect account ${account.id} updated`);
    
    // Update user profile with latest account status
    if (account.metadata?.platform_user_id) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          stripe_connect_enabled: account.details_submitted && account.charges_enabled && account.payouts_enabled,
          stripe_connect_charges_enabled: account.charges_enabled,
          stripe_connect_payouts_enabled: account.payouts_enabled,
          updated_at: new Date().toISOString(),
        })
        .eq('id', account.metadata.platform_user_id);

      if (updateError) {
        console.error('Error updating profile with account status:', updateError);
        return;
      }

      // Create notification if account becomes fully enabled
      if (account.details_submitted && account.charges_enabled && account.payouts_enabled) {
        const { error: notificationError } = await supabase
          .from('notifications')
          .insert({
            user_id: account.metadata.platform_user_id,
            type: 'account_verified',
            title: 'Payment Account Verified',
            message: 'Your payment account has been successfully verified and you can now receive payments.',
            related_entity_type: 'stripe_account',
            related_entity_id: account.id,
          });

        if (notificationError) {
          console.error('Error creating account verified notification:', notificationError);
        }
      }
    }
  } catch (error) {
    console.error('Error handling account updated:', error);
  }
}

async function handleRefundCreated(refund: any, supabase: any) {
  try {
    console.log(`Refund ${refund.id} created for amount: ${refund.amount / 100}`);
    
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
        return;
      }

      // Update contract status if this was a full refund
      if (refund.metadata?.contract_id) {
        const { error: contractError } = await supabase
          .from('contracts')
          .update({
            status: 'cancelled',
            is_funded: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', refund.metadata.contract_id);

        if (contractError) {
          console.error('Error updating contract status for refund:', contractError);
        }
      }

      // Create notifications for refund completion
      if (refund.metadata?.contract_id && refund.metadata?.requested_by) {
        const { error: notificationError } = await supabase
          .from('contract_notifications')
          .insert({
            contract_id: refund.metadata.contract_id,
            user_id: refund.metadata.requested_by,
            notification_type: 'refund_completed',
            title: 'Refund Completed',
            message: `Your refund of $${(refund.amount / 100).toFixed(2)} has been processed and will appear in your account within 5-10 business days.`,
            metadata: {
              refund_id: refund.id,
              amount: refund.amount / 100,
              reason: refund.metadata.refund_reason || 'Refund processed',
            },
          });

        if (notificationError) {
          console.error('Error creating refund completed notification:', notificationError);
        }
      }
    }
  } catch (error) {
    console.error('Error handling refund created:', error);
  }
}