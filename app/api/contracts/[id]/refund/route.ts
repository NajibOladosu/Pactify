import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLogger } from "@/utils/security/audit-logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params; const contractId = resolvedParams.id;
    const body = await request.json();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this contract and is the client
    const { data: contract } = await supabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (!contract || contract.client_id !== user.id) {
      return NextResponse.json({ error: "Contract not found or unauthorized" }, { status: 404 });
    }

    // Check if contract is in a refundable state
    const refundableStatuses = ['pending_funding', 'active', 'pending_delivery', 'in_review'];
    if (!refundableStatuses.includes(contract.status)) {
      return NextResponse.json({ 
        error: "Contract is not in a refundable state" 
      }, { status: 400 });
    }

    // Check if there's an active escrow payment
    const { data: escrowPayments } = await supabase
      .from("escrow_payments")
      .select("*")
      .eq("contract_id", contractId)
      .eq("status", "held");

    if (!escrowPayments || escrowPayments.length === 0) {
      return NextResponse.json({ 
        error: "No escrow funds available for refund" 
      }, { status: 400 });
    }

    // Validate refund request
    if (!body.reason || typeof body.reason !== 'string' || body.reason.trim().length === 0) {
      return NextResponse.json({ error: "Refund reason is required" }, { status: 400 });
    }

    if (!body.requested_amount || typeof body.requested_amount !== 'number' || body.requested_amount <= 0) {
      return NextResponse.json({ error: "Valid refund amount is required" }, { status: 400 });
    }

    // Calculate eligible refund amount based on contract status
    const totalEscrowAmount = escrowPayments.reduce((sum, payment) => sum + payment.amount, 0);
    let maxRefundAmount = 0;

    switch (contract.status) {
      case 'pending_funding':
        maxRefundAmount = totalEscrowAmount; // Full refund
        break;
      case 'active':
        maxRefundAmount = totalEscrowAmount * 0.8; // 80% refund
        break;
      case 'pending_delivery':
      case 'in_review':
        maxRefundAmount = totalEscrowAmount * 0.3; // 30% refund
        break;
    }

    if (body.requested_amount > maxRefundAmount) {
      return NextResponse.json({ 
        error: `Requested amount exceeds maximum refundable amount of ${maxRefundAmount}` 
      }, { status: 400 });
    }

    // Check for existing pending refund requests
    const { data: existingRefund } = await supabase
      .from("contract_refunds")
      .select("id")
      .eq("contract_id", contractId)
      .eq("status", "pending")
      .limit(1)
      .single();

    if (existingRefund) {
      return NextResponse.json({ 
        error: "A refund request is already pending for this contract" 
      }, { status: 400 });
    }

    // Create refund request
    const { data: refundRequest, error } = await supabase
      .from("contract_refunds")
      .insert({
        contract_id: contractId,
        requested_by: user.id,
        amount: body.requested_amount,
        reason: body.reason.trim(),
        status: 'pending',
        escrow_payment_ids: escrowPayments.map(p => p.id)
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating refund request:", error);
      return NextResponse.json({ error: "Failed to create refund request" }, { status: 500 });
    }

    // Update contract status to indicate refund is pending
    await supabase
      .from("contracts")
      .update({ 
        status: 'cancellation_pending',
        updated_at: new Date().toISOString()
      })
      .eq("id", contractId);

    // Log the activity
    await auditLogger.log({
      user_id: user.id,
      action: 'refund_requested',
      resource_id: contractId,
      resource_type: 'contract',
      metadata: {
        refund_id: refundRequest.id,
        amount: body.requested_amount,
        reason: body.reason,
        escrow_amount: totalEscrowAmount
      }
    });

    // TODO: Send notifications to freelancer and admin
    // TODO: Trigger Stripe refund process for approved refunds
    
    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      refund_request: refundRequest,
      message: "Refund request submitted successfully" 
    });
  } catch (error) {
    console.error("Refund request error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}