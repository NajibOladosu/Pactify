// Fixed KYC requirements check endpoint that handles missing data gracefully

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { 
      user_id = user.id,
      contract_amount, 
      currency = "USD", 
      contract_id = null,
      action = "withdrawal" // withdrawal, contract_creation, payment_release
    } = body;

    if (!contract_amount || contract_amount <= 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Valid contract amount is required" },
        { status: 400 }
      );
    }

    // Get user's current profile with KYC data (handle missing columns gracefully)
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(`
        id,
        kyc_status,
        verification_level,
        stripe_connect_account_id,
        enhanced_kyc_status,
        kyc_verified_at
      `)
      .eq("id", user_id)
      .single();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
      return NextResponse.json(
        { error: "PROFILE_ERROR", message: "Unable to fetch user profile" },
        { status: 500 }
      );
    }

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

    // Generate action plan if not eligible
    const actionPlan = eligible ? null : generateActionPlan(
      currentLevel,
      requiredLevel,
      currentKycStatus,
      hasStripeAccount,
      enhancedKycStatus,
      kycVerification,
      action
    );

    // Log the check if for a specific contract
    if (contract_id) {
      await supabase.from("contract_activities").insert({
        contract_id,
        user_id: user.id,
        activity_type: "kyc_requirement_check",
        description: `KYC requirements checked for ${action}: ${contract_amount} ${currency}`,
        metadata: {
          contract_amount,
          currency,
          action,
          required_level: requiredLevel,
          current_level: currentLevel,
          eligible,
          verification_sufficient: verificationSufficient,
          stripe_account_ready: stripeAccountReady,
          enhanced_kyc_ready: enhancedKycReady
        }
      });
    }

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
      action_plan: actionPlan,
      estimated_completion_time: actionPlan ? getEstimatedCompletionTime(actionPlan) : null
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
  // Convert to cents for standardized comparison
  const amountInCents = Math.round(amount * 100);
  
  console.log(`🔍 KYC Check - Amount: $${amount}, Action: ${action}, Cents: ${amountInCents}`);
  
  // Enhanced security thresholds
  if (action === "withdrawal") {
    // Stricter requirements for withdrawals to prevent money laundering
    if (amountInCents >= 1000000) { // $10,000+
      console.log('🔒 Business verification required for withdrawal $10k+');
      return "business";
    }
    if (amountInCents >= 500000) { // $5,000+
      console.log('🔒 Enhanced verification required for withdrawal $5k+');
      return "enhanced";
    }
    if (amountInCents >= 10000) { // $100+ (much stricter than before)
      console.log('🔒 Enhanced verification required for withdrawal $100+');
      return "enhanced";
    }
    if (amountInCents >= 1000) { // $10+
      console.log('🔒 Basic verification required for withdrawal $10+');
      return "basic";
    }
    return "basic"; // Even small withdrawals need basic verification
  } else if (action === "contract_funding") {
    // Stricter funding requirements
    if (amountInCents >= 2500000) { // $25,000+
      console.log('🔒 Business verification required for funding $25k+');
      return "business";
    }
    if (amountInCents >= 1000000) { // $10,000+
      console.log('🔒 Enhanced verification required for funding $10k+');
      return "enhanced";
    }
    if (amountInCents >= 100000) { // $1,000+
      console.log('🔒 Enhanced verification required for funding $1k+');
      return "enhanced";
    }
    if (amountInCents >= 10000) { // $100+
      console.log('🔒 Basic verification required for funding $100+');
      return "basic";
    }
    return "none"; // Micro funding doesn't need verification
  } else {
    // Contract creation and payment release
    if (amountInCents >= 2500000) { // $25,000+
      console.log('🔒 Business verification required for $25k+');
      return "business";
    }
    if (amountInCents >= 500000) { // $5,000+
      console.log('🔒 Enhanced verification required for $5k+');
      return "enhanced";
    }
    if (amountInCents >= 50000) { // $500+
      console.log('🔒 Basic verification required for $500+');
      return "basic";
    }
    return "none";
  }
}

function isVerificationSufficient(currentLevel: string, requiredLevel: string, kycStatus: string): boolean {
  if (kycStatus !== "approved") return false;
  
  const levels = { none: 0, basic: 1, enhanced: 2, business: 3 };
  const currentLevelNum = levels[currentLevel as keyof typeof levels] || 0;
  const requiredLevelNum = levels[requiredLevel as keyof typeof levels] || 0;
  
  return currentLevelNum >= requiredLevelNum;
}

