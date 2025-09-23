import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { withFullSecurity } from '@/utils/security/middleware';
import { auditLogger } from '@/utils/security/audit-logger';
import Stripe from 'stripe';
import { z } from 'zod';
import type { User } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
});

const checkoutSchema = z.object({
  plan_id: z.enum(['professional', 'business']),
  billing_cycle: z.enum(['monthly', 'annual']).default('monthly'),
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional()
});

// Stripe price IDs (these would be configured in your Stripe dashboard)
const STRIPE_PRICES = {
  professional: {
    monthly: process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID || 'price_professional_monthly',
    annual: process.env.STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID || 'price_professional_annual'
  },
  business: {
    monthly: process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID || 'price_business_monthly',
    annual: process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID || 'price_business_annual'
  }
};

async function handleCheckout(request: NextRequest, user?: User) {
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required" },
      { status: 401 }
    );
  }
  try {
    const supabase = await createClient();
    const body = await request.json();
    
    // Validate request
    const { plan_id, billing_cycle, success_url, cancel_url } = checkoutSchema.parse(body);
    
    // Get user's profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id, subscription_tier')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Check if user is trying to downgrade (not allowed via checkout)
    const tierHierarchy = { free: 0, professional: 1, business: 2 };
    const currentTier = tierHierarchy[profile.subscription_tier as keyof typeof tierHierarchy] || 0;
    const targetTier = tierHierarchy[plan_id];
    
    if (targetTier <= currentTier) {
      return NextResponse.json(
        { error: 'Use billing portal for downgrades or plan changes' },
        { status: 400 }
      );
    }

    let customerId = profile.stripe_customer_id;
    
    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email!,
        metadata: {
          user_id: user.id,
          platform: 'pactify'
        }
      });
      
      customerId = customer.id;
      
      // Update profile with customer ID
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // Get price ID
    const priceId = STRIPE_PRICES[plan_id][billing_cycle];
    if (!priceId) {
      return NextResponse.json(
        { error: 'Invalid plan configuration' },
        { status: 400 }
      );
    }

    // Create checkout session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      allow_promotion_codes: true,
      success_url: success_url || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/subscription?canceled=true`,
      metadata: {
        user_id: user.id,
        plan_id,
        billing_cycle
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_id,
          billing_cycle
        }
      }
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Log checkout session creation
    await auditLogger.logSecurityEvent({
      userId: user.id,
      action: 'subscription_checkout_created',
      resource: 'subscription',
      details: {
        plan_id,
        billing_cycle,
        session_id: session.id,
        customer_id: customerId
      },
      success: true,
      severity: 'low'
    });

    return NextResponse.json({
      success: true,
      session_id: session.id,
      url: session.url,
      plan: {
        id: plan_id,
        billing_cycle,
        price_id: priceId
      }
    });

  } catch (error: any) {
    console.error('Checkout error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid request data',
          details: error.errors 
        },
        { status: 400 }
      );
    }

    await auditLogger.logSecurityEvent({
      userId: user.id,
      action: 'subscription_checkout_error',
      resource: 'subscription',
      details: {
        error: error.message
      },
      success: false,
      severity: 'medium'
    });

    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

export const POST = withFullSecurity(handleCheckout);