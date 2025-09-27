import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ensureUserProfile } from '@/utils/profile-helpers';
import { validateRequestBody } from '@/utils/security/validation';
import { z } from 'zod';
import { headers } from 'next/headers';
import crypto from 'crypto';

// Input validation schema
const withdrawalRequestSchema = z.object({
  amount_cents: z.number().int().min(100).max(1000000), // $1 - $10,000
  currency: z.string().min(3).max(3).default('USD'),
  payout_method_id: z.string().uuid(),
  two_factor_code: z.string().optional(),
  urgency: z.enum(['standard', 'express']).default('standard'),
});

// Security limits and controls
const WITHDRAWAL_LIMITS = {
  daily: 500000,    // $5,000
  weekly: 2000000,  // $20,000
  monthly: 10000000, // $100,000
  min_amount: 100,  // $1
  max_amount: 1000000, // $10,000 (requires manual review above this)
};

const RATE_LIMITS = {
  attempts_per_hour: 5,
  attempts_per_day: 20,
};

const HIGH_RISK_THRESHOLD = 100000; // $1,000 - requires manual review

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const headersList = await headers();
    const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';
    
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

    // Validate request body
    const body = await request.json();
    const validatedData = validateRequestBody(withdrawalRequestSchema, body);

    // Generate idempotency key
    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`${user.id}-${validatedData.amount_cents}-${validatedData.payout_method_id}-${Date.now()}`)
      .digest('hex');

    // Log withdrawal attempt
    await supabase.from('withdrawal_security_logs').insert({
      user_id: user.id,
      event_type: 'attempt',
      ip_address: ip,
      user_agent: userAgent,
      risk_score: 0, // Will be calculated below
      metadata: {
        action: 'withdrawal_request',
        amount_cents: validatedData.amount_cents,
        currency: validatedData.currency,
        payout_method_id: validatedData.payout_method_id,
        urgency: validatedData.urgency
      }
    });

    // 1. SECURITY CHECKS

    // Check if user is verified
    if (profile.identity_status !== 'verified') {
      return NextResponse.json({ 
        error: 'Identity verification required for withdrawals' 
      }, { status: 403 });
    }

    // Check if account has withdrawal hold
    if (profile.withdrawal_hold_until && new Date(profile.withdrawal_hold_until) > new Date()) {
      return NextResponse.json({ 
        error: 'Account has withdrawal hold until ' + profile.withdrawal_hold_until,
        hold_until: profile.withdrawal_hold_until
      }, { status: 403 });
    }

    // Check rate limits
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const { data: recentAttempts } = await supabase
      .from('withdrawals')
      .select('created_at, amount_cents')
      .eq('user_id', user.id)
      .gte('created_at', hourAgo.toISOString());

    const hourlyAttempts = recentAttempts?.filter(w => 
      new Date(w.created_at) > hourAgo
    ).length || 0;

    const dailyAttempts = recentAttempts?.filter(w => 
      new Date(w.created_at) > dayAgo
    ).length || 0;

    if (hourlyAttempts >= RATE_LIMITS.attempts_per_hour) {
      return NextResponse.json({ 
        error: 'Too many withdrawal attempts this hour. Please wait.' 
      }, { status: 429 });
    }

    if (dailyAttempts >= RATE_LIMITS.attempts_per_day) {
      return NextResponse.json({ 
        error: 'Daily withdrawal attempt limit reached. Please wait.' 
      }, { status: 429 });
    }

    // 2. BALANCE AND LIMITS CHECKS

    // Get user's available balance
    const { data: balanceData } = await supabase.rpc('get_user_available_balance', {
      p_user_id: user.id
    });

    const availableBalance = balanceData?.[0]?.available_balance_cents || 0;

    if (validatedData.amount_cents > availableBalance) {
      return NextResponse.json({ 
        error: `Insufficient balance. Available: $${(availableBalance / 100).toFixed(2)}`,
        available_balance_cents: availableBalance
      }, { status: 400 });
    }

    // Check withdrawal limits
    const { data: rateLimits } = await supabase
      .from('withdrawal_rate_limits')
      .select('*')
      .eq('user_id', user.id);

    for (const limit of rateLimits || []) {
      if (limit.current_usage_cents + validatedData.amount_cents > limit.limit_amount_cents) {
        return NextResponse.json({ 
          error: `${limit.limit_type} withdrawal limit exceeded`,
          limit_type: limit.limit_type,
          limit_amount: limit.limit_amount_cents,
          current_usage: limit.current_usage_cents
        }, { status: 400 });
      }
    }

    // 3. PAYOUT METHOD VERIFICATION

    const { data: payoutMethod, error: methodError } = await supabase
      .from('payout_methods')
      .select('*')
      .eq('id', validatedData.payout_method_id)
      .eq('user_id', user.id)
      .single();

    if (methodError || !payoutMethod) {
      return NextResponse.json({ 
        error: 'Invalid payout method' 
      }, { status: 400 });
    }

    if (!payoutMethod.is_verified) {
      return NextResponse.json({ 
        error: 'Payout method not verified' 
      }, { status: 400 });
    }

    // 4. RISK ASSESSMENT

    let riskScore = 0;
    const riskFlags = [];

    // High amount risk
    if (validatedData.amount_cents >= HIGH_RISK_THRESHOLD) {
      riskScore += 30;
      riskFlags.push('high_amount');
    }

    // New payout method risk
    const methodAge = Date.now() - new Date(payoutMethod.added_at).getTime();
    if (methodAge < 72 * 60 * 60 * 1000) { // Less than 72 hours
      riskScore += 25;
      riskFlags.push('new_payout_method');
    }

    // Unusual pattern risk
    const recentWithdrawals = recentAttempts?.filter(w => 
      w.amount_cents > validatedData.amount_cents * 0.8
    ).length || 0;

    if (recentWithdrawals >= 3) {
      riskScore += 20;
      riskFlags.push('unusual_pattern');
    }

    // Determine if manual review is required
    const requiresReview = riskScore >= 50 || 
                          validatedData.amount_cents > WITHDRAWAL_LIMITS.max_amount;

    // 5. CREATE WITHDRAWAL REQUEST

    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('withdrawals')
      .insert({
        user_id: user.id,
        amount_cents: validatedData.amount_cents,
        currency: validatedData.currency,
        idempotency_key: idempotencyKey,
        payout_method_id: validatedData.payout_method_id,
        status: requiresReview ? 'requires_review' : 'pending',
        review_required: requiresReview,
        review_reason: requiresReview ? `Risk score: ${riskScore}, Flags: ${riskFlags.join(', ')}` : null,
        metadata: {
          urgency: validatedData.urgency,
          risk_score: riskScore,
          risk_flags: riskFlags,
          ip_address: ip,
          user_agent: userAgent,
          payout_method_type: payoutMethod.method_type,
          stripe_account_id: profile.stripe_account_id,
        }
      })
      .select()
      .single();

    if (withdrawalError) {
      console.error('Error creating withdrawal:', withdrawalError);
      return NextResponse.json({ 
        error: 'Failed to create withdrawal request',
        details: withdrawalError.message 
      }, { status: 500 });
    }

    // 6. UPDATE RATE LIMITS

    for (const limitType of ['daily', 'weekly', 'monthly']) {
      await supabase
        .from('withdrawal_rate_limits')
        .upsert({
          user_id: user.id,
          limit_type: limitType,
          limit_amount_cents: (WITHDRAWAL_LIMITS as any)[limitType],
          current_usage_cents: validatedData.amount_cents,
          reset_at: new Date(Date.now() + (limitType === 'daily' ? 24 : limitType === 'weekly' ? 168 : 720) * 60 * 60 * 1000),
        }, {
          onConflict: 'user_id,limit_type',
          ignoreDuplicates: false
        });
    }

    // 7. PROCESS OR QUEUE FOR REVIEW

    let stripePayoutId = null;
    let estimatedArrival = null;

    if (!requiresReview) {
      try {
        // Create Stripe instance
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
          apiVersion: '2025-07-30.basil',
        });

        // For Express accounts, we need to create a payout directly
        const payout = await stripe.payouts.create({
          amount: validatedData.amount_cents,
          currency: (validatedData.currency || 'usd').toLowerCase(),
          destination: payoutMethod.stripe_external_account_id,
          method: validatedData.urgency === 'express' ? 'instant' : 'standard',
          statement_descriptor: 'Pactify Withdrawal',
          metadata: {
            withdrawal_id: withdrawal.id,
            user_id: user.id,
            payout_method_id: validatedData.payout_method_id,
          }
        }, {
          stripeAccount: profile.stripe_account_id,
          idempotencyKey: idempotencyKey
        });

        stripePayoutId = payout.id;
        estimatedArrival = payout.arrival_date ? 
          new Date(payout.arrival_date * 1000).toISOString() :
          new Date(Date.now() + (validatedData.urgency === 'express' ? 30 * 60 * 1000 : 2 * 24 * 60 * 60 * 1000)).toISOString();

        // Update withdrawal with Stripe payout ID
        await supabase
          .from('withdrawals')
          .update({ 
            stripe_payout_id: stripePayoutId,
            status: 'processing'
          })
          .eq('id', withdrawal.id);

      } catch (stripeError: any) {
        console.error('Stripe payout creation error:', stripeError);
        
        // Mark withdrawal as failed
        await supabase
          .from('withdrawals')
          .update({ 
            status: 'failed',
            failed_reason: stripeError.message || 'Stripe payout failed'
          })
          .eq('id', withdrawal.id);

        return NextResponse.json({ 
          error: 'Failed to process withdrawal',
          details: stripeError.message || 'Payout creation failed'
        }, { status: 500 });
      }
    }

    // Log successful request
    await supabase.from('withdrawal_security_logs').insert({
      user_id: user.id,
      withdrawal_id: withdrawal.id,
      event_type: requiresReview ? 'review_flagged' : 'success',
      ip_address: ip,
      user_agent: userAgent,
      risk_score: riskScore,
      flags: riskFlags,
      metadata: {
        action: 'withdrawal_request',
        amount_cents: validatedData.amount_cents,
        requires_review: requiresReview,
        stripe_payout_id: stripePayoutId
      }
    });

    const response = {
      success: true,
      withdrawal: {
        id: withdrawal.id,
        amount_cents: withdrawal.amount_cents,
        currency: withdrawal.currency,
        status: withdrawal.status,
        requires_review: requiresReview,
        stripe_payout_id: stripePayoutId,
        estimated_arrival: estimatedArrival,
        created_at: withdrawal.created_at,
      },
      message: requiresReview ? 
        'Withdrawal request submitted for review. You will be notified when approved.' :
        `Withdrawal of $${(validatedData.amount_cents / 100).toFixed(2)} initiated successfully.`,
      risk_assessment: {
        score: riskScore,
        flags: riskFlags,
        requires_review: requiresReview,
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Withdrawal request error:', error);
    return NextResponse.json({ 
      error: 'Failed to process withdrawal request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET endpoint to check withdrawal eligibility
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('identity_status, withdrawal_hold_until, stripe_account_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Get available balance
    const { data: balanceData } = await supabase.rpc('get_user_available_balance', {
      p_user_id: user.id
    });

    const availableBalance = balanceData?.[0]?.available_balance_cents || 0;

    // Get rate limits
    const { data: rateLimits } = await supabase
      .from('withdrawal_rate_limits')
      .select('*')
      .eq('user_id', user.id);

    // Get payout methods
    const { data: payoutMethods } = await supabase
      .from('payout_methods')
      .select('id, method_type, is_verified, is_default')
      .eq('user_id', user.id)
      .eq('is_verified', true);

    const eligibility = {
      can_withdraw: profile.identity_status === 'verified' &&
                   (!profile.withdrawal_hold_until || new Date(profile.withdrawal_hold_until) <= new Date()) &&
                   availableBalance > 0 &&
                   (payoutMethods?.length || 0) > 0,
      reasons: [] as string[],
      available_balance_cents: availableBalance,
      withdrawal_limits: WITHDRAWAL_LIMITS,
      rate_limits: rateLimits,
      verified_payout_methods: payoutMethods?.length || 0,
      withdrawal_hold_until: profile.withdrawal_hold_until,
    };

    // Add reasons for ineligibility
    if (profile.identity_status !== 'verified') {
      eligibility.reasons.push('Identity verification required');
    }
    if (profile.withdrawal_hold_until && new Date(profile.withdrawal_hold_until) > new Date()) {
      eligibility.reasons.push('Account has withdrawal hold');
    }
    if (availableBalance <= 0) {
      eligibility.reasons.push('Insufficient balance');
    }
    if ((payoutMethods?.length || 0) === 0) {
      eligibility.reasons.push('No verified payout methods');
    }

    return NextResponse.json({
      success: true,
      eligibility,
    });

  } catch (error) {
    console.error('Withdrawal eligibility check error:', error);
    return NextResponse.json({ 
      error: 'Failed to check withdrawal eligibility',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}