import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import Stripe from 'stripe'; // Import Stripe class

// Initialize Stripe client directly
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil', // Match webhook API version or use your desired version
  typescript: true,
});

// No Database type import needed if relying on client inference

export async function POST(req: Request) {
  // Await the Supabase client creation - remove cookieStore argument
  const supabase = await createClient();

  try {
    // 1. Get User
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Cancel Subscription Error (User Auth):', userError);
      return NextResponse.json({ error: 'User not authenticated.' }, { status: 401 });
    }

    // 2. Get Active Subscription from DB (Corrected table name)
    const { data: activeSubscription, error: subError } = await supabase
      .from('user_subscriptions') // Corrected table name
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing']) // Should only cancel active/trialing subs
      .maybeSingle(); // Expecting zero or one active/trialing subscription

    if (subError) {
      console.error('Cancel Subscription Error (DB Query):', subError);
      return NextResponse.json({ error: 'Failed to retrieve subscription.' }, { status: 500 });
    }

    if (!activeSubscription) {
      return NextResponse.json({ error: 'No active subscription found to cancel.' }, { status: 404 });
    }

    // 3. Check for Stripe Subscription ID
    const stripeSubscriptionId = activeSubscription.stripe_subscription_id;
    if (!stripeSubscriptionId) {
        console.error('Cancel Subscription Error: Missing Stripe Subscription ID for DB record:', activeSubscription.id);
        // Decide how to handle this - maybe just update DB status? For now, error out.
        return NextResponse.json({ error: 'Subscription record is missing Stripe ID.' }, { status: 500 });
    }

    // 4. Update Stripe Subscription to Cancel at Period End
    try {
      await stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    } catch (stripeError: any) {
      console.error('Cancel Subscription Error (Stripe API):', stripeError);
      return NextResponse.json({ error: `Stripe Error: ${stripeError.message}` }, { status: 500 });
    }

    // 5. Update Supabase Subscription Record (Optimistic Update) (Corrected table name)
    const { error: updateError } = await supabase
      .from('user_subscriptions') // Corrected table name
      .update({
        status: 'cancelled', // Aligning with webhook logic for final state, 'free' might be a plan tier ID
        stripe_price_id: null, // Corrected column name
        cancel_at_period_end: true, // Mark for cancellation
        // Optionally set canceled_at or ended_at if cancelling immediately,
        // but cancel_at_period_end=true is usually preferred.
        // The webhook will handle the final status update when the period ends.
      })
      .eq('id', activeSubscription.id); // Target the specific subscription record

    if (updateError) {
      console.error('Cancel Subscription Error (DB Update):', updateError);
      // Note: Stripe subscription is already set to cancel. DB is out of sync.
      // Might need a reconciliation mechanism or manual check.
      return NextResponse.json({ error: 'Failed to update local subscription status.' }, { status: 500 });
    }

    // 6. Success
    console.log(`Subscription ${stripeSubscriptionId} for user ${user.id} marked for cancellation.`);
    return NextResponse.json({ message: 'Subscription cancellation initiated successfully.' });

  } catch (error: any) {
    console.error('Cancel Subscription Error (Unexpected):', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
