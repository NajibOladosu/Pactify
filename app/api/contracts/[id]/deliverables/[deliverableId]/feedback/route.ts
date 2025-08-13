import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLogger } from "@/utils/security/audit-logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deliverableId: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params;
    const { id: contractId, deliverableId } = resolvedParams;
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

    // Verify user has access to this contract and is the client
    const { data: contract } = await serviceSupabase
      .from("contracts")
      .select("client_id, freelancer_id")
      .eq("id", contractId)
      .single();

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    if (contract.client_id !== user.id) {
      return NextResponse.json({ error: "Only the client can provide feedback on deliverables" }, { status: 403 });
    }

    // Verify deliverable belongs to this contract
    const { data: deliverable } = await serviceSupabase
      .from("contract_deliverables")
      .select("*")
      .eq("id", deliverableId)
      .eq("contract_id", contractId)
      .single();

    if (!deliverable) {
      return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
    }

    // Check if deliverable is still pending
    if (deliverable.status !== 'pending') {
      return NextResponse.json({ error: "Feedback can only be provided on pending deliverables" }, { status: 400 });
    }

    // Validate feedback data
    const validActions = ['approve', 'reject', 'revision'];
    
    if (!validActions.includes(body.action)) {
      return NextResponse.json({ error: "Invalid feedback action" }, { status: 400 });
    }

    if (body.action !== 'approve') {
      if (!body.feedback || typeof body.feedback !== 'string' || body.feedback.trim().length === 0) {
        return NextResponse.json({ error: "Feedback is required for rejection or revision requests" }, { status: 400 });
      }
      if (body.feedback.length > 2000) {
        return NextResponse.json({ error: "Feedback is too long" }, { status: 400 });
      }
    }

    // Map action to status
    const statusMap = {
      'approve': 'approved',
      'reject': 'rejected',
      'revision': 'revision_requested'
    };

    const newStatus = statusMap[body.action as keyof typeof statusMap];

    // Update deliverable with feedback
    const { error: updateError } = await serviceSupabase
      .from("contract_deliverables")
      .update({
        status: newStatus,
        client_feedback: body.action === 'approve' ? null : body.feedback?.trim(),
        feedback_at: new Date().toISOString()
      })
      .eq("id", deliverableId);

    if (updateError) {
      console.error("Error updating deliverable feedback:", updateError);
      return NextResponse.json({ error: "Failed to submit feedback" }, { status: 500 });
    }

    // Log the activity
    await auditLogger.logContractEvent(
      'deliverable_feedback',
      contractId,
      user.id,
      {
        deliverable_id: deliverableId,
        action: body.action,
        feedback: body.feedback || null
      }
    );

    // TODO: Send notification to freelancer

    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      message: `Deliverable ${body.action === 'approve' ? 'approved' : body.action === 'reject' ? 'rejected' : 'marked for revision'} successfully` 
    });
  } catch (error) {
    console.error("Deliverable feedback error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}