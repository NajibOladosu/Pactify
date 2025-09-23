import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from '@supabase/supabase-js';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params;
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
    const { signature_data } = body;

    if (!signature_data) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Signature data is required" },
        { status: 400 }
      );
    }

    // Create service client for database operations
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );

    // Fetch contract details
    const { data: contract, error: contractError } = await serviceSupabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (contractError) {
      if (contractError.code === 'PGRST116') {
        return NextResponse.json(
          { error: "NOT_FOUND", message: "Contract not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch contract" },
        { status: 500 }
      );
    }

    // Check if user is authorized to sign this contract
    const canSign = 
      contract.creator_id === user.id ||
      contract.client_id === user.id ||
      contract.freelancer_id === user.id ||
      contract.client_email === user.email ||
      contract.freelancer_email === user.email;

    if (!canSign) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Not authorized to sign this contract" },
        { status: 403 }
      );
    }

    // Check if contract is in a signable state
    if (!["draft", "pending_signatures"].includes(contract.status)) {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: "Contract is not in a signable state" },
        { status: 400 }
      );
    }

    // Determine which signature field to update
    let signatureField: string;
    let signatureTimestampField: string;
    
    // Check if user has access to both roles (same email/user)
    const canSignAsClient = contract.client_id === user.id || contract.client_email === user.email;
    const canSignAsFreelancer = contract.freelancer_id === user.id || contract.freelancer_email === user.email;
    
    if (canSignAsClient && canSignAsFreelancer) {
      // User can sign as both - sign as whichever role hasn't been signed yet
      if (!contract.client_signed_at) {
        signatureField = "client_signed_at";
        signatureTimestampField = "client_signed_at";
      } else if (!contract.freelancer_signed_at) {
        signatureField = "freelancer_signed_at";
        signatureTimestampField = "freelancer_signed_at";
      } else {
        return NextResponse.json(
          { error: "ALREADY_SIGNED", message: "Both parties have already signed this contract" },
          { status: 400 }
        );
      }
    } else if (canSignAsClient) {
      signatureField = "client_signed_at";
      signatureTimestampField = "client_signed_at";
    } else if (canSignAsFreelancer) {
      signatureField = "freelancer_signed_at";
      signatureTimestampField = "freelancer_signed_at";
    } else {
      // Creator signing - determine role based on context
      if (!contract.client_id && !contract.freelancer_id && !contract.client_email && !contract.freelancer_email) {
        // Need to set role first
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: "Contract parties must be defined before signing" },
          { status: 400 }
        );
      }
      
      if (contract.creator_id === contract.client_id) {
        signatureField = "client_signed_at";
        signatureTimestampField = "client_signed_at";
      } else {
        signatureField = "freelancer_signed_at";
        signatureTimestampField = "freelancer_signed_at";
      }
    }

    // Check if user has already signed
    if (contract[signatureField]) {
      return NextResponse.json(
        { error: "ALREADY_SIGNED", message: "You have already signed this contract" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Store signature in contract_signatures table
    const { error: signatureError } = await serviceSupabase
      .from("contract_signatures")
      .insert({
        contract_id: contractId,
        user_id: user.id,
        signature_data,
        signed_at: now
      });

    if (signatureError) {
      console.error("Signature storage error:", signatureError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to store signature" },
        { status: 500 }
      );
    }

    // Update contract with signature timestamp and assign user if signing by email
    const updateData: any = {
      [signatureField]: now,
      updated_at: now
    };

    // If user is signing via email match, assign them to the contract
    if (contract.client_email === user.email && !contract.client_id) {
      updateData.client_id = user.id;
    }
    if (contract.freelancer_email === user.email && !contract.freelancer_id) {
      updateData.freelancer_id = user.id;
    }

    // Check if both parties have now signed
    const bothSigned = 
      (signatureField === "client_signed_at" && contract.freelancer_signed_at) ||
      (signatureField === "freelancer_signed_at" && contract.client_signed_at) ||
      false; // Remove the impossible condition

    if (bothSigned) {
      updateData.status = "pending_funding";
    } else if (contract.status === "draft") {
      updateData.status = "pending_signatures";
    }

    const { data: updatedContract, error: updateError } = await serviceSupabase
      .from("contracts")
      .update(updateData)
      .eq("id", contractId)
      .select()
      .single();

    if (updateError) {
      console.error("Contract update error:", updateError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to update contract" },
        { status: 500 }
      );
    }

    // Create contract_parties record if user was assigned via email
    if ((contract.client_email === user.email && !contract.client_id) || 
        (contract.freelancer_email === user.email && !contract.freelancer_id)) {
      const role = contract.client_email === user.email ? 'client' : 'freelancer';
      
      // Use upsert to handle potential duplicates
      const { error: partyError } = await serviceSupabase
        .from("contract_parties")
        .upsert({
          contract_id: contractId,
          user_id: user.id,
          role,
          status: 'signed',
          signature_date: now
        }, {
          onConflict: 'contract_id,user_id'
        });

      if (partyError) {
        console.error("Error upserting contract party:", partyError);
      }
    }

    // Log the signing activity
    await serviceSupabase.from("contract_activities").insert({
      contract_id: contractId,
      user_id: user.id,
      activity_type: "contract_signed",
      description: `Contract signed by ${signatureField.includes('client') ? 'client' : 'freelancer'}`,
      metadata: {
        signature_timestamp: now,
        both_parties_signed: bothSigned,
        new_status: updateData.status
      }
    });

    // If both parties have signed, create notification for next steps
    if (bothSigned) {
      // Notify client about funding requirement
      if (contract.client_id) {
        await serviceSupabase.from("notifications").insert({
          user_id: contract.client_id,
          type: "contract_ready_for_funding",
          title: "Contract Ready for Funding",
          message: `Contract "${contract.title}" has been signed by all parties. Please fund the project to activate the contract.`,
          related_entity_type: "contract",
          related_entity_id: contractId
        });
      }
    }

    return NextResponse.json({
      success: true,
      contract: updatedContract,
      message: bothSigned ? 
        "Contract fully signed and ready for funding" : 
        "Contract signed successfully. Waiting for other party to sign.",
      both_parties_signed: bothSigned
    });

  } catch (error) {
    console.error("Contract signing error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params;
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    // Create service client for database operations
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );

    // Get signature status for the contract
    const { data: signatures, error } = await serviceSupabase
      .from("contract_signatures")
      .select(`
        id, user_id, signed_at,
        profiles(display_name, avatar_url)
      `)
      .eq("contract_id", contractId);

    if (error) {
      console.error("Signatures fetch error:", error);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch signatures" },
        { status: 500 }
      );
    }

    // Get contract details for access control
    const { data: contract, error: contractError } = await serviceSupabase
      .from("contracts")
      .select("creator_id, client_id, freelancer_id, client_email, freelancer_email, client_signed_at, freelancer_signed_at, status")
      .eq("id", contractId)
      .single();

    if (contractError) {
      console.error("Contract fetch error:", contractError);
      console.error("Contract ID:", contractId);
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Contract not found" },
        { status: 404 }
      );
    }

    // Check access
    const hasAccess = 
      contract.creator_id === user.id ||
      contract.client_id === user.id ||
      contract.freelancer_id === user.id ||
      contract.client_email === user.email ||
      contract.freelancer_email === user.email;

    console.log("Access check:", {
      userId: user.id,
      userEmail: user.email,
      creatorId: contract.creator_id,
      clientId: contract.client_id,
      freelancerId: contract.freelancer_id,
      clientEmail: contract.client_email,
      freelancerEmail: contract.freelancer_email,
      hasAccess
    });

    if (!hasAccess) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Access denied" },
        { status: 403 }
      );
    }

    const signatureStatus = {
      client_signed: !!contract.client_signed_at,
      freelancer_signed: !!contract.freelancer_signed_at,
      fully_signed: !!(contract.client_signed_at && contract.freelancer_signed_at),
      signatures: signatures || [],
      user_has_signed: signatures?.some(sig => sig.user_id === user.id) || false
    };

    return NextResponse.json({
      success: true,
      signature_status: signatureStatus
    });

  } catch (error) {
    console.error("Signature status fetch error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}