import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
// Use Supabase Admin client for elevated privileges in webhooks
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Initialize Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
  typescript: true,
});

// Initialize Supabase Admin Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;

let supabaseAdmin: SupabaseClient | null = null;
if (supabaseUrl && supabaseServiceRole) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);
} else {
    throw new Error("Missing Supabase configuration for Connect webhook handler");
}

// Connect webhook events to handle
const relevantEvents = new Set([
  'account.updated',
  'capability.updated',
  'persons.updated', // for companies
  'account.application.authorized',
  'account.application.deauthorized',
]);

export async function POST(request: Request) {
  if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Webhook internal configuration error.' }, { status: 500 });
  }

  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('Stripe-Signature');
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }
  if (!webhookSecret) {
     return NextResponse.json({ error: 'Connect webhook secret not configured' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Connect webhook signature verification failed:', err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  if (relevantEvents.has(event.type)) {
    try {
      switch (event.type) {
        case 'account.updated': {
          const account = event.data.object as Stripe.Account;
          await handleAccountUpdated(account);
          break;
        }
        case 'capability.updated': {
          const capability = event.data.object as Stripe.Capability;
          await handleCapabilityUpdated(capability);
          break;
        }
        case 'person.updated': {
          const person = event.data.object as Stripe.Person;
          await handlePersonUpdated(person);
          break;
        }
        case 'account.application.authorized': {
          const application = event.data.object as any;
          await handleAccountAuthorized(application);
          break;
        }
        case 'account.application.deauthorized': {
          const application = event.data.object as any;
          await handleAccountDeauthorized(application);
          break;
        }
        default:
          console.warn(`Unhandled relevant Connect event type: ${event.type}`);
      }
    } catch (error: any) {
      console.error(`Error handling Connect webhook event ${event.type}:`, error);
      return NextResponse.json({ error: `Webhook handler failed: ${error.message || 'Unknown error'}` }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}

// --- Connect Webhook Handlers ---

async function handleAccountUpdated(account: Stripe.Account) {
  if (!supabaseAdmin) return;
  
  console.log(`Handling account.updated for account: ${account.id}`);

  // upsert connected_accounts with payouts_enabled & requirements
  const updateData = {
    cap_transfers: account.capabilities?.transfers || 'inactive',
    cap_card_payments: account.capabilities?.card_payments || 'inactive',
    payouts_enabled: account.payouts_enabled,
    charges_enabled: account.charges_enabled,
    details_submitted: account.details_submitted,
    requirements_currently_due: account.requirements?.currently_due || [],
    requirements_past_due: account.requirements?.past_due || [],
    requirements_eventually_due: account.requirements?.eventually_due || [],
    requirements_disabled_reason: account.requirements?.disabled_reason,
    tos_acceptance: account.tos_acceptance || null,
    updated_at: new Date().toISOString(),
  };

  // If account is fully set up, mark onboarding as completed
  if (account.details_submitted) {
    (updateData as any).onboarding_completed_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from('connected_accounts')
    .update(updateData)
    .eq('stripe_account_id', account.id);

  if (error) {
    console.error(`Failed to update connected account ${account.id}:`, error);
    throw new Error(`Database error during account update: ${error.message}`);
  }

  console.log(`Successfully updated connected account ${account.id}`);
}

async function handleCapabilityUpdated(capability: Stripe.Capability) {
  if (!supabaseAdmin) return;
  
  console.log(`Handling capability.updated for capability: ${capability.id}`);

  // Extract account ID from capability ID (format: "acct_xxx/transfers" or "acct_xxx/card_payments")
  const accountId = capability.account as string;
  const capabilityType = capability.id.split('/')[1]; // "transfers" or "card_payments"

  if (!capabilityType || !['transfers', 'card_payments'].includes(capabilityType)) {
    console.log(`Ignoring capability update for non-relevant capability: ${capability.id}`);
    return;
  }

  // if c.id ends with "/transfers", record c.status (active|pending|inactive)
  const updateField = capabilityType === 'transfers' ? 'cap_transfers' : 'cap_card_payments';
  
  const { error } = await supabaseAdmin
    .from('connected_accounts')
    .update({
      [updateField]: capability.status,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_account_id', accountId);

  if (error) {
    console.error(`Failed to update capability ${capability.id}:`, error);
    throw new Error(`Database error during capability update: ${error.message}`);
  }

  console.log(`Successfully updated capability ${capability.id} to status ${capability.status}`);
}

async function handlePersonUpdated(person: Stripe.Person) {
  if (!supabaseAdmin) return;
  
  console.log(`Handling persons.updated for person: ${person.id} in account: ${person.account}`);
  
  // optional: display status per owner/rep if you surface it
  // For now, we'll just log this event as it's mainly for companies with beneficial owners
  // The main account.updated event will handle the overall account status
  
  console.log(`Person update processed for account ${person.account}`);
}

async function handleAccountAuthorized(application: any) {
  if (!supabaseAdmin) return;
  
  console.log(`Handling account.application.authorized for account: ${application.id}`);
  
  // This fires when a user completes onboarding successfully
  const { error } = await supabaseAdmin
    .from('connected_accounts')
    .update({
      onboarding_completed_at: new Date().toISOString(),
      details_submitted: true,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_account_id', application.id);

  if (error) {
    console.error(`Failed to mark account ${application.id} as authorized:`, error);
  }

  // Update onboarding session status
  await supabaseAdmin
    .from('onboarding_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('connected_account_id', application.id);

  console.log(`Account ${application.id} marked as authorized and onboarding completed`);
}

async function handleAccountDeauthorized(application: any) {
  if (!supabaseAdmin) return;
  
  console.log(`Handling account.application.deauthorized for account: ${application.id}`);
  
  // This might happen if a user revokes access or there are compliance issues
  const { error } = await supabaseAdmin
    .from('connected_accounts')
    .update({
      payouts_enabled: false,
      charges_enabled: false,
      cap_transfers: 'inactive',
      cap_card_payments: 'inactive',
      requirements_disabled_reason: 'Account deauthorized',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_account_id', application.id);

  if (error) {
    console.error(`Failed to mark account ${application.id} as deauthorized:`, error);
  }

  console.log(`Account ${application.id} marked as deauthorized`);
}