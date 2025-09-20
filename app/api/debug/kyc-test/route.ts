// Temporary debug endpoint for KYC testing without authentication
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // TEMPORARY: Use hardcoded user for testing
    const user = { id: 'd148c0fd-fb68-4cdb-ad96-c50b482e1c73' };

    const body = await request.json();
    const { 
      user_id = user.id,
      contract_amount, 
      currency = "USD", 
      contract_id = null,
      action = "withdrawal"
    } = body;

    if (!contract_amount || contract_amount <= 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Valid contract amount is required" },
        { status: 400 }
      );
    }

    // Get user's current profile with KYC data (handle missing columns gracefully)
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user_id);

    const profile = profileData?.[0] || null;

    if (profileError) {
      console.error("Profile fetch error:", profileError);
      return NextResponse.json(
        { error: "PROFILE_ERROR", message: "Unable to fetch user profile", details: profileError },
        { status: 500 }
      );
    }

    if (!profile) {
      return NextResponse.json(
        { error: "NO_PROFILE", message: "No profile found for user", user_id, profileData },
        { status: 404 }
      );
    }

    console.log("Profile data:", profile);

    // Get KYC verification record (handle case where table/record doesn't exist)
    const { data: kycVerification } = await supabase
      .from("kyc_verifications")
      .select("*")
      .eq("profile_id", user_id)
      .eq("verification_type", "basic")
      .single();

    // Set defaults for missing KYC data
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
    const needsEnhancedKyc = contract_amount > 250000 || requiredLevel === "business"; // $2500+
    const enhancedKycReady = needsEnhancedKyc ? (enhancedKycStatus === "verified") : true;

    // Determine overall eligibility
    const eligible = verificationSufficient && stripeAccountReady && enhancedKycReady;

    // Get verification levels info
    const verificationLevels = {
      basic: {
        name: "Basic Verification",
        max_amount: 50000, // $500
        requirements: ["Email verification", "Phone verification"],
        estimated_time: "Instant",
        stripe_required: false,
        description: "For small transactions up to $500"
      },
      enhanced: {
        name: "Enhanced Verification", 
        max_amount: 250000, // $2500
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
      }
    });

  } catch (error) {
    console.error("KYC requirements check error:", error);
    return NextResponse.json(
      { 
        error: "INTERNAL_ERROR", 
        message: "Unable to get verification status",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

// Helper functions
function getRequiredVerificationLevel(amount: number, currency: string, action: string): string {
  const amountInCents = Math.round(amount * 100);
  
  if (action === "withdrawal") {
    if (amountInCents <= 50000) return "enhanced";
    if (amountInCents <= 250000) return "enhanced";
    return "business";
  } else {
    if (amountInCents <= 50000) return "basic";
    if (amountInCents <= 250000) return "enhanced";
    return "business";
  }
}

function isVerificationSufficient(currentLevel: string, requiredLevel: string, kycStatus: string): boolean {
  if (kycStatus !== "approved") return false;
  
  const levels = { none: 0, basic: 1, enhanced: 2, business: 3 };
  const currentLevelNum = levels[currentLevel as keyof typeof levels] || 0;
  const requiredLevelNum = levels[requiredLevel as keyof typeof levels] || 0;
  
  return currentLevelNum >= requiredLevelNum;
}