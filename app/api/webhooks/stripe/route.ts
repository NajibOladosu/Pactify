import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
// Use Supabase Admin client for elevated privileges in webhooks
import { createClient, SupabaseClient } from '@supabase/supabase-js'; // Import SupabaseClient type

// Initialize Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil', // Use a consistent API version
  typescript: true,
});

// Initialize Supabase Admin Client
// Ensure SUPABASE_SERVICE_ROLE is set in your environment variables (as confirmed by user)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;

let supabaseAdmin: SupabaseClient | null = null;
if (supabaseUrl && supabaseServiceRole) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);
} else {
    console.error("FATAL: Missing Supabase URL or Service Role Key in environment variables for webhook handler.");
}

const relevantEvents = new Set([
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

export async function POST(request: Request) {
  // Check if Supabase Admin client initialized correctly
  if (!supabaseAdmin) {
      console.error("Supabase Admin client not initialized in webhook handler.");
      return NextResponse.json({ error: 'Webhook internal configuration error.' }, { status: 500 });
  }

  const body = await request.text();
  // Await headers() before accessing its methods
  const headersList = await headers(); // Await here
  const signature = headersList.get('Stripe-Signature'); // Use .get() after await
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Log headers for debugging (optional)
  // console.log("--- Webhook Headers ---");
  // try {
  //     console.log(JSON.stringify(Object.fromEntries(headersList.entries()), null, 2)); // Use .entries() after await
  // } catch (e) { console.error("Could not stringify headers:", e); }

  // Check signature and secret exist
  if (!signature) {
    console.error('Webhook Error: Missing Stripe signature.');
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }
  if (!webhookSecret) {
     console.error('Webhook Error: Missing webhook secret.');
     return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  console.log(`Received Stripe Event: ${event.type}`);

  if (relevantEvents.has(event.type)) {
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const checkoutSession = event.data.object as Stripe.Checkout.Session;
          // console.log("--- checkout.session.completed event data.object ---");
          // console.log(JSON.stringify(checkoutSession, null, 2));
          const subscriptionId = checkoutSession.subscription as string | null; // Explicitly allow null
          const customerId = checkoutSession.customer as string | null; // Explicitly allow null
          if (checkoutSession.mode === 'subscription' && subscriptionId && customerId) {
            await handleSubscriptionCheckout(subscriptionId, customerId);
          } else {
            console.log(`Checkout session ${checkoutSession.id} completed, but not a subscription or missing details.`);
          }
          break;
        }
        case 'customer.subscription.updated': {
          const subscriptionUpdated = event.data.object as Stripe.Subscription;
          // console.log("--- customer.subscription.updated event data.object ---");
          // console.log(JSON.stringify(subscriptionUpdated, null, 2));
          await handleSubscriptionUpdate(subscriptionUpdated);
          break;
        }
        case 'customer.subscription.deleted': {
          const subscriptionDeleted = event.data.object as Stripe.Subscription;
          // console.log("--- customer.subscription.deleted event data.object ---");
          // console.log(JSON.stringify(subscriptionDeleted, null, 2));
          await handleSubscriptionDelete(subscriptionDeleted);
          break;
        }
        case 'invoice.paid': {
          const invoicePaid = event.data.object as Stripe.Invoice;
          // console.log("--- invoice.paid event data.object ---");
          // console.log(JSON.stringify(invoicePaid, null, 2));

          // Safely access subscription and customer IDs (expecting strings in webhook payload) - suppressing TS errors
          // @ts-expect-error Property 'subscription' does not exist on type 'Invoice'.
          const subscriptionId = typeof invoicePaid.subscription === 'string' ? invoicePaid.subscription : null;
          // The customer property seems correctly typed now, removing the directive.
          const customerId = typeof invoicePaid.customer === 'string' ? invoicePaid.customer : null;

          if (subscriptionId && customerId) {
             await handleInvoicePaid(subscriptionId, customerId);
          } else {
             console.log(`Invoice ${invoicePaid.id} paid event ignored: Missing subscription or customer ID.`);
          }
          break;
        }
        case 'invoice.payment_failed': {
          const invoiceFailed = event.data.object as Stripe.Invoice;
          // console.log("--- invoice.payment_failed event data.object ---");
          // console.log(JSON.stringify(invoiceFailed, null, 2));

          // Safely access subscription and customer IDs (expecting strings in webhook payload) - suppressing TS errors
          // @ts-expect-error Property 'subscription' does not exist on type 'Invoice'.
          const subscriptionId = typeof invoiceFailed.subscription === 'string' ? invoiceFailed.subscription : null;
          // The customer property seems correctly typed now, removing the directive.
          const customerId = typeof invoiceFailed.customer === 'string' ? invoiceFailed.customer : null;

          if (subscriptionId && customerId) {
             await handleInvoicePaymentFailed(subscriptionId, customerId);
          } else {
             console.log(`Invoice ${invoiceFailed.id} payment failed event ignored: Missing subscription or customer ID.`);
          }
          break;
        }
        default:
          console.warn(`Unhandled relevant event type: ${event.type}`);
      }
    } catch (error: any) {
      console.error(`Error handling webhook event ${event.type}:`, error);
      return NextResponse.json({ error: `Webhook handler failed: ${error.message || 'Unknown error'}` }, { status: 500 });
    }
  } else {
    console.log(`Ignoring irrelevant event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}

// --- Helper Functions for Handling Specific Events ---

async function handleSubscriptionCheckout(subscriptionId: string, customerId: string) {
  if (!supabaseAdmin) { console.error("Supabase Admin not init in handleSubscriptionCheckout"); return; }
  console.log(`Handling checkout.session.completed for sub: ${subscriptionId}, customer: ${customerId}`);
  let subscriptionDetails: Stripe.Subscription;
  try {
      subscriptionDetails = await stripe.subscriptions.retrieve(subscriptionId);
      // console.log(`--- Retrieved Subscription Details (Checkout) for ${subscriptionId} ---`);
      // console.log(JSON.stringify(subscriptionDetails, null, 2));
  } catch (retrieveError) {
      console.error(`Could not retrieve subscription ${subscriptionId} from Stripe during checkout handling:`, retrieveError);
      return;
  }

  if (!subscriptionDetails || !subscriptionDetails.items?.data?.length) {
    console.error(`Retrieved subscription ${subscriptionId} has no items.`);
    return;
  }
  const priceId = subscriptionDetails.items.data[0].price.id;
  const userId = await getUserIdFromCustomerId(customerId);

  if (!userId) {
    console.error(`Could not find user for Stripe customer ID: ${customerId}`);
    return;
  }

  const { data: plan, error: planError } = await supabaseAdmin
    .from('subscription_plans')
    .select('id')
    .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId}`)
    .single();

  if (planError || !plan) {
    console.error(`Could not find plan matching Stripe price ID: ${priceId}`, planError);
    return;
  }

  // Trusting Stripe SDK types for these properties - suppressing potential TS errors
  // @ts-expect-error Property 'current_period_start' does not exist on type 'Subscription'.
  const currentPeriodStart = subscriptionDetails.current_period_start;
  // @ts-expect-error Property 'current_period_end' does not exist on type 'Subscription'.
  const currentPeriodEnd = subscriptionDetails.current_period_end;

  const subscriptionData = {
    user_id: userId,
    plan_id: plan.id,
    status: subscriptionDetails.status,
    stripe_subscription_id: subscriptionDetails.id,
    stripe_price_id: priceId,
    current_period_start: new Date(currentPeriodStart * 1000),
    current_period_end: new Date(currentPeriodEnd * 1000),
    cancel_at_period_end: subscriptionDetails.cancel_at_period_end ?? false,
  };

  const { error: upsertError } = await supabaseAdmin
    .from('user_subscriptions')
    .upsert(subscriptionData, { onConflict: 'user_id' });

  if (upsertError) {
    console.error(`Failed to upsert subscription for user ${userId}:`, upsertError);
    throw new Error(`Database error during subscription upsert: ${upsertError.message}`);
  }

  const { error: profileUpdateError } = await supabaseAdmin
    .from('profiles')
    .update({ subscription_tier: plan.id })
    .eq('id', userId);

   if (profileUpdateError) {
     console.error(`Failed to update profile tier for user ${userId}:`, profileUpdateError);
   }

  console.log(`Successfully processed checkout for user ${userId}, plan ${plan.id}`);
}

async function handleSubscriptionUpdate(subscriptionEventData: Stripe.Subscription) {
  // Renamed input param to avoid confusion with retrieved details
  if (!supabaseAdmin) { console.error("Supabase Admin not init in handleSubscriptionUpdate"); return; }
  console.log(`Handling customer.subscription.updated for sub: ${subscriptionEventData.id}`);

  // Retrieve the full subscription details from Stripe to ensure we have all properties
  let subscriptionDetails: Stripe.Subscription;
  try {
      subscriptionDetails = await stripe.subscriptions.retrieve(subscriptionEventData.id);
      // console.log(`--- Retrieved Subscription Details (Update) for ${subscriptionEventData.id} ---`);
      // console.log(JSON.stringify(subscriptionDetails, null, 2));
  } catch (retrieveError) {
      console.error(`Could not retrieve subscription ${subscriptionEventData.id} from Stripe during update handling:`, retrieveError);
      return;
  }

  // Now use subscriptionDetails for accessing properties
  const customerId = subscriptionDetails.customer;
  if (typeof customerId !== 'string') {
      console.error(`Retrieved subscription ${subscriptionDetails.id} is missing a customer ID.`);
      return;
  }
  const userId = await getUserIdFromCustomerId(customerId);
  if (!userId) {
      console.error(`Could not find user for customer ID ${customerId} during subscription update.`);
      return;
  }

  const priceId = subscriptionDetails.items?.data[0]?.price?.id;
  if (!priceId) {
      console.error(`Retrieved subscription ${subscriptionDetails.id} has no price ID.`);
      return;
  }

  const { data: plan, error: planError } = await supabaseAdmin
    .from('subscription_plans')
    .select('id')
    .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId}`)
    .single();

  if (planError || !plan) {
    console.error(`Could not find plan matching Stripe price ID: ${priceId}`, planError);
    return;
  }

  // Use properties from the retrieved subscriptionDetails - suppressing potential TS errors
  // @ts-expect-error Property 'current_period_start' does not exist on type 'Subscription'.
  const currentPeriodStart = subscriptionDetails.current_period_start;
  // @ts-expect-error Property 'current_period_end' does not exist on type 'Subscription'.
  const currentPeriodEnd = subscriptionDetails.current_period_end;

  const subscriptionData = {
    plan_id: plan.id,
    status: subscriptionDetails.status, // Use status from retrieved details
    stripe_price_id: priceId,
    current_period_start: new Date(currentPeriodStart * 1000),
    current_period_end: new Date(currentPeriodEnd * 1000),
    cancel_at_period_end: subscriptionDetails.cancel_at_period_end ?? false, // Use cancel_at_period_end from retrieved details
  };

  const { error: updateError } = await supabaseAdmin
    .from('user_subscriptions')
    .update(subscriptionData)
    .eq('stripe_subscription_id', subscriptionDetails.id); // Use ID from retrieved details

  if (updateError) {
    console.error(`Failed to update subscription ${subscriptionDetails.id} for user ${userId}:`, updateError);
    throw new Error(`Database error during subscription update: ${updateError.message}`);
  }

   const { error: profileUpdateError } = await supabaseAdmin
     .from('profiles')
     .update({ subscription_tier: plan.id })
     .eq('id', userId);

    if (profileUpdateError) {
      console.error(`Failed to update profile tier for user ${userId}:`, profileUpdateError);
    }

  console.log(`Successfully updated subscription ${subscriptionDetails.id} for user ${userId}`);
}

async function handleSubscriptionDelete(subscription: Stripe.Subscription) {
  // Corrected function implementation
  if (!supabaseAdmin) { console.error("Supabase Admin not init in handleSubscriptionDelete"); return; }
  console.log(`Handling customer.subscription.deleted for sub: ${subscription.id}`);

  // Extract customerId correctly from the input subscription object
  const customerId = subscription.customer;
   if (typeof customerId !== 'string') {
       console.error(`Subscription delete event for ${subscription.id} is missing a customer ID.`);
       return;
   }

  const userId = await getUserIdFromCustomerId(customerId); // Use the extracted customerId
  if (!userId) {
      console.error(`Could not find user for customer ID ${customerId} during subscription delete.`);
      return;
  }

  // Add explicit null check before using supabaseAdmin
  if (!supabaseAdmin) {
      console.error("Supabase Admin client became null before updating subscription status.");
      return;
  }
  const { error: updateError } = await supabaseAdmin
    .from('user_subscriptions')
    .update({ status: 'cancelled' })
    .eq('stripe_subscription_id', subscription.id);

  if (updateError) {
    console.error(`Failed to mark subscription ${subscription.id} as cancelled for user ${userId}:`, updateError);
    // Consider not throwing here, just log, as the subscription is deleted in Stripe anyway
  }

  // Add explicit null check before using supabaseAdmin
  if (!supabaseAdmin) {
      console.error("Supabase Admin client became null before updating profile tier.");
      return;
  }
  const { error: profileUpdateError } = await supabaseAdmin
    .from('profiles')
    .update({ subscription_tier: 'free' })
    .eq('id', userId);

   if (profileUpdateError) {
     console.error(`Failed to reset profile tier for user ${userId} after cancellation:`, profileUpdateError);
   }

  console.log(`Successfully processed cancellation for subscription ${subscription.id}, user ${userId}`);
}

async function handleInvoicePaid(subscriptionId: string, customerId: string) {
    if (!supabaseAdmin) { console.error("Supabase Admin not init in handleInvoicePaid"); return; }
    console.log(`Handling invoice.paid for sub: ${subscriptionId}, customer: ${customerId}`);
    const userId = await getUserIdFromCustomerId(customerId);
    if (!userId) return;

    let subscriptionDetails: Stripe.Subscription;
     try {
         subscriptionDetails = await stripe.subscriptions.retrieve(subscriptionId);
         // console.log(`--- Retrieved Subscription Details (Invoice Paid) for ${subscriptionId} ---`);
         // console.log(JSON.stringify(subscriptionDetails, null, 2));
     } catch (retrieveError) {
         console.error(`Could not retrieve subscription ${subscriptionId} from Stripe during invoice.paid handling:`, retrieveError);
         return;
     }

    if (!subscriptionDetails) {
        console.error(`Subscription ${subscriptionId} not found after retrieve call during invoice.paid.`);
        return;
    }

    // Trusting Stripe SDK types for this property - suppressing potential TS errors
    // @ts-expect-error Property 'current_period_end' does not exist on type 'Subscription'.
    const currentPeriodEnd = subscriptionDetails.current_period_end;

    const { error: updateError } = await supabaseAdmin
      .from('user_subscriptions')
      .update({
        status: 'active',
        current_period_end: new Date(currentPeriodEnd * 1000),
      })
      .eq('stripe_subscription_id', subscriptionId);

    if (updateError) {
      console.error(`Failed to update subscription ${subscriptionId} on invoice paid for user ${userId}:`, updateError);
    } else {
      console.log(`Updated subscription ${subscriptionId} status to active for user ${userId}`);
    }
}

async function handleInvoicePaymentFailed(subscriptionId: string, customerId: string) {
    if (!supabaseAdmin) { console.error("Supabase Admin not init in handleInvoicePaymentFailed"); return; }
    console.log(`Handling invoice.payment_failed for sub: ${subscriptionId}, customer: ${customerId}`);
    const userId = await getUserIdFromCustomerId(customerId);
    if (!userId) return;

    const { error: updateError } = await supabaseAdmin
      .from('user_subscriptions')
      .update({ status: 'past_due' })
      .eq('stripe_subscription_id', subscriptionId);

    if (updateError) {
      console.error(`Failed to update subscription ${subscriptionId} on invoice failed for user ${userId}:`, updateError);
    } else {
      console.log(`Updated subscription ${subscriptionId} status on payment failure for user ${userId}`);
    }
}

// --- Utility Functions ---

async function getUserIdFromCustomerId(customerId: string): Promise<string | null> {
  if (!supabaseAdmin) { console.error("Supabase Admin not init in getUserIdFromCustomerId"); return null; }
  if (!customerId) return null;

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  // Log error only if it's not the expected 'no rows found' error
  if (error && error.code !== 'PGRST116') {
    console.error(`Error fetching profile for customer ${customerId}:`, error);
  }
  if (profile) {
    return profile.id;
  }

  // Fallback: Check Stripe customer metadata (less reliable if metadata wasn't set)
  try {
    const customer = await stripe.customers.retrieve(customerId);
    // Ensure customer is not deleted and metadata exists
    if (!customer.deleted && customer.metadata?.userId) {
      console.log(`Found userId in Stripe customer metadata for ${customerId}`);
      return customer.metadata.userId;
    }
  } catch (stripeError: any) {
     // Ignore 'resource_missing' error, log others
     if (stripeError?.code !== 'resource_missing') {
        console.error(`Error retrieving customer ${customerId} from Stripe:`, stripeError);
     }
  }

  console.warn(`Could not find user ID for Stripe customer ${customerId} in DB or metadata.`);
  return null;
}
