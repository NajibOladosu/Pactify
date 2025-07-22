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

import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function GET() {
  const supabase = await createClient();

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Error fetching user:', userError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create service role client for bypassing RLS when needed
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );

    // Fetch profile data (includes base tier and contract usage)
    const { data: profile, error: profileError } = await serviceSupabase
      .from('profiles')
      .select('subscription_tier, available_contracts, stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return NextResponse.json({ error: 'Failed to fetch profile data' }, { status: 500 });
    }

    // Fetch active subscription details from user_subscriptions table
    console.log('🔍 Fetching subscription for user:', user.id);
    
    // Run subscription expiration check before fetching data
    console.log('⏰ Running subscription expiration check...');
    const { error: expirationError } = await serviceSupabase.rpc('handle_subscription_expiration');
    if (expirationError) {
      console.error('Warning: Expiration check failed:', expirationError);
    } else {
      console.log('✅ Expiration check completed');
    }

    // Enforce contract limits based on current subscription tier
    console.log('🔒 Enforcing contract limits...');
    const { error: contractLimitError } = await serviceSupabase.rpc('enforce_contract_limits', { p_user_id: user.id });
    if (contractLimitError) {
      console.error('Warning: Contract limit enforcement failed:', contractLimitError);
    } else {
      console.log('✅ Contract limits enforced');
    }
    
    // Debug: Check all available subscription plans
    const { data: allPlans, error: allPlansError } = await serviceSupabase
      .from('subscription_plans')
      .select('id, name')
      .order('id');
    
    console.log('📊 All available plans:', { allPlans, allPlansError });
    
    // Get active subscription using service role client to bypass RLS
    console.log('🔍 Querying user_subscriptions for user:', user.id);
    
    // First, let's see all subscriptions for this user using service role
    const { data: allUserSubscriptions, error: allSubsError } = await serviceSupabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id);
    
    console.log('📊 All subscriptions for user (service role):', { 
      count: allUserSubscriptions?.length || 0,
      subscriptions: allUserSubscriptions,
      error: allSubsError 
    });
    
    // Get subscription (active or expired) using service role
    const { data: activeSubscription, error: subscriptionError } = await serviceSupabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'expired', 'past_due'])
      .order('created_at', { ascending: false })
      .maybeSingle();
    
    console.log('🎯 Subscription query result:', { 
      subscription: activeSubscription, 
      subscriptionError,
      hasSubscription: !!activeSubscription,
      status: activeSubscription?.status
    });
    
    // If we have a subscription, fetch the plan details separately
    let planDetails = null;
    if (activeSubscription?.plan_id) {
      const { data: plan, error: planError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', activeSubscription.plan_id)
        .single();
      
      console.log('📋 Plan details:', { 
        planId: activeSubscription.plan_id, 
        plan, 
        planError 
      });
      
      if (plan && !planError) {
        planDetails = plan;
      }
    }

    console.log('📊 Active subscription result:', {
      activeSubscription,
      subscriptionError,
      userId: user.id,
      profileData: profile
    });

    if (subscriptionError) {
      console.error('❌ Error fetching active subscription:', subscriptionError);
      // Don't fail outright, user might just be on free tier
    }

    let finalSubscriptionData;

    if (activeSubscription) {
      // User has a subscription record (active, expired, or past_due) - this is the source of truth
      console.log(`✅ Found ${activeSubscription.status} subscription, using subscription data as source of truth`);
      
      // Fetch plan details for the subscription
      const { data: subscriptionPlan, error: subscriptionPlanError } = await serviceSupabase
        .from('subscription_plans')
        .select('*')
        .eq('id', activeSubscription.plan_id)
        .single();
      
      if (subscriptionPlanError || !subscriptionPlan) {
        console.error('Error fetching subscription plan details:', subscriptionPlanError);
        return NextResponse.json({ error: 'Failed to fetch subscription plan details' }, { status: 500 });
      }

      // Get detailed subscription status including grace period info
      const { data: subscriptionStatus, error: statusError } = await serviceSupabase
        .rpc('get_user_subscription_status', { p_user_id: user.id })
        .single();

      if (statusError) {
        console.error('Error fetching subscription status:', statusError);
      }

      const statusData = subscriptionStatus as any || {};

      // Determine billing cycle from Stripe price ID
      let billingCycle = 'monthly'; // default
      if (activeSubscription.stripe_price_id) {
        if (activeSubscription.stripe_price_id.includes('yearly') || 
            activeSubscription.stripe_price_id === process.env.STRIPE_PRICE_ID_PROFESSIONAL_YEARLY ||
            activeSubscription.stripe_price_id === process.env.STRIPE_PRICE_ID_BUSINESS_YEARLY) {
          billingCycle = 'yearly';
        }
      }

      finalSubscriptionData = {
        planId: activeSubscription.plan_id,
        planName: subscriptionPlan.name,
        status: activeSubscription.status,
        currentPeriodEnd: activeSubscription.current_period_end,
        currentPeriodStart: activeSubscription.current_period_start,
        cancelAtPeriodEnd: activeSubscription.cancel_at_period_end,
        stripeSubscriptionId: activeSubscription.stripe_subscription_id,
        stripePriceId: activeSubscription.stripe_price_id,
        billingCycle: billingCycle,
        priceMonthly: subscriptionPlan.price_monthly,
        priceYearly: subscriptionPlan.price_yearly,
        escrowFeePercentage: subscriptionPlan.escrow_fee_percentage,
        maxContracts: subscriptionPlan.max_contracts,
        features: subscriptionPlan.features,
        availableContracts: profile.available_contracts,
        stripeCustomerId: profile.stripe_customer_id,
        // Grace period information
        isExpired: statusData?.is_expired || false,
        inGracePeriod: statusData?.in_grace_period || false,
        gracePeriodEnd: activeSubscription.grace_period_end,
        daysUntilFreeTier: statusData?.days_until_free_tier || 0,
      };
    } else {
      // No active subscription found in user_subscriptions table
      console.log('🆓 No active subscription found, falling back to free plan');
      console.log('📊 Profile tier was:', profile.subscription_tier, '(ignoring in favor of subscription table)');
      
      // Always use free plan if no active subscription exists
      const { data: freePlan, error: freePlanError } = await serviceSupabase
        .from('subscription_plans')
        .select('*')
        .eq('id', 'free')
        .single();

      if (freePlanError || !freePlan) {
         console.error('Error fetching free plan details:', freePlanError);
         return NextResponse.json({ error: 'Failed to fetch free plan details' }, { status: 500 });
      }

      finalSubscriptionData = {
        planId: 'free',
        planName: freePlan.name,
        status: 'active',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        stripeSubscriptionId: null,
        stripePriceId: null,
        priceMonthly: freePlan.price_monthly,
        priceYearly: freePlan.price_yearly,
        escrowFeePercentage: freePlan.escrow_fee_percentage,
        maxContracts: freePlan.max_contracts,
        features: freePlan.features,
        availableContracts: profile.available_contracts,
        stripeCustomerId: profile.stripe_customer_id,
      };
    }

    // Fetch active contract count with multiple fallback approaches
    let activeContractsCount = 0;
    
    console.log("🔍 Attempting to count contracts for user:", user.id, "email:", user.email);
    
    // Approach 1: Query by creator_id using service role
    const { data: creatorContracts, error: creatorError } = await serviceSupabase
      .from('contracts')
      .select('id, status, creator_id, client_email')
      .eq('creator_id', user.id);
    
    console.log("📋 Creator contracts result:", { 
      count: creatorContracts?.length || 0, 
      error: creatorError,
      contracts: creatorContracts?.map(c => ({ id: c.id, status: c.status })) 
    });
    
    // Approach 2: Query by email fields (client_email, etc.)
    const { data: emailContracts, error: emailError } = await serviceSupabase
      .from('contracts')
      .select('id, status, creator_id, client_email, freelancer_id, client_id')
      .eq('client_email', user.email);
    
    console.log("📧 Email-based contracts result:", { 
      count: emailContracts?.length || 0, 
      error: emailError,
      contracts: emailContracts?.map(c => ({ id: c.id, status: c.status, client_email: c.client_email }))
    });
    
    // Approach 3: Query by user ID in client_id or freelancer_id
    const { data: partyContracts, error: partyError } = await serviceSupabase
      .from('contracts')
      .select('id, status, creator_id, client_id, freelancer_id, client_email')
      .or(`client_id.eq.${user.id},freelancer_id.eq.${user.id}`);
    
    console.log("👥 Party contracts result:", { 
      count: partyContracts?.length || 0, 
      error: partyError,
      contracts: partyContracts?.map(c => ({ id: c.id, status: c.status, client_id: c.client_id, freelancer_id: c.freelancer_id }))
    });
    
    // Combine all contracts and remove duplicates
    const allContracts = [
      ...(creatorContracts || []),
      ...(emailContracts || []),
      ...(partyContracts || [])
    ];
    
    // Remove duplicates by ID
    const uniqueContracts = allContracts.filter((contract, index, self) => 
      index === self.findIndex(c => c.id === contract.id)
    );
    
    console.log("🔍 All unique contracts found:", uniqueContracts.length);
    
    // Filter for active statuses (based on actual contract statuses in the database)
    const activeStatuses = [
      'draft', 
      'pending', 
      'signed', 
      'funded', 
      'in_progress', 
      'awaiting_freelancer_review', 
      'freelancer_accepted',
      'pending_signatures',
      'pending_funding'
    ];
    activeContractsCount = uniqueContracts.filter(contract => 
      activeStatuses.includes(contract.status)
    ).length;
    
    console.log("✅ Final active contract count:", activeContractsCount, "out of", uniqueContracts.length, "total contracts");

    // Add the count to the response data
    const responseData = {
      ...finalSubscriptionData,
      activeContractsCount: activeContractsCount, // Add the fetched count
    };


    console.log('📤 Final response data:', {
      responseData,
      originalActiveSubscription: activeSubscription,
      planDetails: planDetails,
      profileTier: profile.subscription_tier
    });

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
