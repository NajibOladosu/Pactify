// Debug endpoint to test KYC functionality without authentication
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    
    const { 
      contract_amount = 100,
      currency = "USD", 
      action = "withdrawal"
    } = body;

    // Use existing user for testing
    const user_id = 'd148c0fd-fb68-4cdb-ad96-c50b482e1c73'; // Oladosu Najib

    // Get user's current profile with KYC data
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select(`
        id,
        kyc_status,
        verification_level,
        stripe_connect_account_id,
        enhanced_kyc_status,
        kyc_verified_at
      `)
      .eq("id", user_id);

    const profile = profileData?.[0] || null;

    if (profileError) {
      return NextResponse.json({
        error: "Profile fetch error",
        details: profileError.message
      }, { status: 500 });
    }

    // Get KYC verification record
    const { data: kycVerification } = await supabase
      .from("kyc_verifications")
      .select("*")
      .eq("profile_id", user_id)
      .eq("verification_type", "basic")
      .single();

    // Set current KYC status
    const currentKycStatus = profile?.kyc_status || "not_started";
    const currentLevel = profile?.verification_level || "none";
    const hasStripeAccount = !!profile?.stripe_connect_account_id;
    const enhancedKycStatus = profile?.enhanced_kyc_status || "not_started";

    // Determine required verification level based on amount and action
    const requiredLevel = getRequiredVerificationLevel(contract_amount, currency, action);

    // Check if current verification is sufficient
    const verificationSufficient = isVerificationSufficient(
      currentLevel, 
      requiredLevel, 
      currentKycStatus
    );

    // Check if Stripe Connect account is needed
    const needsStripeAccount = requiredLevel !== "basic" && action === "withdrawal";
    const stripeAccountReady = needsStripeAccount ? hasStripeAccount : true;

    // Enhanced KYC check for high-value transactions
    const needsEnhancedKyc = contract_amount > 2500 || requiredLevel === "business";
    const enhancedKycReady = needsEnhancedKyc ? (enhancedKycStatus === "verified") : true;

    // Determine overall eligibility
    const eligible = verificationSufficient && stripeAccountReady && enhancedKycReady;

    // Get verification levels info
    const verificationLevels = {
      basic: {
        name: "Basic Verification",
        max_amount: 500,
        requirements: ["Email verification", "Phone verification"],
        estimated_time: "Instant",
        stripe_required: false,
        description: "For small transactions up to $500"
      },
      enhanced: {
        name: "Enhanced Verification", 
        max_amount: 2500,
        requirements: ["Government ID", "Address proof", "Selfie verification"],
        estimated_time: "1-2 business days",
        stripe_required: true,
        description: "For transactions up to $2,500 and withdrawal access"
      },
      business: {
        name: "Business Verification",
        max_amount: null,
        requirements: ["Business registration", "Tax ID", "Business bank account", "Beneficial ownership"],
        estimated_time: "3-5 business days",
        stripe_required: true,
        description: "For unlimited transaction amounts and business features"
      }
    };

    return NextResponse.json({
      success: true,
      eligible,
      contract_amount,
      currency,
      action,
      current_verification: {
        level: currentLevel,
        status: currentKycStatus,
        enhanced_kyc_status: enhancedKycStatus,
        stripe_account_id: profile?.stripe_connect_account_id || null,
        stripe_ready: stripeAccountReady,
        kyc_verified_at: profile?.kyc_verified_at || null
      },
      required_verification: {
        level: requiredLevel,
        details: verificationLevels[requiredLevel as keyof typeof verificationLevels]
      },
      verification_levels: verificationLevels,
      checks: {
        verification_sufficient: verificationSufficient,
        stripe_account_required: needsStripeAccount,
        stripe_account_ready: stripeAccountReady,
        enhanced_kyc_required: needsEnhancedKyc,
        enhanced_kyc_ready: enhancedKycReady
      },
      test_user_id: user_id,
      profile_data: profile
    });

  } catch (error) {
    console.error("KYC test error:", error);
    return NextResponse.json({
      error: "KYC test failed",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

// Helper functions
function getRequiredVerificationLevel(amount: number, currency: string, action: string): string {
  // Convert to cents for standardized comparison
  const amountInCents = Math.round(amount * 100);
  
  // Different requirements based on action type
  if (action === "withdrawal") {
    // Withdrawals always need at least enhanced for Stripe Connect
    if (amountInCents <= 50000) return "enhanced"; // Up to $500 - enhanced
    if (amountInCents <= 250000) return "enhanced"; // Up to $2500 - enhanced
    return "business"; // $2500+ - business
  } else {
    // Contract creation and payment release
    if (amountInCents <= 50000) return "basic"; // Up to $500 - basic
    if (amountInCents <= 250000) return "enhanced"; // Up to $2500 - enhanced
    return "business"; // $2500+ - business
  }
}

function isVerificationSufficient(currentLevel: string, requiredLevel: string, kycStatus: string): boolean {
  if (kycStatus !== "approved") return false;
  
  const levels = { none: 0, basic: 1, enhanced: 2, business: 3 };
  const currentLevelNum = levels[currentLevel as keyof typeof levels] || 0;
  const requiredLevelNum = levels[requiredLevel as keyof typeof levels] || 0;
  
  return currentLevelNum >= requiredLevelNum;
}