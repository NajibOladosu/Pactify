import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
// Use Supabase Admin client for elevated privileges in webhooks
import { createClient, SupabaseClient } from '@supabase/supabase-js'; // Import SupabaseClient type

// Initialize Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil', // Use a consistent API version
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
    // FATAL: Missing required environment variables
    throw new Error("Missing Supabase configuration for webhook handler");
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
      // Supabase Admin client not initialized
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
    // Missing Stripe signature
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }
  if (!webhookSecret) {
     // Missing webhook secret configuration
     return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    // Webhook signature verification failed
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }


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
  }

  return NextResponse.json({ received: true });
}

// --- Helper Functions for Handling Specific Events ---

async function handleSubscriptionCheckout(subscriptionId: string, customerId: string) {
  if (!supabaseAdmin) { console.error("Supabase Admin not init in handleSubscriptionCheckout"); return; }
  let subscriptionDetails: Stripe.Subscription;
  try {
      subscriptionDetails = await stripe.subscriptions.retrieve(subscriptionId);
      // console.log(`--- Retrieved Subscription Details (Checkout) for ${subscriptionId} ---`); // Removed temporary logging
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

  // Safely access period dates from items.data[0] and validate
  const firstItem = subscriptionDetails.items?.data?.[0];
  if (!firstItem) {
    console.error(`Webhook Error (Checkout): Subscription ${subscriptionId} has no items.`);
    return;
  }
  const currentPeriodStart = firstItem.current_period_start;
  const currentPeriodEnd = firstItem.current_period_end;

  if (typeof currentPeriodStart !== 'number' || typeof currentPeriodEnd !== 'number') {
    console.error(`Webhook Error (Checkout): Missing or invalid period dates for subscription ${subscriptionId}. Start: ${currentPeriodStart}, End: ${currentPeriodEnd}`);
    // Optionally throw an error to make Stripe retry, or just return to acknowledge
    return; // Acknowledge webhook but don't update DB with bad data
  }

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

}

async function handleSubscriptionUpdate(subscriptionEventData: Stripe.Subscription) {
  // Renamed input param to avoid confusion with retrieved details
  if (!supabaseAdmin) { console.error("Supabase Admin not init in handleSubscriptionUpdate"); return; }

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

  // Safely access period dates from items.data[0] and validate
  const firstItemUpdate = subscriptionDetails.items?.data?.[0];
   if (!firstItemUpdate) {
     console.error(`Webhook Error (Update): Subscription ${subscriptionDetails.id} has no items.`);
     return;
   }
  const currentPeriodStart = firstItemUpdate.current_period_start;
  const currentPeriodEnd = firstItemUpdate.current_period_end;


  if (typeof currentPeriodStart !== 'number' || typeof currentPeriodEnd !== 'number') {
    console.error(`Webhook Error (Update): Missing or invalid period dates for subscription ${subscriptionDetails.id}. Start: ${currentPeriodStart}, End: ${currentPeriodEnd}`);
    return; // Acknowledge webhook but don't update DB with bad data
  }

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

}

async function handleSubscriptionDelete(subscription: Stripe.Subscription) {
  // Corrected function implementation
  if (!supabaseAdmin) { console.error("Supabase Admin not init in handleSubscriptionDelete"); return; }

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

}

async function handleInvoicePaid(subscriptionId: string, customerId: string) {
    if (!supabaseAdmin) { console.error("Supabase Admin not init in handleInvoicePaid"); return; }
    const userId = await getUserIdFromCustomerId(customerId);
    if (!userId) return;

    let subscriptionDetails: Stripe.Subscription;
     try {
         subscriptionDetails = await stripe.subscriptions.retrieve(subscriptionId);
      // console.log(`--- Retrieved Subscription Details (Invoice Paid) for ${subscriptionId} ---`); // Removed temporary logging
      // console.log(JSON.stringify(subscriptionDetails, null, 2));
  } catch (retrieveError) {
      console.error(`Could not retrieve subscription ${subscriptionId} from Stripe during invoice.paid handling:`, retrieveError);
         return;
     }

    if (!subscriptionDetails) {
        console.error(`Subscription ${subscriptionId} not found after retrieve call during invoice.paid.`);
        return;
    }

    // Safely access period end date from items.data[0] and validate
    const firstItemInvoice = subscriptionDetails.items?.data?.[0];
    if (!firstItemInvoice) {
      console.error(`Webhook Error (Invoice Paid): Subscription ${subscriptionId} has no items.`);
      return;
    }
    const currentPeriodEnd = firstItemInvoice.current_period_end;


    if (typeof currentPeriodEnd !== 'number') {
        console.error(`Webhook Error (Invoice Paid): Missing or invalid current_period_end for subscription ${subscriptionId}. End: ${currentPeriodEnd}`);
        return; // Acknowledge webhook but don't update DB with bad data
    }

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
    }
}

async function handleInvoicePaymentFailed(subscriptionId: string, customerId: string) {
    if (!supabaseAdmin) { console.error("Supabase Admin not init in handleInvoicePaymentFailed"); return; }
    const userId = await getUserIdFromCustomerId(customerId);
    if (!userId) return;

    const { error: updateError } = await supabaseAdmin
      .from('user_subscriptions')
      .update({ status: 'past_due' })
      .eq('stripe_subscription_id', subscriptionId);

    if (updateError) {
      console.error(`Failed to update subscription ${subscriptionId} on invoice failed for user ${userId}:`, updateError);
    } else {
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
