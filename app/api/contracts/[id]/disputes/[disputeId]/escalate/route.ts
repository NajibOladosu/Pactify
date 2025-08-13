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

    // Check if dispute is already resolved or escalated
    if (dispute.status === 'resolved' || dispute.status === 'closed') {
      return NextResponse.json({ error: "Cannot escalate a resolved dispute" }, { status: 400 });
    }

    if (dispute.status === 'escalated') {
      return NextResponse.json({ error: "Dispute is already escalated" }, { status: 400 });
    }

    // Escalate the dispute
    const { error: disputeError } = await serviceSupabase
      .from("contract_disputes")
      .update({
        status: 'escalated',
        updated_at: new Date().toISOString()
      })
      .eq("id", disputeId);

    if (disputeError) {
      console.error("Error escalating dispute:", disputeError);
      return NextResponse.json({ error: "Failed to escalate dispute" }, { status: 500 });
    }

    // Log the activity
    await auditLogger.logContractEvent(
      'dispute_escalated',
      contractId,
      user.id,
      {
        dispute_id: disputeId,
        escalated_by: user.id
      }
    );

    // TODO: Send notification to Pactify support team
    // TODO: Send notification to other party about escalation
    
    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      message: "Dispute escalated successfully. Our support team will review and respond within 24-48 hours."
    });
  } catch (error) {
    console.error("Dispute escalation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}