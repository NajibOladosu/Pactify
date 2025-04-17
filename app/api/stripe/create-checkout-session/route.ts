import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import Stripe from 'stripe';

// Initialize Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil', // Match the version used elsewhere
  typescript: true,
});

// Get base URL for redirects
const getURL = () => {
  let url =
    process?.env?.NEXT_PUBLIC_APP_URL ?? // Set this to your site URL in production env.
    process?.env?.NEXT_PUBLIC_VERCEL_URL ?? // Automatically set by Vercel.
    'http://localhost:3000/';
  // Make sure to include `https://` when not localhost.
  url = url.includes('http') ? url : `https://${url}`;
  // Make sure to include a trailing `/`.
  url = url.charAt(url.length - 1) === '/' ? url : `${url}/`;
  return url;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json();
  const { planId, billingCycle = 'monthly' } = body; // e.g., 'professional', 'monthly'

  if (!planId || !['professional', 'business'].includes(planId)) {
    return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
  }
  if (!['monthly', 'yearly'].includes(billingCycle)) {
    return NextResponse.json({ error: 'Invalid billing cycle' }, { status: 400 });
  }

  try {
    // 1. Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Error fetching user:', userError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get profile & Stripe Customer ID (create if doesn't exist)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id') // Select only the customer ID here
      .eq('id', user.id)
      .single();

    // Add explicit null check for profile
    if (profileError || !profile) {
      console.error('Error fetching profile or profile is null:', profileError);
      return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
    }

    let stripeCustomerId = profile.stripe_customer_id;
    const userEmail = user.email; // Get email directly from the authenticated user object

    if (!stripeCustomerId) {
       if (!userEmail) {
         // Should not happen if user is authenticated, but good practice to check
         console.error('User email is missing, cannot create Stripe customer.');
         return NextResponse.json({ error: 'User email is missing' }, { status: 500 });
       }
      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: userEmail, // Use email from user object
        metadata: { userId: user.id },
      });
      stripeCustomerId = customer.id;
      // Update profile with new Stripe Customer ID
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', user.id);
      if (updateError) {
        console.error('Error updating profile with Stripe ID:', updateError);
        // Proceed cautiously, but log the error
      }
    }

    // 3. Get Stripe Price IDs from subscription_plans table
    const { data: planData, error: planError } = await supabase
      .from('subscription_plans')
      .select('stripe_price_id_monthly, stripe_price_id_yearly') // Select both price IDs
      .eq('id', planId)
      .single();

    if (planError || !planData) {
      console.error('Error fetching plan price IDs:', planError);
      return NextResponse.json({ error: `Could not find plan data for ${planId}` }, { status: 500 });
    }

    // Select the correct price ID based on billing cycle
    const stripePriceId = billingCycle === 'monthly'
      ? planData.stripe_price_id_monthly
      : planData.stripe_price_id_yearly;

    if (!stripePriceId) {
        console.error(`Stripe Price ID for ${planId} (${billingCycle}) is missing in the database.`);
        return NextResponse.json({ error: `Price ID for the selected plan/cycle is not configured.` }, { status: 500 });
    }

    // 4. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${getURL()}dashboard/subscription?session_id={CHECKOUT_SESSION_ID}`, // Redirect back to subscription page on success
      cancel_url: `${getURL()}dashboard/subscription`, // Redirect back on cancellation
      // Allow promotion codes if needed
      // allow_promotion_codes: true,
      // If you need to collect tax, configure automatic tax
      // automatic_tax: { enabled: true },
      // If you need to pass metadata
      // subscription_data: {
      //   metadata: { userId: user.id }
      // }
    });

    if (!session.url) {
        console.error("Stripe session creation failed, no URL returned.");
        return NextResponse.json({ error: 'Could not create checkout session' }, { status: 500 });
    }

    // 5. Return the session URL
    return NextResponse.json({ url: session.url });

  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    if (error instanceof Stripe.errors.StripeError) {
        return NextResponse.json({ error: `Stripe error: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
