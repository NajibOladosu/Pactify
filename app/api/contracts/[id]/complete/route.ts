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
      .select("client_id, freelancer_id, status, total_amount")
      .eq("id", contractId)
      .single();

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    if (contract.client_id !== user.id) {
      return NextResponse.json({ error: "Only the client can complete the contract" }, { status: 403 });
    }

    // Check if contract is in a valid state for completion
    const validStatuses = ['active', 'in_review', 'pending_delivery', 'pending_completion'];
    if (!validStatuses.includes(contract.status)) {
      return NextResponse.json({ 
        error: `Contract cannot be completed from status: ${contract.status}` 
      }, { status: 400 });
    }

    // Check if there are approved deliverables
    const { data: deliverables } = await serviceSupabase
      .from("contract_deliverables")
      .select("status, is_latest_version")
      .eq("contract_id", contractId);

    const hasApprovedDeliverables = deliverables?.some(d => d.status === 'approved' && d.is_latest_version);

    if (!hasApprovedDeliverables) {
      return NextResponse.json({ 
        error: "Cannot complete contract without approved deliverables" 
      }, { status: 400 });
    }

    // Update contract status to completed
    const { error: updateError } = await serviceSupabase
      .from("contracts")
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq("id", contractId);

    if (updateError) {
      console.error("Error updating contract status:", updateError);
      return NextResponse.json({ error: "Failed to complete contract" }, { status: 500 });
    }

    // Log the activity
    await auditLogger.logContractEvent(
      'contract_completed',
      contractId,
      user.id,
      {
        status: 'completed',
        completed_by: 'client'
      }
    );

    // Release payment if in escrow
    try {
      const releaseResponse = await fetch(`${request.nextUrl.origin}/api/contracts/${contractId}/release-escrow`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': request.headers.get('Authorization') || ''
        },
        body: JSON.stringify({
          reason: 'contract_completed',
          release_method: 'pending_payout'
        })
      });

      if (!releaseResponse.ok) {
        console.warn("Payment release failed, but contract was marked as completed");
      }
    } catch (releaseError) {
      console.warn("Payment release failed:", releaseError);
      // Don't fail the completion if payment release fails
    }

    // TODO: Send notification to freelancer about contract completion

    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      success: true,
      message: "Contract completed successfully. Payment is being processed." 
    });
  } catch (error) {
    console.error("Contract completion error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}