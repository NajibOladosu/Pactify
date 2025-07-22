import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
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
  
  // Create service role client for database operations that might hit RLS
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!
  );

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

    // 2. Get Active Subscription from DB using SERVICE ROLE to bypass RLS
    const { data: activeSubscription, error: subError } = await serviceSupabase
      .from('user_subscriptions') // Corrected table name
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing', 'past_due']) // Include past_due subscriptions that might still be cancelable
      .maybeSingle(); // Expecting zero or one active/trialing subscription


    // Also check what subscriptions this user has at all using SERVICE ROLE
    const { data: allUserSubscriptions } = await serviceSupabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id);

    if (subError) {
      console.error('Cancel Subscription Error (DB Query):', subError);
      return NextResponse.json({ error: 'Failed to retrieve subscription.' }, { status: 500 });
    }

    if (!activeSubscription) {
      // Check if they have expired subscriptions
      const hasExpiredSubs = allUserSubscriptions?.some(sub => sub.status === 'expired');
      const hasCancelledSubs = allUserSubscriptions?.some(sub => sub.status === 'cancelled');
      
      let errorMessage = 'No active subscription found to cancel.';
      if (hasExpiredSubs) {
        errorMessage = 'Your subscription has already expired and cannot be cancelled.';
      } else if (hasCancelledSubs) {
        errorMessage = 'Your subscription has already been cancelled.';
      }
      
      
      return NextResponse.json({ 
        error: errorMessage
      }, { status: 404 });
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

    // 5. Update Supabase Subscription Record (Optimistic Update) using SERVICE ROLE
    const { error: updateError } = await serviceSupabase
      .from('user_subscriptions') // Corrected table name
      .update({
        cancel_at_period_end: true, // Mark for cancellation
        updated_at: new Date().toISOString(),
        // Keep status as 'active' until period ends - Stripe webhook will update final status
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
    return NextResponse.json({ 
      message: 'Subscription cancellation initiated successfully.',
      subscription: {
        id: activeSubscription.id,
        cancel_at_period_end: true,
        current_period_end: activeSubscription.current_period_end
      }
    });

  } catch (error: any) {
    console.error('Cancel Subscription Error (Unexpected):', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
