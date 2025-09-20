import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { contractId, amount } = body;

    if (!contractId || amount === undefined) {
      return NextResponse.json({ 
        error: 'Contract ID and amount are required' 
      }, { status: 400 });
    }

    const escrowAmount = parseFloat(amount);
    const requiresEnhancedKYC = escrowAmount > 100;

    // Get user's connected account status
    const { data: connectedAccount, error: accountError } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (accountError || !connectedAccount) {
      return NextResponse.json({
        canProceed: false,
        requiresBasicKYC: true,
        requiresEnhancedKYC: false,
        amount: escrowAmount,
        amountThreshold: 100,
        message: 'Basic KYC verification required',
        missingRequirements: ['stripe_connect_account']
      });
    }

    // Check basic KYC requirements
    const hasBasicKYC = connectedAccount.details_submitted && 
                       connectedAccount.capabilities?.transfers === 'active' &&
                       connectedAccount.payouts_enabled;

    if (!hasBasicKYC) {
      return NextResponse.json({
        canProceed: false,
        requiresBasicKYC: true,
        requiresEnhancedKYC: false,
        amount: escrowAmount,
        amountThreshold: 100,
        message: 'Basic KYC verification must be completed first',
        basicKYCStatus: {
          detailsSubmitted: connectedAccount.details_submitted,
          transfersActive: connectedAccount.capabilities?.transfers === 'active',
          payoutsEnabled: connectedAccount.payouts_enabled
        }
      });
    }

    // If amount <= $100, basic KYC is sufficient
    if (!requiresEnhancedKYC) {
      return NextResponse.json({
        canProceed: true,
        requiresBasicKYC: false,
        requiresEnhancedKYC: false,
        amount: escrowAmount,
        amountThreshold: 100,
        message: 'All verification requirements met',
        kycType: 'basic'
      });
    }

    // For amounts > $100, check enhanced KYC
    const hasEnhancedKYC = connectedAccount.enhanced_kyc_status === 'verified' &&
                          connectedAccount.documents_verified;

    if (!hasEnhancedKYC) {
      return NextResponse.json({
        canProceed: false,
        requiresBasicKYC: false,
        requiresEnhancedKYC: true,
        amount: escrowAmount,
        amountThreshold: 100,
        message: 'Enhanced KYC verification required for amounts over $100',
        enhancedKYCStatus: {
          status: connectedAccount.enhanced_kyc_status,
          documentsVerified: connectedAccount.documents_verified,
          lastAttempt: connectedAccount.last_verification_attempt
        },
        kycType: 'enhanced'
      });
    }

    // All requirements met
    return NextResponse.json({
      canProceed: true,
      requiresBasicKYC: false,
      requiresEnhancedKYC: false,
      amount: escrowAmount,
      amountThreshold: 100,
      message: 'All verification requirements met',
      kycType: 'enhanced',
      enhancedKYCCompletedAt: connectedAccount.enhanced_kyc_completed_at
    });

  } catch (error) {
    console.error('Error checking verification requirements:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}