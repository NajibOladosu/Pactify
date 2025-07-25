import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { createClient } from '@/utils/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
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
    // Webhook signature verification failed - return 400 to prevent retries
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }


  const supabase = await createClient();

  try {
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        
        // @ts-expect-error Property 'subscription' may not exist on type 'Invoice'
        if (invoice.subscription && invoice.billing_reason === 'subscription_cycle') {
          
          // Get subscription details
          // @ts-expect-error Property 'subscription' may not exist on type 'Invoice'
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          
          // Call our database function to handle the payment
          const { error: paymentError } = await supabase.rpc(
            'handle_subscription_payment',
            {
              p_user_id: subscription.metadata.user_id,
              p_stripe_subscription_id: subscription.id,
              // @ts-expect-error Stripe subscription properties may not be properly typed
              p_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              // @ts-expect-error Stripe subscription properties may not be properly typed
              p_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              p_payment_date: new Date(invoice.status_transitions.paid_at! * 1000).toISOString()
            }
          );

          if (paymentError) {
            // Payment processing failed
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
            // @ts-expect-error Stripe subscription properties may not be properly typed
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            // @ts-expect-error Stripe subscription properties may not be properly typed
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            // @ts-expect-error Stripe subscription properties may not be properly typed
            renewal_date: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', subscription.id);

        if (updateError) {
          // Subscription update failed
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
              // Profile update to free tier failed - log silently
            }
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        
        // Subscription deleted successfully
        
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
          // Subscription deletion failed
          return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
        }

        // Update profile to free
        if (subData) {
          const { error: profileError } = await supabase
            .from('profiles')
            .update({ subscription_tier: 'free' })
            .eq('id', subData.user_id);

          if (profileError) {
            // Profile update to free tier failed - log silently
          }
        }
        break;
      }

      default:
        // Unhandled event type - no action needed
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    // Webhook processing failed
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}