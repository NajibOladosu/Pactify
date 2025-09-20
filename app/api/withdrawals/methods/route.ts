import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ensureUserProfile } from '@/utils/profile-helpers';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const currency = url.searchParams.get('currency');
    const rail = url.searchParams.get('rail');

    // Build query
    let query = supabase
      .from('withdrawal_methods')
      .select('*')
      .eq('profile_id', user.id)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (currency) {
      query = query.eq('currency', currency);
    }

    if (rail) {
      query = query.eq('rail', rail);
    }

    const { data: methods, error: methodError } = await query;

    if (methodError) {
      console.error('Error fetching withdrawal methods:', methodError);
      return NextResponse.json({ 
        error: 'Failed to fetch withdrawal methods' 
      }, { status: 500 });
    }

    // Format response
    const formattedMethods = methods.map(method => ({
      id: method.id,
      rail: method.rail,
      rail_name: method.metadata?.rail_display_name || getRailDisplayName(method.rail),
      label: method.label,
      currency: method.currency,
      country: method.country,
      account_name: method.account_name,
      last_four: method.last_four,
      processing_time: method.processing_time,
      fees_description: method.fees_description,
      is_default: method.is_default,
      is_verified: method.is_verified,
      created_at: method.created_at,
      metadata: method.metadata
    }));

    return NextResponse.json({
      success: true,
      methods: formattedMethods
    });

  } catch (error) {
    console.error('Withdrawal methods error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure user profile exists
    console.log('Creating withdrawal method for user:', user.id);
    const profile = await ensureUserProfile(user.id);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    console.log('Profile exists for user:', user.id);

    const body = await request.json();
    const {
      rail,
      label,
      currency = 'USD',
      country = 'US',
      account_name,
      stripe_external_account_id,
      wise_recipient_id,
      payoneer_payee_id,
      paypal_receiver,
      local_provider,
      local_account_ref,
      is_default = false
    } = body;

    if (!rail || !label) {
      return NextResponse.json({ 
        error: 'rail and label are required' 
      }, { status: 400 });
    }

    // Validate rail-specific fields
    const validationResult = validateRailFields(rail, body);
    if (!validationResult.valid) {
      return NextResponse.json({ 
        error: validationResult.error 
      }, { status: 400 });
    }

    // If setting as default, unset other defaults for this currency
    if (is_default) {
      await supabase
        .from('withdrawal_methods')
        .update({ is_default: false })
        .eq('profile_id', user.id)
        .eq('currency', currency);
    }

    // Get fee structure and processing info for this rail
    const feeStructure = await getRailFeeStructure(supabase, rail, currency, country);
    const processingInfo = await getRailProcessingInfo(supabase, rail, currency, country);

    // Create withdrawal method
    const { data: method, error: methodError } = await supabase
      .from('withdrawal_methods')
      .insert({
        profile_id: user.id,
        rail,
        label,
        currency,
        country,
        account_name,
        stripe_external_account_id,
        wise_recipient_id,
        payoneer_payee_id,
        paypal_receiver,
        local_provider,
        local_account_ref,
        processing_time: processingInfo?.processing_time || '2-7 business days',
        fees_description: processingInfo?.fees_description || 'Standard fees apply',
        is_default,
        is_verified: getInitialVerificationStatus(rail), // Real verification logic
        is_active: true,
        metadata: {
          fee_structure: feeStructure,
          supports_instant: processingInfo?.supports_instant || false,
          rail_display_name: getRailDisplayName(rail),
          icon: getRailIcon(rail)
        }
      })
      .select()
      .single();

    if (methodError) {
      console.error('Error creating withdrawal method:', methodError);
      return NextResponse.json({ 
        error: 'Failed to create withdrawal method',
        details: methodError.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      method: {
        id: method.id,
        rail: method.rail,
        rail_name: method.metadata?.rail_display_name || getRailDisplayName(method.rail),
        label: method.label,
        currency: method.currency,
        country: method.country,
        account_name: method.account_name,
        last_four: method.last_four,
        processing_time: method.processing_time,
        fees_description: method.fees_description,
        is_default: method.is_default,
        is_verified: method.is_verified,
        created_at: method.created_at,
        metadata: method.metadata
      }
    });

  } catch (error) {
    console.error('Create withdrawal method error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

function validateRailFields(rail: string, body: any) {
  switch (rail) {
    case 'stripe':
      if (!body.stripe_external_account_id) {
        return { valid: false, error: 'stripe_external_account_id is required for Stripe rail' };
      }
      break;
    case 'wise':
      if (!body.wise_recipient_id) {
        return { valid: false, error: 'wise_recipient_id is required for Wise rail' };
      }
      break;
    case 'payoneer':
      if (!body.payoneer_payee_id) {
        return { valid: false, error: 'payoneer_payee_id is required for Payoneer rail' };
      }
      break;
    case 'paypal':
      if (!body.paypal_receiver) {
        return { valid: false, error: 'paypal_receiver is required for PayPal rail' };
      }
      break;
    case 'local':
      if (!body.local_provider || !body.local_account_ref) {
        return { valid: false, error: 'local_provider and local_account_ref are required for local rail' };
      }
      break;
    default:
      return { valid: false, error: `Unsupported rail: ${rail}` };
  }
  return { valid: true };
}

async function getRailFeeStructure(supabase: any, rail: string, currency: string, country: string) {
  const { data: fees } = await supabase
    .from('payout_fees')
    .select('fixed_fee_cents, percentage_fee, minimum_fee_cents, maximum_fee_cents')
    .eq('rail', rail)
    .eq('currency', currency)
    .in('country', [country, null])
    .eq('is_active', true)
    .order('country', { ascending: false, nullsLast: true })
    .limit(1)
    .single();

  return fees || { fixed_fee_cents: 0, percentage_fee: 0, minimum_fee_cents: 0, maximum_fee_cents: null };
}

async function getRailProcessingInfo(supabase: any, rail: string, currency: string, country: string) {
  const { data: fees } = await supabase
    .from('payout_fees')
    .select('processing_time_min_hours, processing_time_max_hours, processing_time_description')
    .eq('rail', rail)
    .eq('currency', currency)
    .in('country', [country, null])
    .eq('is_active', true)
    .order('country', { ascending: false, nullsLast: true })
    .limit(1)
    .single();

  if (!fees) {
    return { supports_instant: false, processing_time: '2-7 business days' };
  }

  // Use the description if available, otherwise calculate from hours
  let processingTime = fees.processing_time_description;
  if (!processingTime) {
    const minHours = fees.processing_time_min_hours || 24;
    const maxHours = fees.processing_time_max_hours || 72;
    
    if (minHours < 24 && maxHours < 24) {
      processingTime = `${minHours}-${maxHours} hours`;
    } else {
      const minDays = Math.ceil(minHours / 24);
      const maxDays = Math.ceil(maxHours / 24);
      processingTime = `${minDays}-${maxDays} business days`;
    }
  }

  return {
    supports_instant: fees.processing_time_min_hours <= 1,
    processing_time: processingTime,
    fees_description: `${fees.percentage_fee ? (fees.percentage_fee * 100).toFixed(1) + '%' : 'Free'} ${fees.fixed_fee_cents ? '+ $' + (fees.fixed_fee_cents / 100).toFixed(2) : ''} fee`.trim()
  };
}

function getRailDisplayName(rail: string): string {
  const names: Record<string, string> = {
    stripe: 'Bank Transfer',
    wise: 'Wise Transfer',
    payoneer: 'Payoneer',
    paypal: 'PayPal',
    local: 'Local Payment'
  };
  return names[rail] || rail;
}

function getRailIcon(rail: string): string {
  const icons: Record<string, string> = {
    stripe: '🏦',
    wise: '🌍',
    payoneer: '💼',
    paypal: '🅿️',
    local: '📱'
  };
  return icons[rail] || '💳';
}

function getInitialVerificationStatus(rail: string): boolean {
  // Different rails have different verification requirements
  switch (rail) {
    case 'stripe':
      // Stripe requires micro-deposit verification or instant verification
      return false; // Starts as unverified, needs micro-deposits or bank login
    case 'paypal':
      // PayPal needs API verification of email/account existence
      return false; // Starts as unverified, needs PayPal API check
    case 'wise':
      // Wise needs API verification of recipient
      return false; // Starts as unverified, needs Wise API check
    case 'payoneer':
      // Payoneer needs API verification
      return false; // Starts as unverified, needs Payoneer API check
    case 'local':
      // Local bank transfers might be instantly verified or need manual review
      return false; // Starts as unverified, needs manual review
    default:
      return false; // Default to unverified
  }
}