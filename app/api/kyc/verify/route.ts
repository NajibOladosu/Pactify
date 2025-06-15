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
    const { action, contract_amount } = body;

    // Get user's current KYC status
    const { data: profile } = await supabase
      .from("profiles")
      .select("kyc_status, verification_level")
      .eq("id", user.id)
      .single();

    const { data: kycVerification } = await supabase
      .from("kyc_verifications")
      .select("*")
      .eq("profile_id", user.id)
      .single();

    // Determine required verification level based on contract amount
    const requiredLevel = getRequiredVerificationLevel(contract_amount);
    const currentLevel = profile?.verification_level || "none";

    // Check if current verification is sufficient
    const verificationSufficient = isVerificationSufficient(currentLevel, requiredLevel, profile?.kyc_status);

    if (action === "check_eligibility") {
      return NextResponse.json({
        success: true,
        eligible: verificationSufficient,
        current_level: currentLevel,
        required_level: requiredLevel,
        kyc_status: profile?.kyc_status || "not_started",
        contract_amount,
        verification_details: {
          basic: { max_amount: 500, description: "Email and phone verification" },
          enhanced: { max_amount: 5000, description: "Government ID and address verification" },
          business: { max_amount: null, description: "Business registration and enhanced due diligence" }
        },
        next_steps: verificationSufficient ? null : getUpgradeSteps(currentLevel, requiredLevel)
      });
    }

    if (action === "create_stripe_account") {
      if (!kycVerification || kycVerification.verification_level === "basic") {
        return NextResponse.json(
          { error: "INSUFFICIENT_KYC", message: "Enhanced or Business verification required for Stripe Connect" },
          { status: 400 }
        );
      }

      // Check if Stripe account already exists
      if (kycVerification.stripe_account_id) {
        return NextResponse.json({
          success: true,
          stripe_account_id: kycVerification.stripe_account_id,
          message: "Stripe Connect account already exists"
        });
      }

      try {
        // In a real implementation, this would create a Stripe Express account
        const stripeAccountId = `acct_${Date.now()}_${user.id.slice(0, 8)}`;
        
        // Update KYC with Stripe account ID
        await supabase
          .from("kyc_verifications")
          .update({ 
            stripe_account_id: stripeAccountId,
            updated_at: new Date().toISOString()
          })
          .eq("profile_id", user.id);

        // Update profile
        await supabase
          .from("profiles")
          .update({ stripe_connect_account_id: stripeAccountId })
          .eq("id", user.id);

        // Log activity
        await supabase.from("contract_activities").insert({
          contract_id: "00000000-0000-0000-0000-000000000000",
          user_id: user.id,
          activity_type: "stripe_account_created",
          description: "Stripe Connect account created for payment processing",
          metadata: {
            stripe_account_id: stripeAccountId,
            verification_level: kycVerification.verification_level
          }
        });

        return NextResponse.json({
          success: true,
          stripe_account_id: stripeAccountId,
          onboarding_url: `/dashboard/kyc/stripe-onboarding?account=${stripeAccountId}`,
          message: "Stripe Connect account created successfully"
        });

      } catch (stripeError) {
        console.error("Stripe account creation error:", stripeError);
        return NextResponse.json(
          { error: "STRIPE_ERROR", message: "Failed to create Stripe Connect account" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: "INVALID_ACTION", message: "Invalid action specified" },
      { status: 400 }
    );

  } catch (error) {
    console.error("KYC verification error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
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
    const { status, rejection_reason } = body;

    // This endpoint would typically be used by administrators to approve/reject KYC
    // For now, we'll implement a simple auto-approval for basic level
    
    const { data: kycVerification, error: kycError } = await supabase
      .from("kyc_verifications")
      .select("*")
      .eq("profile_id", user.id)
      .single();

    if (kycError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "KYC verification not found" },
        { status: 404 }
      );
    }

    if (kycVerification.status === "approved") {
      return NextResponse.json(
        { error: "ALREADY_APPROVED", message: "KYC already approved" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const updateData: any = {
      status,
      updated_at: now
    };

    if (status === "approved") {
      updateData.approved_at = now;
      // Update profile KYC status and verification level
      await supabase
        .from("profiles")
        .update({
          kyc_status: "approved",
          verification_level: kycVerification.verification_level
        })
        .eq("id", user.id);
    } else if (status === "rejected") {
      updateData.rejected_at = now;
      updateData.rejection_reason = rejection_reason;
    }

    const { data: updatedKyc, error: updateError } = await supabase
      .from("kyc_verifications")
      .update(updateData)
      .eq("profile_id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error("KYC status update error:", updateError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to update KYC status" },
        { status: 500 }
      );
    }

    // Log activity
    await supabase.from("contract_activities").insert({
      contract_id: "00000000-0000-0000-0000-000000000000",
      user_id: user.id,
      activity_type: `kyc_${status}`,
      description: `KYC verification ${status}${status === "rejected" ? `: ${rejection_reason}` : ""}`,
      metadata: {
        verification_level: kycVerification.verification_level,
        previous_status: kycVerification.status,
        new_status: status,
        rejection_reason
      }
    });

    return NextResponse.json({
      success: true,
      kyc_verification: updatedKyc,
      message: `KYC verification ${status} successfully`
    });

  } catch (error) {
    console.error("KYC status update error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper functions
function getRequiredVerificationLevel(amount: number): string {
  if (amount <= 500) return "basic";
  if (amount <= 5000) return "enhanced";
  return "business";
}

function isVerificationSufficient(currentLevel: string, requiredLevel: string, kycStatus: string): boolean {
  if (kycStatus !== "approved") return false;
  
  const levels = { basic: 1, enhanced: 2, business: 3 };
  const currentLevelNum = levels[currentLevel as keyof typeof levels] || 0;
  const requiredLevelNum = levels[requiredLevel as keyof typeof levels] || 0;
  
  return currentLevelNum >= requiredLevelNum;
}

function getUpgradeSteps(currentLevel: string, requiredLevel: string) {
  const steps = [];
  
  if (currentLevel === "none" || currentLevel === "basic") {
    if (requiredLevel === "enhanced" || requiredLevel === "business") {
      steps.push({
        level: "enhanced",
        action: "Complete Enhanced Verification",
        requirements: ["Government ID", "Address Proof", "Selfie Verification"],
        estimated_time: "1-2 business days"
      });
    }
  }
  
  if (requiredLevel === "business") {
    steps.push({
      level: "business",
      action: "Complete Business Verification",
      requirements: ["Business Registration", "Tax ID", "Business Bank Account", "Beneficial Ownership"],
      estimated_time: "3-5 business days"
    });
  }
  
  return steps;
}