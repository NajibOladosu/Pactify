import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ensureUserProfile } from '@/utils/profile-helpers';
import { validateRequestBody } from '@/utils/security/validation';
import { z } from 'zod';
import { headers } from 'next/headers';

// Input validation schema
const addPayoutMethodSchema = z.object({
  type: z.enum(['bank_account', 'debit_card']),
  bank_account: z.object({
    country: z.string().min(2).max(2),
    currency: z.string().min(3).max(3),
    account_holder_name: z.string().min(1).max(100),
    account_holder_type: z.enum(['individual', 'company']).default('individual'),
    routing_number: z.string().optional(),
    account_number: z.string().min(4).max(34),
  }).optional(),
  debit_card: z.object({
    number: z.string().regex(/^\d{13,19}$/),
    exp_month: z.number().min(1).max(12),
    exp_year: z.number().min(2024).max(2034),
    cvc: z.string().regex(/^\d{3,4}$/),
  }).optional(),
  make_default: z.boolean().default(false),
}).refine(data => {
  if (data.type === 'bank_account') return !!data.bank_account;
  if (data.type === 'debit_card') return !!data.debit_card;
  return false;
}, {
  message: "Must provide corresponding details for the selected type"
});

// Hold period after adding new payout method (72 hours)
const PAYOUT_METHOD_HOLD_PERIOD = 72 * 60 * 60 * 1000;

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

    // Check if user has verified Connect account
    if (!profile.stripe_account_id) {
      return NextResponse.json({ 
        error: 'No Stripe Connect account found. Please create one first.' 
      }, { status: 400 });
    }

    if (profile.identity_status !== 'verified') {
      return NextResponse.json({ 
        error: 'Identity verification required before adding payout methods.' 
      }, { status: 403 });
    }

    // Validate request body
    const body = await request.json();
    const validatedData = validateRequestBody(addPayoutMethodSchema, body);

    // Log security event
    await supabase.from('withdrawal_security_logs').insert({
      user_id: user.id,
      event_type: 'attempt',
      ip_address: ip,
      user_agent: userAgent,
      metadata: {
        action: 'add_payout_method',
        method_type: validatedData.type
      }
    });

    // Create Stripe instance
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-06-20' as any,
    });

    let externalAccount: any;
    let lastFour: string = '';
    let accountName: string = '';

    try {
      if (validatedData.type === 'bank_account' && validatedData.bank_account) {
        const bankData = validatedData.bank_account;
        
        // Create external bank account
        externalAccount = await stripe.accounts.createExternalAccount(
          profile.stripe_account_id,
          {
            external_account: {
              object: 'bank_account',
              country: bankData.country,
              currency: bankData.currency,
              account_holder_name: bankData.account_holder_name,
              account_holder_type: bankData.account_holder_type,
              routing_number: bankData.routing_number,
              account_number: bankData.account_number,
            },
          }
        );

        lastFour = externalAccount.last4 || '';
        accountName = bankData.account_holder_name;

      } else if (validatedData.type === 'debit_card' && validatedData.debit_card) {
        const cardData = validatedData.debit_card;
        
        // Create external debit card
        externalAccount = await stripe.accounts.createExternalAccount(
          profile.stripe_account_id,
          {
            external_account: {
              object: 'card',
              number: cardData.number,
              exp_month: cardData.exp_month,
              exp_year: cardData.exp_year,
              cvc: cardData.cvc,
            },
          }
        );

        lastFour = externalAccount.last4 || '';
        accountName = externalAccount.name || 'Debit Card';
      }

      if (!externalAccount) {
        throw new Error('Failed to create external account');
      }

      // If making this the default, update other methods
      if (validatedData.make_default) {
        await supabase
          .from('payout_methods')
          .update({ is_default: false })
          .eq('user_id', user.id);
      }

      // Store payout method in database
      const { data: payoutMethod, error: insertError } = await supabase
        .from('payout_methods')
        .insert({
          user_id: user.id,
          stripe_external_account_id: externalAccount.id,
          stripe_account_id: profile.stripe_account_id,
          method_type: validatedData.type,
          last_four: lastFour,
          bank_name: externalAccount.bank_name || null,
          routing_number_last_four: externalAccount.routing_number ? 
            externalAccount.routing_number.slice(-4) : null,
          account_holder_type: externalAccount.account_holder_type || 'individual',
          country: externalAccount.country,
          currency: externalAccount.currency,
          is_default: validatedData.make_default,
          is_verified: false, // Will be updated by webhooks
          verification_status: 'pending',
          metadata: {
            created_from_ip: ip,
            user_agent: userAgent,
            stripe_object: externalAccount.object,
          },
        })
        .select()
        .single();

      if (insertError) {
        // Clean up Stripe external account if database insert failed
        try {
          await stripe.accounts.deleteExternalAccount(
            profile.stripe_account_id,
            externalAccount.id
          );
        } catch (cleanupError) {
          console.error('Failed to cleanup external account:', cleanupError);
        }
        
        throw new Error(`Failed to store payout method: ${insertError.message}`);
      }

      // Set withdrawal hold period for new payout method
      const holdUntil = new Date(Date.now() + PAYOUT_METHOD_HOLD_PERIOD);
      await supabase
        .from('profiles')
        .update({ 
          withdrawal_hold_until: holdUntil.toISOString(),
          default_payout_method_id: validatedData.make_default ? payoutMethod.id : profile.default_payout_method_id
        })
        .eq('id', user.id);

      // Log successful addition
      await supabase.from('withdrawal_security_logs').insert({
        user_id: user.id,
        event_type: 'success',
        ip_address: ip,
        user_agent: userAgent,
        metadata: {
          action: 'add_payout_method',
          method_type: validatedData.type,
          payout_method_id: payoutMethod.id,
          stripe_external_account_id: externalAccount.id
        }
      });

      return NextResponse.json({
        success: true,
        payout_method: {
          id: payoutMethod.id,
          type: payoutMethod.method_type,
          last_four: payoutMethod.last_four,
          bank_name: payoutMethod.bank_name,
          country: payoutMethod.country,
          currency: payoutMethod.currency,
          is_default: payoutMethod.is_default,
          verification_status: payoutMethod.verification_status,
          added_at: payoutMethod.added_at,
        },
        withdrawal_hold_until: holdUntil.toISOString(),
        message: `${validatedData.type === 'bank_account' ? 'Bank account' : 'Debit card'} added successfully. Withdrawals will be available after 72-hour security hold.`,
      });

    } catch (stripeError: any) {
      console.error('Stripe external account creation error:', stripeError);
      
      // Log the error
      await supabase.from('withdrawal_security_logs').insert({
        user_id: user.id,
        event_type: 'failure',
        ip_address: ip,
        user_agent: userAgent,
        metadata: {
          action: 'add_payout_method',
          error: stripeError.message || 'Unknown Stripe error'
        }
      });

      return NextResponse.json({ 
        error: 'Failed to add payout method',
        details: stripeError.message || 'External account creation failed'
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Payout method addition error:', error);
    return NextResponse.json({ 
      error: 'Failed to add payout method',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET endpoint to list payout methods
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's payout methods
    const { data: payoutMethods, error: methodsError } = await supabase
      .from('payout_methods')
      .select('*')
      .eq('user_id', user.id)
      .order('added_at', { ascending: false });

    if (methodsError) {
      console.error('Error fetching payout methods:', methodsError);
      return NextResponse.json({ 
        error: 'Failed to fetch payout methods' 
      }, { status: 500 });
    }

    // Get user profile for withdrawal hold info
    const { data: profile } = await supabase
      .from('profiles')
      .select('withdrawal_hold_until, default_payout_method_id')
      .eq('id', user.id)
      .single();

    const methods = payoutMethods?.map(method => ({
      id: method.id,
      type: method.method_type,
      last_four: method.last_four,
      bank_name: method.bank_name,
      routing_number_last_four: method.routing_number_last_four,
      country: method.country,
      currency: method.currency,
      is_default: method.is_default,
      is_verified: method.is_verified,
      verification_status: method.verification_status,
      added_at: method.added_at,
      verified_at: method.verified_at,
    })) || [];

    return NextResponse.json({
      success: true,
      payout_methods: methods,
      default_payout_method_id: profile?.default_payout_method_id,
      withdrawal_hold_until: profile?.withdrawal_hold_until,
      can_withdraw: !profile?.withdrawal_hold_until || 
                   new Date(profile.withdrawal_hold_until) <= new Date(),
    });

  } catch (error) {
    console.error('Payout methods fetch error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch payout methods',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}