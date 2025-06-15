import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { Database } from "@/types/supabase-enhanced";
import { 
  KycVerificationSchema, 
  validateSchema 
} from "@/utils/security/enhanced-validation-schemas";
import { auditLog } from "@/utils/security/audit-logger";

type KycInsert = Database["public"]["Tables"]["kyc_verifications"]["Insert"];
type KycUpdate = Database["public"]["Tables"]["kyc_verifications"]["Update"];

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
    
    // Validate input using enhanced schema
    const validation = validateSchema(KycVerificationSchema, body);
    if (!validation.success) {
      return NextResponse.json({ 
        error: "VALIDATION_ERROR", 
        message: "Invalid input data",
        details: validation.errors 
      }, { status: 400 });
    }

    const { verification_level = "basic", documents = [], personal_info, business_info } = validation.data!

    // Check if KYC verification already exists
    const { data: existingKyc } = await supabase
      .from("kyc_verifications")
      .select("*")
      .eq("profile_id", user.id)
      .single();

    if (existingKyc && existingKyc.status === "approved") {
      return NextResponse.json(
        { error: "ALREADY_VERIFIED", message: "KYC already approved for this user" },
        { status: 400 }
      );
    }

    // Define required documents for each level
    const requiredDocuments: Record<string, string[]> = {
      basic: ["email_verification", "phone_verification"],
      enhanced: ["government_id", "address_proof", "selfie_verification"],
      business: ["business_registration", "tax_id", "business_bank_account", "beneficial_ownership"]
    };

    const kycData: KycInsert = {
      profile_id: user.id,
      verification_level,
      status: "in_progress",
      required_documents: requiredDocuments[verification_level],
      submitted_documents: documents.length > 0 ? documents : null,
      submitted_at: documents.length > 0 ? new Date().toISOString() : null,
      verification_data: {
        personal_info: personal_info || {},
        business_info: business_info || {},
        timestamp: new Date().toISOString()
      }
    };

    let result;
    if (existingKyc) {
      // Update existing KYC
      const { data: updatedKyc, error: updateError } = await supabase
        .from("kyc_verifications")
        .update({
          verification_level,
          status: "in_progress",
          required_documents: requiredDocuments[verification_level],
          submitted_documents: documents.length > 0 ? documents : existingKyc.submitted_documents,
          submitted_at: documents.length > 0 ? new Date().toISOString() : existingKyc.submitted_at,
          updated_at: new Date().toISOString()
        })
        .eq("profile_id", user.id)
        .select()
        .single();

      if (updateError) {
        console.error("KYC update error:", updateError);
        return NextResponse.json(
          { error: "DATABASE_ERROR", message: "Failed to update KYC verification" },
          { status: 500 }
        );
      }
      result = updatedKyc;
    } else {
      // Create new KYC
      const { data: newKyc, error: createError } = await supabase
        .from("kyc_verifications")
        .insert(kycData)
        .select()
        .single();

      if (createError) {
        console.error("KYC creation error:", createError);
        return NextResponse.json(
          { error: "DATABASE_ERROR", message: "Failed to create KYC verification" },
          { status: 500 }
        );
      }
      result = newKyc;
    }

    // For enhanced and business levels, create Stripe Connect account
    if (verification_level !== "basic" && !existingKyc?.stripe_account_id) {
      try {
        // Get user profile for Stripe account creation
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        // This would integrate with Stripe Connect
        // For now, we'll just update the KYC with a placeholder
        const stripeAccountId = `acct_${Date.now()}_${user.id.slice(0, 8)}`;
        
        await supabase
          .from("kyc_verifications")
          .update({ stripe_account_id: stripeAccountId })
          .eq("id", result.id);

        result.stripe_account_id = stripeAccountId;
      } catch (stripeError) {
        console.error("Stripe account creation error:", stripeError);
        // Continue without Stripe account for now
      }
    }

    // Log activity using audit logger
    await auditLog({
      action: existingKyc ? 'kyc_updated' : 'kyc_initiated',
      resource: 'kyc_verification',
      resourceId: result.id,
      userId: user.id,
      metadata: {
        verification_level,
        required_documents: requiredDocuments[verification_level],
        documents_submitted: documents.length,
        has_personal_info: !!personal_info,
        has_business_info: !!business_info
      }
    });

    return NextResponse.json({
      success: true,
      kyc_verification: result,
      message: "KYC verification initiated successfully",
      next_steps: getNextSteps(verification_level, documents.length > 0)
    });

  } catch (error) {
    console.error("KYC initiation error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
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

    // Get user's KYC verification status
    const { data: kycVerification, error } = await supabase
      .from("kyc_verifications")
      .select("*")
      .eq("profile_id", user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error("KYC fetch error:", error);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch KYC verification" },
        { status: 500 }
      );
    }

    // Get profile to check current KYC status
    const { data: profile } = await supabase
      .from("profiles")
      .select("kyc_status, verification_level")
      .eq("id", user.id)
      .single();

    const response = {
      kyc_verification: kycVerification || null,
      profile_kyc_status: profile?.kyc_status || "not_started",
      profile_verification_level: profile?.verification_level || null,
      verification_levels: getVerificationLevels(),
      available_actions: getAvailableActions(kycVerification, profile?.kyc_status)
    };

    return NextResponse.json({
      success: true,
      ...response
    });

  } catch (error) {
    console.error("KYC status fetch error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper functions
function getVerificationLevels() {
  return {
    basic: {
      name: "Basic Verification",
      max_amount: 500,
      required_documents: ["email_verification", "phone_verification"],
      description: "Email and phone verification required"
    },
    enhanced: {
      name: "Enhanced Verification", 
      max_amount: 5000,
      required_documents: ["government_id", "address_proof", "selfie_verification"],
      description: "Government ID and address verification required"
    },
    business: {
      name: "Business Verification",
      max_amount: null, // No limit
      required_documents: ["business_registration", "tax_id", "business_bank_account", "beneficial_ownership"],
      description: "Business registration and enhanced due diligence required"
    }
  };
}

function getNextSteps(verificationLevel: string, documentsSubmitted: boolean) {
  const levels = getVerificationLevels();
  const level = levels[verificationLevel as keyof typeof levels];
  
  if (!documentsSubmitted) {
    return {
      action: "submit_documents",
      message: "Please submit the required documents to proceed",
      required_documents: level.required_documents
    };
  }

  return {
    action: "wait_for_review",
    message: "Documents submitted successfully. Review typically takes 1-2 business days",
    review_time: "1-2 business days"
  };
}

function getAvailableActions(kycVerification: any, profileKycStatus: string) {
  const actions = [];

  if (!kycVerification || kycVerification.status === "not_started") {
    actions.push("initiate_verification");
  }

  if (kycVerification?.status === "in_progress" && !kycVerification.submitted_at) {
    actions.push("submit_documents");
  }

  if (kycVerification?.status === "requires_action") {
    actions.push("resubmit_documents");
  }

  if (kycVerification?.status === "rejected") {
    actions.push("appeal_rejection", "start_new_verification");
  }

  if (profileKycStatus === "approved") {
    actions.push("upgrade_verification_level");
  }

  return actions;
}