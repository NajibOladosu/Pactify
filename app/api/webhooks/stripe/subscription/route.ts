import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { createClient } from '@/utils/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headersList = await headers();
  const sig = headersList.get('stripe-signature');

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig!, endpointSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }


  const supabase = await createClient();

  try {
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        
        if (invoice.subscription && invoice.billing_reason === 'subscription_cycle') {
          
          // Get subscription details
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          
          // Call our database function to handle the payment
          const { error: paymentError } = await supabase.rpc(
            'handle_subscription_payment',
            {
              p_user_id: subscription.metadata.user_id,
              p_stripe_subscription_id: subscription.id,
              p_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              p_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              p_payment_date: new Date(invoice.status_transitions.paid_at! * 1000).toISOString()
            }
          );

          if (paymentError) {
            console.error('Error handling subscription payment:', paymentError);
            return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 });
          }

        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        
        
        // Update subscription status
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({
            status: subscription.status === 'active' ? 'active' : subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            renewal_date: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', subscription.id);

        if (updateError) {
          console.error('Error updating subscription:', updateError);
          return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
        }

        // If subscription became inactive, update profile
        if (subscription.status !== 'active') {
          const { data: subData } = await supabase
            .from('user_subscriptions')
            .select('user_id')
            .eq('stripe_subscription_id', subscription.id)
            .single();

          if (subData) {
            const { error: profileError } = await supabase
              .from('profiles')
              .update({ subscription_tier: 'free' })
              .eq('id', subData.user_id);

            if (profileError) {
              console.error('Error updating profile to free:', profileError);
            }
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        
        console.log(`🗑️ Subscription deleted: ${subscription.id}`);
        
        // Get user ID before deleting
        const { data: subData } = await supabase
          .from('user_subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        // Delete subscription record
        const { error: deleteError } = await supabase
          .from('user_subscriptions')
          .delete()
          .eq('stripe_subscription_id', subscription.id);

        if (deleteError) {
          console.error('Error deleting subscription:', deleteError);
          return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
        }

        // Update profile to free
        if (subData) {
          const { error: profileError } = await supabase
            .from('profiles')
            .update({ subscription_tier: 'free' })
            .eq('id', subData.user_id);

          if (profileError) {
            console.error('Error updating profile to free:', profileError);
          }
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}