// Debug endpoint to test withdrawal methods without authentication
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    
    const {
      rail = 'paypal',
      label = 'Test PayPal Account',
      currency = 'USD',
      country = 'US',
      account_name = 'Test User',
      paypal_receiver = 'test@example.com'
    } = body;

    // Use an existing user for testing
    const testUserId = 'd148c0fd-fb68-4cdb-ad96-c50b482e1c73'; // Oladosu Najib
    
    // Check if test user exists, create if not
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', testUserId)
      .single();

    if (!existingProfile) {
      // Create test profile
      await supabase.from('profiles').insert({
        id: testUserId,
        display_name: 'Test User',
        user_type: 'freelancer',
        kyc_status: 'approved',
        verification_level: 'basic'
      });
    }

    // Get fee structure and processing info for this rail
    const { data: fees } = await supabase
      .from('payout_fees')
      .select('*')
      .eq('rail', rail)
      .eq('currency', currency)
      .eq('is_active', true)
      .limit(1)
      .single();

    const processingTime = fees?.processing_time_description || '1-2 business days';
    const feesDescription = fees ? 
      `${fees.percentage_fee ? (fees.percentage_fee * 100).toFixed(1) + '%' : 'Free'} ${fees.fixed_fee_cents ? '+ $' + (fees.fixed_fee_cents / 100).toFixed(2) : ''} fee`.trim() :
      'Standard fees apply';

    // Create withdrawal method
    const { data: method, error: methodError } = await supabase
      .from('withdrawal_methods')
      .insert({
        profile_id: testUserId,
        rail,
        label,
        currency,
        country,
        account_name,
        paypal_receiver,
        processing_time: processingTime,
        fees_description: feesDescription,
        is_default: false,
        is_verified: true,
        is_active: true,
        metadata: {
          test_method: true,
          created_via: 'debug_endpoint'
        }
      })
      .select()
      .single();

    if (methodError) {
      console.error('Error creating test withdrawal method:', methodError);
      return NextResponse.json({ 
        error: 'Failed to create test withdrawal method',
        details: methodError
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Test withdrawal method created successfully',
      method: {
        id: method.id,
        rail: method.rail,
        label: method.label,
        currency: method.currency,
        processing_time: method.processing_time,
        fees_description: method.fees_description,
        created_at: method.created_at
      },
      test_user_id: testUserId
    });

  } catch (error) {
    console.error('Test withdrawal method creation error:', error);
    return NextResponse.json({
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    
    // Get all test methods
    const { data: methods, error } = await supabase
      .from('withdrawal_methods')
      .select('*')
      .eq('profile_id', 'd148c0fd-fb68-4cdb-ad96-c50b482e1c73')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      methods: methods || [],
      count: methods?.length || 0
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}