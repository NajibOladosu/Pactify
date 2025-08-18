import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from "next/server";
import { auditLogger } from "@/utils/security/audit-logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params;
    const { id: contractId } = resolvedParams;

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

    // Verify user has access to this contract and is the client
    const { data: contract } = await serviceSupabase
      .from("contracts")
      .select("client_id, freelancer_id, status")
      .eq("id", contractId)
      .single();

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    if (contract.client_id !== user.id) {
      return NextResponse.json({ error: "Only the client can approve deliverables" }, { status: 403 });
    }

    console.log(`Contract ${contractId} status: ${contract.status}`);

    // Allow approval from both in_review and pending_delivery status
    if (!['in_review', 'pending_delivery'].includes(contract.status)) {
      return NextResponse.json({ 
        error: `Contract is not ready for deliverable approval. Current status: ${contract.status}` 
      }, { status: 400 });
    }

    // Move contract to pending_completion status
    const { error: statusUpdateError } = await serviceSupabase
      .from("contracts")
      .update({ status: 'pending_completion' })
      .eq("id", contractId);

    if (statusUpdateError) {
      console.error("Error updating contract status to pending_completion:", statusUpdateError);
      return NextResponse.json({ 
        error: "Failed to approve deliverables",
        details: statusUpdateError.message 
      }, { status: 500 });
    }

    // Log the activity
    await auditLogger.logContractEvent(
      'deliverables_approved',
      contractId,
      user.id,
      {
        message: 'Client approved deliverables - contract ready for payment release'
      }
    );

    return NextResponse.json({ 
      success: true,
      message: "Deliverables approved successfully. Contract is ready for payment release." 
    });
  } catch (error) {
    console.error("Approve deliverables error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}