import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { withFullSecurity } from '@/utils/security/middleware';
import { auditLogger } from '@/utils/security/audit-logger';
import Stripe from 'stripe';
import type { User } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
});

async function handleBillingPortal(request: NextRequest, user?: User) {
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required" },
      { status: 401 }
    );
  }
  try {
    const supabase = await createClient();
    
    // Get user's profile to check subscription
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

    let customerId = profile.stripe_customer_id;
    
    // Create Stripe customer if doesn't exist
    if (!customerId) {
      try {
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
          
        await auditLogger.logSecurityEvent({
          userId: user.id,
          action: 'stripe_customer_created',
          resource: 'billing',
          details: { customer_id: customerId },
          success: true,
          severity: 'low'
        });
        
      } catch (stripeError) {
        console.error('Failed to create Stripe customer:', stripeError);
        return NextResponse.json(
          { error: 'Failed to create billing account' },
          { status: 500 }
        );
      }
    }

    // Get return URL from request
    const body = await request.json().catch(() => ({}));
    const returnUrl = body.return_url || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/subscription`;

    // Create billing portal session
    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      await auditLogger.logSecurityEvent({
        userId: user.id,
        action: 'billing_portal_accessed',
        resource: 'billing',
        details: { 
          customer_id: customerId,
          session_id: portalSession.id 
        },
        success: true,
        severity: 'low'
      });

      return NextResponse.json({
        success: true,
        url: portalSession.url,
        session_id: portalSession.id
      });

    } catch (stripeError: any) {
      console.error('Failed to create billing portal session:', stripeError);
      
      await auditLogger.logSecurityEvent({
        userId: user.id,
        action: 'billing_portal_error',
        resource: 'billing',
        details: { 
          error: stripeError.message,
          customer_id: customerId 
        },
        success: false,
        severity: 'medium'
      });

      return NextResponse.json(
        { error: 'Failed to access billing portal' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Billing portal error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const POST = withFullSecurity(handleBillingPortal);