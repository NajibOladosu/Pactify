import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ensureUserProfile } from '@/utils/profile-helpers';
import { validateRequestBody } from '@/utils/security/validation';
import { z } from 'zod';

const onboardingLinkSchema = z.object({
  type: z.enum(['account_onboarding', 'account_update']).default('account_onboarding'),
  refresh_url: z.string().url().optional(),
  return_url: z.string().url().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure user profile exists
    const profile = await ensureUserProfile(user.id);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Check if user has a Stripe Connect account
    if (!profile.stripe_connect_account_id) {
      return NextResponse.json({ 
        error: 'User does not have a Stripe Connect account. Create one first.' 
      }, { status: 400 });
    }

    // Validate request body
    const body = await request.json();
    const validatedData = validateRequestBody(onboardingLinkSchema, body);

    // Get base URL from request
    const baseUrl = new URL(request.url).origin;
    
    // Create Stripe instance
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-06-30.basil',
    });
    
    const accountLink = await stripe.accountLinks.create({
      account: profile.stripe_connect_account_id,
      refresh_url: validatedData.refresh_url || `${baseUrl}/dashboard/settings/payments/refresh`,
      return_url: validatedData.return_url || `${baseUrl}/dashboard/settings/payments/return`,
      type: validatedData.type || 'account_onboarding',
    });

    // Update KYC verification status
    const { error: kycError } = await supabase
      .from('kyc_verifications')
      .update({
        status: 'in_progress',
        updated_at: new Date().toISOString(),
      })
      .eq('profile_id', user.id);

    if (kycError) {
      console.error('Error updating KYC verification:', kycError);
      // Don't fail the request, just log the error
    }

    return NextResponse.json({
      success: true,
      url: accountLink.url,
      expires_at: accountLink.expires_at,
    });

  } catch (error) {
    console.error('Stripe Connect onboarding link error:', error);
    return NextResponse.json({ 
      error: 'Failed to create onboarding link',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}