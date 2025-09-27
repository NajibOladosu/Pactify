import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Initialize Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
});

// Initialize Supabase Admin Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);

// Events we want to handle
const RELEVANT_EVENTS = new Set([
  // Connect account events
  'account.updated',
  'account.application.authorized',
  'account.application.deauthorized',
  'account.external_account.created',
  'account.external_account.updated',
  'account.external_account.deleted',
  
  // Identity verification events
  'identity.verification_session.created',
  'identity.verification_session.processing',
  'identity.verification_session.verified',
  'identity.verification_session.requires_input',
  'identity.verification_session.failed',
  'identity.verification_session.canceled',
  
  // Payout events
  'payout.created',
  'payout.updated',
  'payout.paid',
  'payout.failed',
  'payout.canceled',
  
  // Transfer events
  'transfer.created',
  'transfer.updated',
  'transfer.paid',
  'transfer.failed',
  'transfer.reversed',
  
  // Capability events
  'capability.updated',
  
  // Person events (for Custom accounts)
  'person.created',
  'person.updated',
]);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    console.error('Missing Stripe signature or webhook secret');
    return NextResponse.json({ error: 'Webhook verification failed' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  console.log(`Received webhook event: ${event.type}`);

  if (!RELEVANT_EVENTS.has(event.type)) {
    console.log(`Ignoring irrelevant event: ${event.type}`);
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {
      // Connect Account Events
      case 'account.updated':
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;
        
      case 'account.application.authorized':
        await handleAccountAuthorized(event.data.object as Stripe.Application);
        break;
        
      case 'account.application.deauthorized':
        await handleAccountDeauthorized(event.data.object as Stripe.Application);
        break;

      // External Account Events
      case 'account.external_account.created':
        await handleExternalAccountCreated(event.data.object as Stripe.ExternalAccount);
        break;
        
      case 'account.external_account.updated':
        await handleExternalAccountUpdated(event.data.object as Stripe.ExternalAccount);
        break;
        
      case 'account.external_account.deleted':
        await handleExternalAccountDeleted(event.data.object as Stripe.ExternalAccount);
        break;

      // Identity Verification Events
      case 'identity.verification_session.created':
      case 'identity.verification_session.processing':
      case 'identity.verification_session.verified':
      case 'identity.verification_session.requires_input':
      case 'identity.verification_session.canceled':
        await handleIdentityVerificationSession(
          event.data.object as Stripe.Identity.VerificationSession,
          event.type
        );
        break;

      // Payout Events
      case 'payout.created':
      case 'payout.updated':
      case 'payout.paid':
      case 'payout.failed':
      case 'payout.canceled':
        await handlePayoutEvent(event.data.object as Stripe.Payout, event.type);
        break;

      // Transfer Events
      case 'transfer.created':
      case 'transfer.updated':
      case 'transfer.reversed':
        await handleTransferEvent(event.data.object as Stripe.Transfer, event.type);
        break;

      // Capability Events
      case 'capability.updated':
        await handleCapabilityUpdated(event.data.object as Stripe.Capability);
        break;

      default:
        console.warn(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error(`Error handling webhook event ${event.type}:`, error);
    return NextResponse.json(
      { error: `Webhook handler failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// Account event handlers
async function handleAccountUpdated(account: Stripe.Account) {
  console.log(`Handling account.updated for ${account.id}`);
  
  try {
    // Find the user associated with this Stripe account
    const { data: profile, error: findError } = await supabaseAdmin
      .from('profiles')
      .select('id, identity_status')
      .eq('stripe_account_id', account.id)
      .single();

    if (findError || !profile) {
      console.log(`No profile found for Stripe account ${account.id}`);
      return;
    }

    // Update profile with account status
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    // Update identity status based on account details
    if (account.details_submitted && account.charges_enabled) {
      updateData.identity_status = 'verified';
    } else if (account.requirements?.currently_due && account.requirements.currently_due.length > 0) {
      updateData.identity_status = 'requires_input';
    }

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', profile.id);

    if (updateError) {
      console.error(`Error updating profile for account ${account.id}:`, updateError);
    }

    // Update connected_accounts table if it exists
    await supabaseAdmin
      .from('connected_accounts')
      .update({
        payouts_enabled: account.payouts_enabled,
        charges_enabled: account.charges_enabled,
        details_submitted: account.details_submitted,
        requirements_currently_due: account.requirements?.currently_due || [],
        requirements_past_due: account.requirements?.past_due || [],
        requirements_eventually_due: account.requirements?.eventually_due || [],
        requirements_disabled_reason: account.requirements?.disabled_reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_account_id', account.id);

  } catch (error) {
    console.error(`Error handling account.updated for ${account.id}:`, error);
  }
}

async function handleAccountAuthorized(application: Stripe.Application) {
  console.log(`Account authorized: ${application.id}`);
  // Handle application authorization if needed
}

async function handleAccountDeauthorized(application: Stripe.Application) {
  console.log(`Account deauthorized: ${application.id}`);
  // Handle application deauthorization if needed
}

// External account event handlers
async function handleExternalAccountCreated(externalAccount: Stripe.ExternalAccount) {
  console.log(`External account created: ${externalAccount.id}`);
  
  try {
    // Update payout method verification status
    const { error } = await supabaseAdmin
      .from('payout_methods')
      .update({
        is_verified: true,
        verification_status: 'verified',
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_external_account_id', externalAccount.id);

    if (error) {
      console.error(`Error updating payout method for external account ${externalAccount.id}:`, error);
    }
  } catch (error) {
    console.error(`Error handling external account created ${externalAccount.id}:`, error);
  }
}

async function handleExternalAccountUpdated(externalAccount: Stripe.ExternalAccount) {
  console.log(`External account updated: ${externalAccount.id}`);
  
  try {
    // Update payout method with latest info
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if ('last4' in externalAccount) {
      updateData.last_four = externalAccount.last4;
    }

    const { error } = await supabaseAdmin
      .from('payout_methods')
      .update(updateData)
      .eq('stripe_external_account_id', externalAccount.id);

    if (error) {
      console.error(`Error updating payout method for external account ${externalAccount.id}:`, error);
    }
  } catch (error) {
    console.error(`Error handling external account updated ${externalAccount.id}:`, error);
  }
}

async function handleExternalAccountDeleted(externalAccount: Stripe.ExternalAccount) {
  console.log(`External account deleted: ${externalAccount.id}`);
  
  try {
    // Mark payout method as inactive
    const { error } = await supabaseAdmin
      .from('payout_methods')
      .update({
        is_verified: false,
        verification_status: 'deleted',
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_external_account_id', externalAccount.id);

    if (error) {
      console.error(`Error marking payout method as deleted for ${externalAccount.id}:`, error);
    }
  } catch (error) {
    console.error(`Error handling external account deleted ${externalAccount.id}:`, error);
  }
}

// Identity verification event handlers
async function handleIdentityVerificationSession(
  session: Stripe.Identity.VerificationSession,
  eventType: string
) {
  console.log(`Handling ${eventType} for verification session ${session.id}`);
  
  try {
    // Update verification session in database
    const { error: sessionError } = await supabaseAdmin
      .from('identity_verification_sessions')
      .update({
        status: session.status,
        verification_report: session.last_verification_report || null,
        completed_at: session.status === 'verified' ? new Date().toISOString() : null,
        metadata: {
          ...session.metadata,
          last_error: session.last_error,
          verified_outputs: session.verified_outputs,
        },
      })
      .eq('stripe_session_id', session.id);

    if (sessionError) {
      console.error(`Error updating verification session ${session.id}:`, sessionError);
    }

    // Find user and update their identity status
    const userId = session.metadata?.user_id;
    if (userId) {
      let identityStatus: string;
      
      switch (session.status) {
        case 'verified':
          identityStatus = 'verified';
          break;
        case 'requires_input':
          identityStatus = 'requires_input';
          break;
        case 'canceled':
          identityStatus = 'failed';
          break;
        default:
          identityStatus = 'pending';
      }

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
          identity_status: identityStatus,
          last_kyc_check_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (profileError) {
        console.error(`Error updating profile identity status for user ${userId}:`, profileError);
      }

      // Log security event
      await supabaseAdmin.from('withdrawal_security_logs').insert({
        user_id: userId,
        event_type: session.status === 'verified' ? 'success' : 'failure',
        metadata: {
          action: 'identity_verification',
          verification_session_id: session.id,
          status: session.status,
          event_type: eventType,
        }
      });
    }
  } catch (error) {
    console.error(`Error handling identity verification session ${session.id}:`, error);
  }
}

// Payout event handlers
async function handlePayoutEvent(payout: Stripe.Payout, eventType: string) {
  console.log(`Handling ${eventType} for payout ${payout.id}`);
  
  try {
    // Map Stripe payout status to our status
    let status: string;
    switch (payout.status) {
      case 'paid':
        status = 'paid';
        break;
      case 'pending':
        status = 'processing';
        break;
      case 'in_transit':
        status = 'processing';
        break;
      case 'canceled':
        status = 'cancelled';
        break;
      case 'failed':
        status = 'failed';
        break;
      default:
        status = 'processing';
    }

    // Update withdrawal record
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (payout.status === 'paid') {
      updateData.completed_at = new Date().toISOString();
    } else if (payout.status === 'failed') {
      updateData.failed_reason = payout.failure_message || 'Payout failed';
    }

    const { data: withdrawal, error: updateError } = await supabaseAdmin
      .from('withdrawals')
      .update(updateData)
      .eq('stripe_payout_id', payout.id)
      .select('id, user_id, amount')
      .single();

    if (updateError) {
      console.error(`Error updating withdrawal for payout ${payout.id}:`, updateError);
      return;
    }

    if (withdrawal) {
      // Handle balance restoration for failed/cancelled withdrawals
      if (payout.status === 'failed' || payout.status === 'canceled') {
        console.log(`Restoring balance for cancelled/failed withdrawal ${payout.id}, amount: ${withdrawal.amount}`);

        // Find any related fee transactions and restore them too
        const { data: feeWithdrawal } = await supabaseAdmin
          .from('withdrawals')
          .select('id, amount')
          .eq('stripe_payout_id', `${payout.id}_fee`)
          .single();

        if (feeWithdrawal) {
          await supabaseAdmin
            .from('withdrawals')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', feeWithdrawal.id);
        }

        // Note: Balance restoration is automatic since cancelled withdrawals
        // are excluded from the balance calculation in the frontend
      }

      // Log security event
      await supabaseAdmin.from('withdrawal_security_logs').insert({
        user_id: withdrawal.user_id,
        withdrawal_id: withdrawal.id,
        event_type: payout.status === 'paid' ? 'success' : 'failure',
        metadata: {
          action: 'payout_status_update',
          stripe_payout_id: payout.id,
          status: payout.status,
          event_type: eventType,
          amount: parseFloat(withdrawal.amount.toString()),
        }
      });

      // Create notification for user
      let notificationTitle: string;
      let notificationMessage: string;

      switch (payout.status) {
        case 'paid':
          notificationTitle = 'Withdrawal Completed';
          notificationMessage = `Your withdrawal of $${parseFloat(withdrawal.amount.toString()).toFixed(2)} has been completed.`;
          break;
        case 'failed':
          notificationTitle = 'Withdrawal Failed';
          notificationMessage = `Your withdrawal of $${parseFloat(withdrawal.amount.toString()).toFixed(2)} has failed. ${payout.failure_message || ''}`;
          break;
        case 'canceled':
          notificationTitle = 'Withdrawal Cancelled';
          notificationMessage = `Your withdrawal of $${parseFloat(withdrawal.amount.toString()).toFixed(2)} has been cancelled.`;
          break;
        default:
          notificationTitle = 'Withdrawal Update';
          notificationMessage = `Your withdrawal status has been updated to ${status}.`;
      }

      await supabaseAdmin.from('notifications').insert({
        user_id: withdrawal.user_id,
        type: 'withdrawal_update',
        title: notificationTitle,
        message: notificationMessage,
        related_entity_type: 'withdrawal',
        related_entity_id: withdrawal.id,
      });
    }
  } catch (error) {
    console.error(`Error handling payout event ${payout.id}:`, error);
  }
}

// Transfer event handlers
async function handleTransferEvent(transfer: Stripe.Transfer, eventType: string) {
  console.log(`Handling ${eventType} for transfer ${transfer.id}`);
  
  try {
    // Log transfer events for reconciliation
    const contractId = transfer.metadata?.contract_id;
    const userId = transfer.metadata?.user_id;

    if (contractId && userId) {
      await supabaseAdmin.from('withdrawal_security_logs').insert({
        user_id: userId,
        event_type: transfer.reversed ? 'failure' : 'success',
        metadata: {
          action: 'stripe_transfer',
          stripe_transfer_id: transfer.id,
          contract_id: contractId,
          amount: transfer.amount,
          currency: transfer.currency,
          event_type: eventType,
          reversed: transfer.reversed,
        }
      });
    }
  } catch (error) {
    console.error(`Error handling transfer event ${transfer.id}:`, error);
  }
}

// Capability event handlers
async function handleCapabilityUpdated(capability: Stripe.Capability) {
  console.log(`Handling capability.updated for ${capability.account} - ${capability.id}`);
  
  try {
    // Update connected_accounts table with capability status
    const capabilityKey = `cap_${capability.id}`;
    const updateData = {
      [capabilityKey]: capability.status,
      updated_at: new Date().toISOString(),
    };

    await supabaseAdmin
      .from('connected_accounts')
      .update(updateData)
      .eq('stripe_account_id', capability.account);
  } catch (error) {
    console.error(`Error handling capability updated ${capability.id}:`, error);
  }
}