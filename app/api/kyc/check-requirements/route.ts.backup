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
    const { contract_amount, currency = "USD", contract_id = null } = body;

    if (!contract_amount || contract_amount <= 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Valid contract amount is required" },
        { status: 400 }
      );
    }

    // Get user's current KYC status and verification level
    const { data: profile } = await supabase
      .from("profiles")
      .select("kyc_status, verification_level, stripe_connect_account_id")
      .eq("id", user.id)
      .single();

    const { data: kycVerification } = await supabase
      .from("kyc_verifications")
      .select("*")
      .eq("profile_id", user.id)
      .single();

    // Determine required verification level based on contract amount
    const requiredLevel = getRequiredVerificationLevel(contract_amount, currency);
    const currentLevel = profile?.verification_level || "none";
    const currentKycStatus = profile?.kyc_status || "not_started";

    // Check if current verification is sufficient
    const verificationSufficient = isVerificationSufficient(
      currentLevel, 
      requiredLevel, 
      currentKycStatus
    );

    // Check Stripe Connect account status for enhanced/business levels
    const needsStripeAccount = requiredLevel !== "basic";
    const hasStripeAccount = !!profile?.stripe_connect_account_id;
    const stripeAccountReady = hasStripeAccount; // In real implementation, would check Stripe account status

    // Determine overall eligibility
    const eligible = verificationSufficient && (!needsStripeAccount || stripeAccountReady);

    // Get verification levels info
    const verificationLevels = {
      basic: {
        name: "Basic Verification",
        max_amount: 500,
        requirements: ["Email verification", "Phone verification"],
        estimated_time: "Instant",
        stripe_required: false
      },
      enhanced: {
        name: "Enhanced Verification", 
        max_amount: 5000,
        requirements: ["Government ID", "Address proof", "Selfie verification"],
        estimated_time: "1-2 business days",
        stripe_required: true
      },
      business: {
        name: "Business Verification",
        max_amount: null,
        requirements: ["Business registration", "Tax ID", "Business bank account", "Beneficial ownership"],
        estimated_time: "3-5 business days",
        stripe_required: true
      }
    };

    // Generate action plan if not eligible
    const actionPlan = eligible ? null : generateActionPlan(
      currentLevel,
      requiredLevel,
      currentKycStatus,
      hasStripeAccount,
      kycVerification
    );

    // If checking for a specific contract, log the check
    if (contract_id) {
      await supabase.from("contract_activities").insert({
        contract_id,
        user_id: user.id,
        activity_type: "kyc_requirement_check",
        description: `KYC requirements checked for contract amount ${contract_amount} ${currency}`,
        metadata: {
          contract_amount,
          currency,
          required_level: requiredLevel,
          current_level: currentLevel,
          eligible,
          verification_sufficient: verificationSufficient,
          stripe_account_ready: stripeAccountReady
        }
      });
    }

    return NextResponse.json({
      success: true,
      eligible,
      contract_amount,
      currency,
      current_verification: {
        level: currentLevel,
        status: currentKycStatus,
        stripe_account_id: profile?.stripe_connect_account_id || null,
        stripe_ready: stripeAccountReady
      },
      required_verification: {
        level: requiredLevel,
        details: verificationLevels[requiredLevel as keyof typeof verificationLevels]
      },
      verification_levels: verificationLevels,
      checks: {
        verification_sufficient: verificationSufficient,
        stripe_account_required: needsStripeAccount,
        stripe_account_ready: stripeAccountReady
      },
      action_plan: actionPlan,
      estimated_completion_time: actionPlan ? getEstimatedCompletionTime(actionPlan) : null
    });

  } catch (error) {
    console.error("KYC requirements check error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper functions
function getRequiredVerificationLevel(amount: number, currency: string): string {
  // Convert to USD for standardized comparison
  const usdAmount = currency === "USD" ? amount : amount; // In real implementation, would convert currencies
  
  if (usdAmount <= 500) return "basic";
  if (usdAmount <= 5000) return "enhanced";
  return "business";
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
  kycVerification: any
): any[] {
  const actions = [];

  // If no KYC or KYC is rejected/requires action
  if (!kycVerification || ["not_started", "rejected", "requires_action"].includes(currentKycStatus)) {
    actions.push({
      step: 1,
      action: "initiate_kyc",
      title: "Start KYC Verification",
      description: `Begin ${requiredLevel} level verification process`,
      endpoint: "/api/kyc",
      method: "POST",
      estimated_time: "5 minutes",
      required: true
    });
  }

  // If KYC is in progress but documents not submitted
  if (kycVerification && kycVerification.status === "in_progress" && !kycVerification.submitted_at) {
    actions.push({
      step: 1,
      action: "submit_documents",
      title: "Submit Required Documents",
      description: "Upload all required verification documents",
      endpoint: "/api/kyc/documents",
      method: "POST",
      estimated_time: "10-15 minutes",
      required: true,
      required_documents: kycVerification.required_documents
    });
  }

  // If KYC is pending review
  if (kycVerification && kycVerification.status === "pending_review") {
    actions.push({
      step: 1,
      action: "wait_for_approval",
      title: "Wait for KYC Approval",
      description: "Your documents are under review",
      estimated_time: requiredLevel === "basic" ? "Up to 24 hours" : 
                     requiredLevel === "enhanced" ? "1-2 business days" : "3-5 business days",
      required: true
    });
  }

  // If Stripe account is needed but not created
  if (requiredLevel !== "basic" && !hasStripeAccount) {
    actions.push({
      step: 2,
      action: "create_stripe_account",
      title: "Set Up Payment Account",
      description: "Create Stripe Connect account for payment processing",
      endpoint: "/api/kyc/stripe-onboarding",
      method: "POST",
      estimated_time: "10-20 minutes",
      required: true,
      depends_on: "kyc_approval"
    });
  }

  return actions;
}

function getEstimatedCompletionTime(actionPlan: any[]): string {
  const timeEstimates = actionPlan.map(action => {
    const time = action.estimated_time;
    if (time.includes("minutes")) {
      return { unit: "minutes", value: parseInt(time) || 15 };
    } else if (time.includes("hours")) {
      return { unit: "hours", value: parseInt(time) || 24 };
    } else if (time.includes("business days")) {
      return { unit: "days", value: parseInt(time) || 3 };
    }
    return { unit: "days", value: 1 };
  });

  const maxDays = Math.max(...timeEstimates.filter(t => t.unit === "days").map(t => t.value), 0);
  const maxHours = Math.max(...timeEstimates.filter(t => t.unit === "hours").map(t => t.value), 0);
  
  if (maxDays > 0) {
    return `${maxDays} business day${maxDays > 1 ? 's' : ''}`;
  } else if (maxHours > 0) {
    return `Up to ${maxHours} hour${maxHours > 1 ? 's' : ''}`;
  } else {
    return "Less than 1 hour";
  }
}