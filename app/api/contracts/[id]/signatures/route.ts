import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLogger } from "@/utils/security/audit-logger";

// GET - Retrieve signatures for a contract
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params;
    const contractId = resolvedParams.id;

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create service client for database operations
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );

    // Verify user has access to this contract
    const { data: contract } = await serviceSupabase
      .from("contracts")
      .select("client_id, freelancer_id, title")
      .eq("id", contractId)
      .single();

    if (!contract || (contract.client_id !== user.id && contract.freelancer_id !== user.id)) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Get signatures for this contract
    const { data: signatures, error } = await serviceSupabase
      .from("contract_signatures")
      .select(`
        *,
        profiles!user_id(display_name, avatar_url)
      `)
      .eq("contract_id", contractId)
      .order("signed_at", { ascending: true });

    if (error) {
      console.error("Error fetching signatures:", error);
      return NextResponse.json({ 
        error: "Failed to fetch signatures" 
      }, { status: 500 });
    }

    // Format signatures and determine signing status
    const formattedSignatures = signatures?.map(sig => ({
      id: sig.id,
      user_id: sig.user_id,
      signer_name: sig.profiles?.display_name || 'Unknown',
      signer_avatar: sig.profiles?.avatar_url,
      signature_type: sig.signature_type,
      signed_at: sig.signed_at,
      ip_address: sig.ip_address,
      // Don't return actual signature data for security
      has_signature: Boolean(sig.signature_data)
    })) || [];

    const clientSigned = signatures?.some(sig => sig.user_id === contract.client_id);
    const freelancerSigned = signatures?.some(sig => sig.user_id === contract.freelancer_id);
    const currentUserSigned = signatures?.some(sig => sig.user_id === user.id);

    return NextResponse.json({
      signatures: formattedSignatures,
      signing_status: {
        client_signed: clientSigned,
        freelancer_signed: freelancerSigned,
        current_user_signed: currentUserSigned,
        all_parties_signed: clientSigned && freelancerSigned,
        current_user_role: contract.client_id === user.id ? 'client' : 'freelancer'
      }
    });

  } catch (error) {
    console.error("Get signatures error:", error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}

// POST - Create a signature for the contract
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params;
    const contractId = resolvedParams.id;
    const body = await request.json();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate request body
    const { signature_data, signature_type = 'electronic' } = body;

    if (!signature_data) {
      return NextResponse.json({ 
        error: "Signature data is required" 
      }, { status: 400 });
    }

    if (!['electronic', 'digital'].includes(signature_type)) {
      return NextResponse.json({ 
        error: "Invalid signature type" 
      }, { status: 400 });
    }

    // Validate signature data format (should be base64 for electronic signatures)
    if (signature_type === 'electronic') {
      try {
        // Check if it's valid base64
        if (!signature_data.startsWith('data:image/')) {
          throw new Error('Invalid signature format');
        }
      } catch (error) {
        return NextResponse.json({ 
          error: "Invalid signature data format. Expected base64 image data." 
        }, { status: 400 });
      }
    }

    // Create service client for database operations
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );

    // Get contract details and verify access
    const { data: contract, error: contractError } = await serviceSupabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Verify user has permission to sign this contract
    if (contract.client_id !== user.id && contract.freelancer_id !== user.id) {
      return NextResponse.json({ 
        error: "Unauthorized to sign this contract" 
      }, { status: 403 });
    }

    // Check if contract is in a signable state
    if (!['draft', 'pending'].includes(contract.status)) {
      return NextResponse.json({ 
        error: `Contract cannot be signed. Current status: ${contract.status}` 
      }, { status: 400 });
    }

    // Check if user has already signed
    const { data: existingSignature } = await serviceSupabase
      .from("contract_signatures")
      .select("id")
      .eq("contract_id", contractId)
      .eq("user_id", user.id)
      .single();

    if (existingSignature) {
      return NextResponse.json({ 
        error: "You have already signed this contract" 
      }, { status: 400 });
    }

    // Create the signature
    const { data: signature, error: signatureError } = await serviceSupabase
      .from("contract_signatures")
      .insert({
        contract_id: contractId,
        user_id: user.id,
        signature_data: signature_data,
        signature_type: signature_type,
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent'),
        signed_at: new Date().toISOString()
      })
      .select()
      .single();

    if (signatureError) {
      console.error("Error creating signature:", signatureError);
      return NextResponse.json({ 
        error: "Failed to create signature",
        details: signatureError.message 
      }, { status: 500 });
    }

    // Check if both parties have now signed
    const { data: allSignatures } = await serviceSupabase
      .from("contract_signatures")
      .select("user_id")
      .eq("contract_id", contractId);

    const clientSigned = allSignatures?.some(sig => sig.user_id === contract.client_id);
    const freelancerSigned = allSignatures?.some(sig => sig.user_id === contract.freelancer_id);
    const bothPartiesSigned = clientSigned && freelancerSigned;

    // Update contract status if both parties have signed
    let newStatus = contract.status;
    if (bothPartiesSigned && contract.status === 'pending') {
      newStatus = 'signed';
      
      await serviceSupabase
        .from("contracts")
        .update({ 
          status: 'signed',
          updated_at: new Date().toISOString()
        })
        .eq("id", contractId);
    }

    // Log the signing activity
    const userRole = contract.client_id === user.id ? 'client' : 'freelancer';
    await serviceSupabase
      .from("contract_activities")
      .insert({
        contract_id: contractId,
        user_id: user.id,
        activity_type: "contract_signed",
        description: `Contract signed by ${userRole}`,
        metadata: { 
          signature_id: signature.id,
          signature_type: signature_type,
          both_parties_signed: bothPartiesSigned
        }
      });

    // Log audit event
    await auditLogger.logContractEvent(
      'contract_signed',
      contractId,
      user.id,
      {
        signature_id: signature.id,
        signature_type: signature_type,
        user_role: userRole,
        both_parties_signed: bothPartiesSigned
      }
    );

    // Create notifications
    const otherPartyId = contract.client_id === user.id ? contract.freelancer_id : contract.client_id;
    const { data: currentUserProfile } = await serviceSupabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    // Notify other party about the signature
    await serviceSupabase
      .from("notifications")
      .insert({
        user_id: otherPartyId,
        type: "in_app",
        title: "Contract Signed",
        message: `${currentUserProfile?.display_name || 'The other party'} has signed the contract "${contract.title}"${bothPartiesSigned ? '. The contract is now fully executed.' : ''}`,
        related_entity_type: "contract",
        related_entity_id: contractId
      });

    // If both parties signed, notify both about full execution
    if (bothPartiesSigned) {
      await serviceSupabase
        .from("notifications")
        .insert([
          {
            user_id: contract.client_id,
            type: "in_app",
            title: "Contract Fully Executed",
            message: `Contract "${contract.title}" has been signed by both parties and is now active.`,
            related_entity_type: "contract",
            related_entity_id: contractId
          },
          {
            user_id: contract.freelancer_id,
            type: "in_app",
            title: "Contract Fully Executed",
            message: `Contract "${contract.title}" has been signed by both parties and is now active.`,
            related_entity_type: "contract",
            related_entity_id: contractId
          }
        ]);

      // If it's an escrow contract, create escrow record
      if (contract.payment_type === 'escrow') {
        const { error: escrowError } = await serviceSupabase
          .from("contract_escrows")
          .insert({
            contract_id: contractId,
            total_amount: contract.total_amount,
            currency: contract.currency || 'USD',
            status: 'pending_funding',
            created_by: contract.client_id
          });

        if (escrowError) {
          console.warn("Error creating escrow record:", escrowError);
        }
      }
    }

    // Send email notifications using notification service
    const { notificationService } = await import('@/lib/services/notification-service');
    
    try {
      await notificationService.sendNotification(
        'contract_accepted',
        otherPartyId,
        {
          contract_title: contract.title,
          acceptor_name: currentUserProfile?.display_name || 'The other party',
          contract_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/contracts/${contractId}`
        },
        {
          types: ['email', 'in_app'],
          related_resource_type: 'contract',
          related_resource_id: contractId
        }
      );
    } catch (emailError) {
      console.warn('Failed to send email notification:', emailError);
    }

    revalidatePath(`/dashboard/contracts/${contractId}`);
    revalidatePath(`/dashboard/contracts`);
    
    return NextResponse.json({ 
      success: true,
      signature: {
        id: signature.id,
        signed_at: signature.signed_at,
        signature_type: signature.signature_type
      },
      contract_status: newStatus,
      both_parties_signed: bothPartiesSigned,
      message: bothPartiesSigned 
        ? "Contract signed successfully. The contract is now fully executed and active."
        : "Contract signed successfully. Waiting for the other party to sign."
    });

  } catch (error) {
    console.error("Contract signing error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// DELETE - Remove a signature (only if contract hasn't been fully executed)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params;
    const contractId = resolvedParams.id;

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create service client for database operations
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );

    // Get contract details
    const { data: contract } = await serviceSupabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (!contract || (contract.client_id !== user.id && contract.freelancer_id !== user.id)) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Check if contract allows signature removal
    if (contract.status === 'signed') {
      return NextResponse.json({ 
        error: "Cannot remove signature from fully executed contract" 
      }, { status: 400 });
    }

    // Remove user's signature
    const { error: deleteError } = await serviceSupabase
      .from("contract_signatures")
      .delete()
      .eq("contract_id", contractId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error removing signature:", deleteError);
      return NextResponse.json({ 
        error: "Failed to remove signature" 
      }, { status: 500 });
    }

    // Log the activity
    await serviceSupabase
      .from("contract_activities")
      .insert({
        contract_id: contractId,
        user_id: user.id,
        activity_type: "signature_removed",
        description: "Signature removed from contract",
        metadata: { reason: "user_requested" }
      });

    // Log audit event
    await auditLogger.logContractEvent(
      'signature_removed',
      contractId,
      user.id,
      { reason: 'user_requested' }
    );

    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      success: true,
      message: "Signature removed successfully"
    });

  } catch (error) {
    console.error("Remove signature error:", error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}