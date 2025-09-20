// Debug endpoint to check database schema

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // For debugging, skip auth and use service role
    // Get authenticated user (optional for debug)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    const userId = user?.id || 'debug-user';

    // Check profiles table structure (get first profile for column inspection)
    const { data: profilesData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .limit(1);
    
    const profileData = profilesData?.[0] || null;

    // Check if withdrawal_methods table exists
    const { data: methodsData, error: methodsError } = await supabase
      .from('withdrawal_methods')
      .select('count')
      .limit(1);

    // Check if kyc_verifications table exists
    const { data: kycData, error: kycError } = await supabase
      .from('kyc_verifications')
      .select('count')
      .limit(1);

    // Check if payout_fees table exists
    const { data: feesData, error: feesError } = await supabase
      .from('payout_fees')
      .select('count')
      .limit(1);

    return NextResponse.json({
      success: true,
      user_id: userId,
      schema_check: {
        profiles: {
          exists: !profileError,
          error: profileError?.message,
          columns: profileData ? Object.keys(profileData) : [],
          has_kyc_columns: profileData ? ['kyc_status', 'verification_level', 'stripe_connect_account_id'].every(col => col in profileData) : false
        },
        withdrawal_methods: {
          exists: !methodsError,
          error: methodsError?.message
        },
        kyc_verifications: {
          exists: !kycError,
          error: kycError?.message
        },
        payout_fees: {
          exists: !feesError,
          error: feesError?.message
        }
      },
      migration_status: {
        needs_migration: profileError || methodsError || kycError || feesError,
        missing_tables: [
          methodsError && 'withdrawal_methods',
          kycError && 'kyc_verifications', 
          feesError && 'payout_fees'
        ].filter(Boolean)
      }
    });

  } catch (error) {
    console.error('Schema debug error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}