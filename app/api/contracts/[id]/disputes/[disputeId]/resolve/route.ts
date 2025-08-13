import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLogger } from "@/utils/security/audit-logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; disputeId: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params;
    const { id: contractId, disputeId } = resolvedParams;
    const body = await request.json();

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
      .select("*")
      .eq("id", contractId)
      .single();

    if (!contract || (contract.client_id !== user.id && contract.freelancer_id !== user.id)) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Verify dispute belongs to this contract
    const { data: dispute } = await serviceSupabase
      .from("contract_disputes")
      .select("*")
      .eq("id", disputeId)
      .eq("contract_id", contractId)
      .single();

    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    // Check if dispute is still active
    if (dispute.status === 'resolved' || dispute.status === 'closed') {
      return NextResponse.json({ error: "Dispute is already resolved" }, { status: 400 });
    }

    // Validate resolution
    if (!body.resolution || typeof body.resolution !== 'string' || body.resolution.trim().length === 0) {
      return NextResponse.json({ error: "Resolution details are required" }, { status: 400 });
    }

    if (body.resolution.length > 2000) {
      return NextResponse.json({ error: "Resolution is too long" }, { status: 400 });
    }

    // Resolve the dispute
    const { error: disputeError } = await serviceSupabase
      .from("contract_disputes")
      .update({
        status: 'resolved',
        resolution: body.resolution.trim(),
        resolved_by: user.id,
        resolved_at: new Date().toISOString()
      })
      .eq("id", disputeId);

    if (disputeError) {
      console.error("Error resolving dispute:", disputeError);
      return NextResponse.json({ error: "Failed to resolve dispute" }, { status: 500 });
    }

    // Determine the new contract status based on the original status before dispute
    let newContractStatus = contract.status;
    
    // If contract was disputed, try to restore to previous logical status
    if (contract.status === 'disputed') {
      // Check if there are signatures, funding, etc. to determine appropriate status
      const { data: signatures } = await serviceSupabase
        .from("contract_signatures")
        .select("*")
        .eq("contract_id", contractId);

      const { data: escrow } = await serviceSupabase
        .from("contract_payments")
        .select("*")
        .eq("contract_id", contractId)
        .eq("status", "completed");

      if (signatures && signatures.length >= 2 && escrow && escrow.length > 0) {
        newContractStatus = 'active';
      } else if (signatures && signatures.length >= 2) {
        newContractStatus = 'pending_funding';
      } else {
        newContractStatus = 'pending_signatures';
      }
    }

    // Update contract status
    await serviceSupabase
      .from("contracts")
      .update({ status: newContractStatus })
      .eq("id", contractId);

    // Log the activity
    await auditLogger.logContractEvent(
      'dispute_resolved',
      contractId,
      user.id,
      {
        dispute_id: disputeId,
        resolution: body.resolution,
        new_contract_status: newContractStatus
      }
    );

    // TODO: Send notification to other party
    
    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      message: "Dispute resolved successfully",
      new_contract_status: newContractStatus
    });
  } catch (error) {
    console.error("Dispute resolution error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}