import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLogger } from "@/utils/security/audit-logger";

export async function POST(
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

    // Get contract details and verify access
    const { data: contract, error: contractError } = await serviceSupabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Verify user has permission to accept this contract
    if (contract.client_id !== user.id && contract.freelancer_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized to accept this contract" }, { status: 403 });
    }

    // Check current contract status
    if (contract.status !== 'pending') {
      return NextResponse.json({ 
        error: `Contract cannot be accepted. Current status: ${contract.status}` 
      }, { status: 400 });
    }

    // Determine who is accepting (client or freelancer)
    const acceptorRole = contract.client_id === user.id ? 'client' : 'freelancer';
    const otherPartyId = contract.client_id === user.id ? contract.freelancer_id : contract.client_id;

    // Check if both parties have already signed
    const { data: existingSignatures } = await serviceSupabase
      .from("contract_signatures")
      .select("user_id")
      .eq("contract_id", contractId);

    const clientSigned = existingSignatures?.some(sig => sig.user_id === contract.client_id);
    const freelancerSigned = existingSignatures?.some(sig => sig.user_id === contract.freelancer_id);
    const currentUserSigned = existingSignatures?.some(sig => sig.user_id === user.id);

    if (currentUserSigned) {
      return NextResponse.json({ 
        error: "You have already accepted this contract" 
      }, { status: 400 });
    }

    // Create signature record for acceptance
    const { error: signatureError } = await serviceSupabase
      .from("contract_signatures")
      .insert({
        contract_id: contractId,
        user_id: user.id,
        signature_data: "electronic_acceptance", // Placeholder for electronic acceptance
        signature_type: "electronic",
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent')
      });

    if (signatureError) {
      console.error("Error creating signature:", signatureError);
      return NextResponse.json({ 
        error: "Failed to record acceptance signature" 
      }, { status: 500 });
    }

    // Determine new contract status
    let newStatus = 'pending';
    const bothPartiesSigned = (clientSigned || contract.client_id === user.id) && 
                             (freelancerSigned || contract.freelancer_id === user.id);

    if (bothPartiesSigned) {
      newStatus = 'signed'; // Both parties have now accepted
    }

    // Update contract status
    const { error: updateError } = await serviceSupabase
      .from("contracts")
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq("id", contractId);

    if (updateError) {
      console.error("Error updating contract status:", updateError);
      return NextResponse.json({ 
        error: "Failed to update contract status" 
      }, { status: 500 });
    }

    // Log the acceptance activity
    await serviceSupabase
      .from("contract_activities")
      .insert({
        contract_id: contractId,
        user_id: user.id,
        activity_type: "contract_accepted",
        description: `Contract accepted by ${acceptorRole}`,
        metadata: { acceptor_role: acceptorRole, new_status: newStatus }
      });

    // Log audit event
    await auditLogger.logContractEvent(
      'contract_accepted',
      contractId,
      user.id,
      {
        acceptor_role: acceptorRole,
        new_status: newStatus,
        both_parties_signed: bothPartiesSigned
      }
    );

    // Create notification for the other party
    const { data: otherPartyProfile } = await serviceSupabase
      .from("profiles")
      .select("display_name")
      .eq("id", otherPartyId)
      .single();

    await serviceSupabase
      .from("notifications")
      .insert({
        user_id: otherPartyId,
        type: "in_app",
        title: "Contract Accepted",
        message: `${otherPartyProfile?.display_name || 'The other party'} has accepted the contract "${contract.title}"`,
        related_entity_type: "contract",
        related_entity_id: contractId
      });

    // If both parties have signed, create milestone/escrow setup notification
    if (newStatus === 'signed') {
      // Notify both parties that contract is fully executed
      await serviceSupabase
        .from("notifications")
        .insert([
          {
            user_id: contract.client_id,
            type: "in_app",
            title: "Contract Fully Executed",
            message: `Contract "${contract.title}" is now active. ${contract.payment_type === 'escrow' ? 'Please fund the escrow to begin work.' : 'Work can now begin.'}`,
            related_entity_type: "contract",
            related_entity_id: contractId
          },
          {
            user_id: contract.freelancer_id,
            type: "in_app",
            title: "Contract Fully Executed",
            message: `Contract "${contract.title}" is now active. ${contract.payment_type === 'escrow' ? 'Work can begin once escrow is funded.' : 'You can now begin work.'}`,
            related_entity_type: "contract",
            related_entity_id: contractId
          }
        ]);

      // If it's an escrow contract, create escrow record
      if (contract.payment_type === 'escrow') {
        await serviceSupabase
          .from("contract_escrows")
          .insert({
            contract_id: contractId,
            total_amount: contract.total_amount,
            currency: contract.currency || 'USD',
            status: 'pending_funding',
            created_by: contract.client_id
          });
      }
    }

    // Send email notification (TODO: Implement email service)
    // await emailService.sendContractAcceptanceNotification(otherPartyId, contract, acceptorRole);

    revalidatePath(`/dashboard/contracts/${contractId}`);
    revalidatePath(`/dashboard/contracts`);
    
    return NextResponse.json({ 
      success: true,
      message: `Contract accepted successfully${newStatus === 'signed' ? '. Contract is now fully executed.' : '. Waiting for other party to accept.'}`,
      contract_status: newStatus,
      both_parties_signed: bothPartiesSigned
    });

  } catch (error) {
    console.error("Contract acceptance error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}