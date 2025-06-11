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
    const { documents, document_type } = body;

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Documents are required" },
        { status: 400 }
      );
    }

    // Get existing KYC verification
    const { data: kycVerification, error: kycError } = await supabase
      .from("kyc_verifications")
      .select("*")
      .eq("profile_id", user.id)
      .single();

    if (kycError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "KYC verification not found. Please initiate KYC first." },
        { status: 404 }
      );
    }

    if (kycVerification.status === "approved") {
      return NextResponse.json(
        { error: "ALREADY_APPROVED", message: "KYC already approved" },
        { status: 400 }
      );
    }

    // Validate document types against required documents
    const submittedDocuments = kycVerification.submitted_documents as any[] || [];
    const newDocuments = documents.map((doc: any) => ({
      type: doc.type,
      filename: doc.filename,
      file_url: doc.file_url,
      uploaded_at: new Date().toISOString(),
      verification_status: "pending"
    }));

    // Merge with existing documents
    const allDocuments = [...submittedDocuments, ...newDocuments];
    
    // Check if all required documents are now submitted
    const requiredDocs = kycVerification.required_documents as string[];
    const submittedTypes = allDocuments.map((doc: any) => doc.type);
    const allRequiredSubmitted = requiredDocs.every(required => 
      submittedTypes.includes(required)
    );

    const now = new Date().toISOString();
    const updateData: any = {
      submitted_documents: allDocuments,
      updated_at: now
    };

    // If this is the first submission or all required docs are now submitted
    if (!kycVerification.submitted_at || allRequiredSubmitted) {
      updateData.submitted_at = now;
      if (allRequiredSubmitted) {
        updateData.status = "pending_review";
      }
    }

    // Update KYC verification
    const { data: updatedKyc, error: updateError } = await supabase
      .from("kyc_verifications")
      .update(updateData)
      .eq("profile_id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error("KYC document update error:", updateError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to update KYC documents" },
        { status: 500 }
      );
    }

    // Log activity
    await supabase.from("contract_activities").insert({
      contract_id: "00000000-0000-0000-0000-000000000000", // System activity
      user_id: user.id,
      activity_type: "kyc_documents_submitted",
      description: `KYC documents submitted: ${documents.map((d: any) => d.type).join(', ')}`,
      metadata: {
        document_types: documents.map((d: any) => d.type),
        verification_level: kycVerification.verification_level,
        all_required_submitted: allRequiredSubmitted,
        new_status: updateData.status || kycVerification.status
      }
    });

    // If all documents submitted, trigger review process
    if (allRequiredSubmitted && updateData.status === "pending_review") {
      // In a real implementation, this would trigger an automated review process
      // or notify administrators for manual review
      console.log(`KYC ready for review: ${user.id} - ${kycVerification.verification_level} level`);
    }

    return NextResponse.json({
      success: true,
      kyc_verification: updatedKyc,
      message: allRequiredSubmitted 
        ? "All required documents submitted. Review process initiated."
        : "Documents uploaded successfully.",
      documents_uploaded: newDocuments.length,
      total_documents: allDocuments.length,
      missing_documents: requiredDocs.filter(req => !submittedTypes.includes(req)),
      ready_for_review: allRequiredSubmitted
    });

  } catch (error) {
    console.error("KYC document submission error:", error);
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

    // Get KYC verification with documents
    const { data: kycVerification, error } = await supabase
      .from("kyc_verifications")
      .select("*")
      .eq("profile_id", user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: "NOT_FOUND", message: "KYC verification not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch KYC documents" },
        { status: 500 }
      );
    }

    const submittedDocuments = kycVerification.submitted_documents as any[] || [];
    const requiredDocuments = kycVerification.required_documents as string[] || [];
    
    // Analyze document status
    const documentStatus = requiredDocuments.map(docType => {
      const submitted = submittedDocuments.find((doc: any) => doc.type === docType);
      return {
        type: docType,
        required: true,
        submitted: !!submitted,
        status: submitted?.verification_status || "not_submitted",
        uploaded_at: submitted?.uploaded_at || null,
        filename: submitted?.filename || null
      };
    });

    return NextResponse.json({
      success: true,
      kyc_verification: {
        id: kycVerification.id,
        status: kycVerification.status,
        verification_level: kycVerification.verification_level,
        submitted_at: kycVerification.submitted_at,
        approved_at: kycVerification.approved_at,
        rejected_at: kycVerification.rejected_at,
        rejection_reason: kycVerification.rejection_reason
      },
      document_status: documentStatus,
      progress: {
        submitted: submittedDocuments.length,
        required: requiredDocuments.length,
        percentage: Math.round((submittedDocuments.length / requiredDocuments.length) * 100)
      }
    });

  } catch (error) {
    console.error("KYC documents fetch error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}