import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLogger } from "@/utils/security/audit-logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string; action: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params;
    const { id: contractId, versionId, action } = resolvedParams;
    const body = await request.json();

    if (!['accept', 'reject'].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this contract
    const { data: contract } = await supabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (!contract || (contract.client_id !== user.id && contract.freelancer_id !== user.id)) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Get the version to be acted upon
    const { data: version } = await supabase
      .from("contract_versions")
      .select("*")
      .eq("id", versionId)
      .eq("contract_id", contractId)
      .single();

    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    // Check if user can act on this version (can't act on own proposals)
    if (version.proposed_by === user.id) {
      return NextResponse.json({ error: "Cannot act on your own proposal" }, { status: 403 });
    }

    // Check if version is still pending
    if (version.status !== 'pending') {
      return NextResponse.json({ error: "Version is no longer pending" }, { status: 400 });
    }

    if (action === 'accept') {
      // Mark all other pending versions as superseded
      await supabase
        .from("contract_versions")
        .update({ status: 'superseded' })
        .eq("contract_id", contractId)
        .eq("status", 'pending')
        .neq("id", versionId);

      // Mark this version as accepted
      await supabase
        .from("contract_versions")
        .update({ status: 'accepted' })
        .eq("id", versionId);

      // Update the main contract with the accepted version details
      await supabase
        .from("contracts")
        .update({
          title: version.title,
          description: version.description,
          terms: version.terms,
          total_amount: version.total_amount,
          currency: version.currency,
          updated_at: new Date().toISOString()
        })
        .eq("id", contractId);

      // Log the activity
      await auditLogger.log({
        user_id: user.id,
        action: 'contract_version_accepted',
        resource_id: contractId,
        resource_type: 'contract',
        metadata: {
          version_id: versionId,
          version_number: version.version_number
        }
      });

    } else if (action === 'reject') {
      // Mark this version as rejected
      await supabase
        .from("contract_versions")
        .update({ 
          status: 'rejected',
          rejection_reason: body.reason 
        })
        .eq("id", versionId);

      // Log the activity
      await auditLogger.log({
        user_id: user.id,
        action: 'contract_version_rejected',
        resource_id: contractId,
        resource_type: 'contract',
        metadata: {
          version_id: versionId,
          version_number: version.version_number,
          rejection_reason: body.reason
        }
      });
    }

    // TODO: Send notification to proposer
    
    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      message: `Contract version ${action}ed successfully` 
    });
  } catch (error) {
    console.error('Contract version action error:', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}