function generateActionPlan(
  currentLevel: string,
  requiredLevel: string,
  currentKycStatus: string,
  hasStripeAccount: boolean,
  enhancedKycStatus: string,
  kycVerification: any,
  action: string
): any[] {
  const actions = [];
  let stepNumber = 1;

  // Step 1: Basic KYC if needed
  if (currentKycStatus !== "approved" || currentLevel === "none") {
    if (!kycVerification || ["not_started", "rejected"].includes(currentKycStatus)) {
      actions.push({
        step: stepNumber++,
        action: "initiate_basic_kyc",
        title: "Complete Email Verification",
        description: "Verify your email address to unlock basic features",
        endpoint: "/api/kyc",
        method: "POST",
        estimated_time: "2 minutes",
        required: true,
        icon: "✉️"
      });
    }
  }

  // Step 2: Enhanced KYC if needed
  if (requiredLevel === "enhanced" || requiredLevel === "business") {
    if (currentLevel !== "enhanced" && currentLevel !== "business") {
      actions.push({
        step: stepNumber++,
        action: "initiate_enhanced_kyc",
        title: "Complete Enhanced Verification",
        description: "Upload government ID and complete identity verification",
        endpoint: "/api/connect/enhanced-kyc/create-session",
        method: "POST",
        estimated_time: "10-15 minutes",
        required: true,
        icon: "🆔",
        depends_on: currentKycStatus !== "approved" ? "basic_kyc" : null
      });
    }
  }

  // Step 3: Stripe Connect account for withdrawals
  if (action === "withdrawal" && !hasStripeAccount) {
    actions.push({
      step: stepNumber++,
      action: "create_stripe_account",
      title: "Set Up Payout Account",
      description: "Connect your bank account for receiving payments",
      endpoint: "/api/kyc/stripe-onboarding",
      method: "POST",
      estimated_time: "5-10 minutes",
      required: true,
      icon: "🏦",
      depends_on: "enhanced_kyc"
    });
  }

  // Step 4: Business verification if needed
  if (requiredLevel === "business" && currentLevel !== "business") {
    actions.push({
      step: stepNumber++,
      action: "initiate_business_kyc",
      title: "Complete Business Verification",
      description: "Submit business documents and beneficial ownership information",
      endpoint: "/api/kyc/business",
      method: "POST",
      estimated_time: "20-30 minutes",
      required: true,
      icon: "🏢",
      depends_on: "enhanced_kyc"
    });
  }

  // If everything is in progress, just wait
  if (actions.length === 0 && kycVerification?.status === "pending_review") {
    actions.push({
      step: 1,
      action: "wait_for_approval",
      title: "Verification Under Review",
      description: "Your documents are being reviewed by our team",
      estimated_time: requiredLevel === "basic" ? "Up to 24 hours" : 
                     requiredLevel === "enhanced" ? "1-2 business days" : "3-5 business days",
      required: true,
      icon: "⏳"
    });
  }

  return actions;
}

function getEstimatedCompletionTime(actionPlan: any[]): string {
  if (!actionPlan || actionPlan.length === 0) return "Complete";
  
  const timeEstimates = actionPlan.map(action => {
    const time = action.estimated_time || "";
    if (time.includes("minutes")) {
      return { unit: "minutes", value: parseInt(time) || 15 };
    } else if (time.includes("hours")) {
      return { unit: "hours", value: parseInt(time) || 24 };
    } else if (time.includes("business days")) {
      return { unit: "days", value: parseInt(time) || 3 };
    }
    return { unit: "minutes", value: 15 };
  });

  const maxDays = Math.max(...timeEstimates.filter(t => t.unit === "days").map(t => t.value), 0);
  const maxHours = Math.max(...timeEstimates.filter(t => t.unit === "hours").map(t => t.value), 0);
  const totalMinutes = timeEstimates.filter(t => t.unit === "minutes").reduce((sum, t) => sum + t.value, 0);
  
  if (maxDays > 0) {
    return `${maxDays} business day${maxDays > 1 ? 's' : ''}`;
  } else if (maxHours > 0) {
    return `Up to ${maxHours} hour${maxHours > 1 ? 's' : ''}`;
  } else if (totalMinutes > 60) {
    return `About ${Math.ceil(totalMinutes / 60)} hour${Math.ceil(totalMinutes / 60) > 1 ? 's' : ''}`;
  } else {
    return `About ${totalMinutes} minutes`;
  }
}