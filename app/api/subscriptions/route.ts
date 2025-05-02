import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    if (!body.plan || !['professional', 'business'].includes(body.plan)) {
      return NextResponse.json(
        { error: "Invalid plan type" },
        { status: 400 }
      );
    }
    
    if (!body.billingCycle || !['monthly', 'yearly'].includes(body.billingCycle)) {
      return NextResponse.json(
        { error: "Invalid billing cycle" },
        { status: 400 }
      );
    }
    
    // In a real app, this would create a subscription in Stripe or another payment processor
    // and store the subscription in the database
    const subscription = {
      id: `sub_${Date.now()}`,
      plan: body.plan,
      billingCycle: body.billingCycle,
      status: 'active',
      createdAt: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + (body.billingCycle === 'monthly' ? 30 : 365) * 24 * 60 * 60 * 1000).toISOString()
    };
    
    return NextResponse.json({ 
      message: "Subscription created",
      subscription
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create subscription" },
      { status: 500 }
    );
  }
}

import { createClient } from '@/utils/supabase/server'; // Corrected import name
import { cookies } from 'next/headers'; // Keep cookies import if needed elsewhere, but not for createClient

export async function GET() {
  // const cookieStore = cookies(); // No longer needed here
  const supabase = await createClient(); // Await the async function and remove argument

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Error fetching user:', userError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch profile data (includes base tier and contract usage)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('subscription_tier, available_contracts, stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return NextResponse.json({ error: 'Failed to fetch profile data' }, { status: 500 });
    }

    // Fetch active subscription details from user_subscriptions table
    const { data: activeSubscription, error: subscriptionError } = await supabase
      .from('user_subscriptions')
      .select('*, subscription_plans(*)') // Join with subscription_plans
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing', 'past_due']) // Active states
      .maybeSingle(); // User might not have an active paid subscription

    if (subscriptionError) {
      console.error('Error fetching active subscription:', subscriptionError);
      // Don't fail outright, user might just be on free tier
    }

    let finalSubscriptionData;

    if (activeSubscription && activeSubscription.subscription_plans) {
      // User has an active paid subscription
      finalSubscriptionData = {
        planId: activeSubscription.plan_id,
        planName: activeSubscription.subscription_plans.name,
        status: activeSubscription.status,
        currentPeriodEnd: activeSubscription.current_period_end,
        cancelAtPeriodEnd: activeSubscription.cancel_at_period_end,
        stripeSubscriptionId: activeSubscription.stripe_subscription_id,
        stripePriceId: activeSubscription.stripe_price_id,
        priceMonthly: activeSubscription.subscription_plans.price_monthly,
        priceYearly: activeSubscription.subscription_plans.price_yearly,
        escrowFeePercentage: activeSubscription.subscription_plans.escrow_fee_percentage,
        maxContracts: activeSubscription.subscription_plans.max_contracts,
        features: activeSubscription.subscription_plans.features,
        // Include profile data for consistency if needed, though it might be redundant
        availableContracts: profile.available_contracts, // This might be NULL for paid plans
        stripeCustomerId: profile.stripe_customer_id,
      };
    } else {
      // User is likely on the free plan (or subscription expired/cancelled without active entry)
      // Fetch free plan details directly
      const { data: freePlan, error: freePlanError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', 'free')
        .single();

      if (freePlanError || !freePlan) {
         console.error('Error fetching free plan details:', freePlanError);
         return NextResponse.json({ error: 'Failed to fetch plan details' }, { status: 500 });
      }

      finalSubscriptionData = {
        planId: 'free',
        planName: freePlan.name,
        status: 'active', // Assume active if no specific subscription status
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        stripeSubscriptionId: null,
        stripePriceId: null,
        priceMonthly: freePlan.price_monthly,
        priceYearly: freePlan.price_yearly,
        escrowFeePercentage: freePlan.escrow_fee_percentage,
        maxContracts: freePlan.max_contracts,
        features: freePlan.features,
        availableContracts: profile.available_contracts, // Relevant for free plan
        stripeCustomerId: profile.stripe_customer_id,
      };
    }

    // Fetch active contract count using RPC
    let activeContractsCount = 0;
    const { data: countData, error: rpcError } = await supabase.rpc(
      'get_active_contract_count',
      { p_user_id: user.id }
    );

    if (rpcError) {
      console.error("API Error: Failed to count active contracts via RPC.", rpcError);
      // Handle error appropriately, maybe default to 0 but log it
      activeContractsCount = 0; // Default to 0 on error
    } else {
      activeContractsCount = countData ?? 0;
    }

    // Add the count to the response data
    const responseData = {
      ...finalSubscriptionData,
      activeContractsCount: activeContractsCount, // Add the fetched count
    };


    return NextResponse.json({
      message: "Subscription details fetched successfully",
      subscription: responseData // Send the combined data
    });

  } catch (error) {
    console.error('Unexpected error fetching subscription:', error);
    return NextResponse.json(
      { error: "Failed to fetch subscription details" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    
    if (!body.plan || !['free', 'professional', 'business'].includes(body.plan)) {
      return NextResponse.json(
        { error: "Invalid plan type" },
        { status: 400 }
      );
    }
    
    // In a real application, this would update the subscription in Stripe and the database
    const updatedSubscription = {
      id: "sub_current",
      plan: body.plan,
      billingCycle: body.billingCycle || 'monthly',
      status: "active",
      updatedAt: new Date().toISOString()
    };
    
    return NextResponse.json({ 
      message: "Subscription updated",
      subscription: updatedSubscription
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    // In a real application, this would cancel the subscription in Stripe and update the database
    return NextResponse.json({ 
      message: "Subscription cancelled",
      subscription: {
        id: "sub_current",
        status: "cancelled",
        cancelledAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}
