import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ensureUserProfile } from '@/utils/profile-helpers';
import { validateRequestBody } from '@/utils/security/validation';
import { z } from 'zod';

const createAccountSchema = z.object({
  country: z.string().min(2).max(2),
  type: z.enum(['express', 'standard', 'custom']).default('express'),
  business_type: z.enum(['individual', 'company']).default('individual'),
  email: z.string().email().optional(),
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

    // Check if user already has a Stripe Connect account
    if (profile.stripe_connect_account_id) {
      return NextResponse.json({ 
        error: 'User already has a Stripe Connect account',
        accountId: profile.stripe_connect_account_id
      }, { status: 400 });
    }

    // Validate request body
    const body = await request.json();
    const validatedData = validateRequestBody(createAccountSchema, body);

    // Create Stripe instance
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-03-31.basil',
    });
    
    const account = await stripe.accounts.create({
      type: validatedData.type,
      country: validatedData.country,
      business_type: validatedData.business_type,
      email: validatedData.email || user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      settings: {
        payouts: {
          schedule: {
            interval: 'manual',
          },
        },
      },
    });

    // Update user profile with Stripe Connect account ID
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        stripe_connect_account_id: account.id,
        stripe_connect_onboarded: false,
        stripe_connect_charges_enabled: false,
        stripe_connect_payouts_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    // Create KYC verification record
    const { error: kycError } = await supabase
      .from('kyc_verifications')
      .insert({
        profile_id: user.id,
        status: 'not_started',
        verification_level: 'basic',
        stripe_account_id: account.id,
      });

    if (kycError) {
      console.error('Error creating KYC verification:', kycError);
      // Don't fail the request, just log the error
    }

    return NextResponse.json({
      success: true,
      accountId: account.id,
      account: {
        id: account.id,
        type: account.type,
        country: account.country,
        business_type: account.business_type,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      },
    });

  } catch (error) {
    console.error('Stripe Connect account creation error:', error);
    return NextResponse.json({ 
      error: 'Failed to create Stripe Connect account',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}