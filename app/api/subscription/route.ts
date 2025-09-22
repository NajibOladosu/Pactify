import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { withAuth } from "@/utils/api/with-auth";
import type { User } from "@supabase/supabase-js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
});

async function handleSubscriptionRequest(request: NextRequest, user: User) {
  try {
    const supabase = await createClient();

    // Get user's current subscription
    const { data: subscription, error: subError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (subError && subError.code !== 'PGRST116') {
      console.error("Error fetching subscription:", subError);
      return NextResponse.json({ 
        error: "Failed to fetch subscription" 
      }, { status: 500 });
    }

    // Get profile with subscription tier
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();

    // If user has Stripe subscription, get details from Stripe
    let stripeSubscription = null;
    if (subscription?.stripe_subscription_id) {
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(
          subscription.stripe_subscription_id
        );
      } catch (error) {
        console.error("Error fetching Stripe subscription:", error);
      }
    }

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription?.id,
        user_id: user.id,
        tier: profile?.subscription_tier || 'free',
        status: subscription?.status || 'inactive',
        stripe_subscription_id: subscription?.stripe_subscription_id,
        stripe_customer_id: subscription?.stripe_customer_id,
        current_period_start: subscription?.current_period_start,
        current_period_end: subscription?.current_period_end,
        payment_date: subscription?.payment_date,
        renewal_date: subscription?.renewal_date,
        is_active: subscription?.is_active || false,
        stripe_details: stripeSubscription ? {
          status: stripeSubscription.status,
          current_period_start: new Date((stripeSubscription as any).current_period_start * 1000).toISOString(),
          current_period_end: new Date((stripeSubscription as any).current_period_end * 1000).toISOString(),
          cancel_at_period_end: (stripeSubscription as any).cancel_at_period_end,
          canceled_at: (stripeSubscription as any).canceled_at ? new Date((stripeSubscription as any).canceled_at * 1000).toISOString() : null
        } : null
      }
    });

  } catch (error) {
    console.error("Subscription API error:", error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}

async function handleSubscriptionUpdate(request: NextRequest, user: User) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { action, subscription_id } = body;

    if (!subscription_id) {
      return NextResponse.json({ 
        error: "subscription_id is required" 
      }, { status: 400 });
    }

    // Verify user owns this subscription
    const { data: subscription, error: subError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('id', subscription_id)
      .eq('user_id', user.id)
      .single();

    if (subError || !subscription) {
      return NextResponse.json({ 
        error: "Subscription not found" 
      }, { status: 404 });
    }

    switch (action) {
      case 'cancel':
        return await cancelSubscription(subscription, supabase);
      case 'reactivate':
        return await reactivateSubscription(subscription, supabase);
      case 'update_tier':
        return await updateSubscriptionTier(subscription, body.new_tier, supabase);
      default:
        return NextResponse.json({ 
          error: "Invalid action" 
        }, { status: 400 });
    }

  } catch (error) {
    console.error("Subscription update error:", error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}

async function cancelSubscription(subscription: any, supabase: any) {
  try {
    // Cancel in Stripe
    if (subscription.stripe_subscription_id) {
      await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
    }

    // Update in database
    const { error } = await supabase
      .from('user_subscriptions')
      .update({
        status: 'canceled',
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', subscription.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update profile tier to free
    await supabase
      .from('profiles')
      .update({ subscription_tier: 'free' })
      .eq('id', subscription.user_id);

    return NextResponse.json({
      success: true,
      message: "Subscription canceled successfully"
    });

  } catch (error) {
    console.error("Error canceling subscription:", error);
    return NextResponse.json({ 
      error: "Failed to cancel subscription" 
    }, { status: 500 });
  }
}

async function reactivateSubscription(subscription: any, supabase: any) {
  try {
    // Reactivate in Stripe if possible
    if (subscription.stripe_subscription_id) {
      const stripeSubscription = await stripe.subscriptions.retrieve(
        subscription.stripe_subscription_id
      );
      
      if (stripeSubscription.cancel_at_period_end) {
        await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: false
        });
      }
    }

    // Update in database
    const { error } = await supabase
      .from('user_subscriptions')
      .update({
        status: 'active',
        is_active: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', subscription.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Subscription reactivated successfully"
    });

  } catch (error) {
    console.error("Error reactivating subscription:", error);
    return NextResponse.json({ 
      error: "Failed to reactivate subscription" 
    }, { status: 500 });
  }
}

async function updateSubscriptionTier(subscription: any, newTier: string, supabase: any) {
  // This would require complex Stripe subscription modification
  // For now, return not implemented
  return NextResponse.json({ 
    error: "Subscription tier updates not yet implemented. Please cancel and create a new subscription." 
  }, { status: 501 });
}

export const GET = withAuth(handleSubscriptionRequest);
export const POST = withAuth(handleSubscriptionUpdate);