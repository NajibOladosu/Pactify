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
      return NextResponse.json({ error: "Only the client can request final deliverables" }, { status: 403 });
    }

    // Check if contract is in a valid state
    if (contract.status !== 'active') {
      return NextResponse.json({ 
        error: `Cannot request final deliverables from status: ${contract.status}` 
      }, { status: 400 });
    }

    // Check if there are any deliverables
    const { data: deliverables } = await serviceSupabase
      .from("contract_deliverables")
      .select("id")
      .eq("contract_id", contractId)
      .limit(1);

    if (!deliverables || deliverables.length === 0) {
      return NextResponse.json({ 
        error: "Cannot request final deliverables without any existing deliverables" 
      }, { status: 400 });
    }

    // Update contract status to pending_completion to signal final deliverables needed
    const { error: updateError } = await serviceSupabase
      .from("contracts")
      .update({ 
        status: 'pending_completion'
      })
      .eq("id", contractId);

    if (updateError) {
      console.error("Error updating contract status:", updateError);
      return NextResponse.json({ error: "Failed to request final deliverables" }, { status: 500 });
    }

    // Log the activity
    await auditLogger.logContractEvent(
      'final_deliverables_requested',
      contractId,
      user.id,
      {
        requested_by: 'client'
      }
    );

    // TODO: Send notification to freelancer about final deliverables request

    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      success: true,
      message: "Final deliverables requested. The freelancer has been notified." 
    });
  } catch (error) {
    console.error("Request final deliverables error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}