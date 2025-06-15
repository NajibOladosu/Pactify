import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLogger } from "@/utils/security/audit-logger";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const contractId = params.id;
    const body = await request.json();

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
      return NextResponse.json({ error: "Contract not found or unauthorized" }, { status: 404 });
    }

    // Check if contract can be cancelled
    const cancellableStatuses = ['pending_signatures', 'pending_funding', 'active'];
    if (!cancellableStatuses.includes(contract.status)) {
      return NextResponse.json({ 
        error: "Contract cannot be cancelled in its current state" 
      }, { status: 400 });
    }

    // Validate cancellation request
    if (!body.reason || typeof body.reason !== 'string' || body.reason.trim().length === 0) {
      return NextResponse.json({ error: "Cancellation reason is required" }, { status: 400 });
    }

    if (typeof body.cancellation_fee !== 'number' || body.cancellation_fee < 0) {
      return NextResponse.json({ error: "Valid cancellation fee is required" }, { status: 400 });
    }

    if (typeof body.refund_amount !== 'number' || body.refund_amount < 0) {
      return NextResponse.json({ error: "Valid refund amount is required" }, { status: 400 });
    }

    // Check for existing active escrow payments
    const { data: escrowPayments } = await supabase
      .from("escrow_payments")
      .select("*")
      .eq("contract_id", contractId)
      .eq("status", "held");

    const totalEscrowAmount = escrowPayments?.reduce((sum, payment) => sum + payment.amount, 0) || 0;

    // Validate refund amount doesn't exceed available escrow
    if (body.refund_amount > totalEscrowAmount) {
      return NextResponse.json({ 
        error: "Refund amount cannot exceed escrow balance" 
      }, { status: 400 });
    }

    // Calculate fees based on contract status and user role
    let calculatedCancellationFee = 0;
    const platformFeeRate = 0.05; // 5% platform fee

    switch (contract.status) {
      case 'pending_signatures':
        calculatedCancellationFee = 0; // No fee for early cancellation
        break;
      case 'pending_funding':
        calculatedCancellationFee = contract.total_amount * 0.05; // 5%
        break;
      case 'active':
        calculatedCancellationFee = contract.total_amount * 0.15; // 15%
        break;
    }

    // Create cancellation record
    const { data: cancellation, error } = await supabase
      .from("contract_cancellations")
      .insert({
        contract_id: contractId,
        cancelled_by: user.id,
        reason: body.reason.trim(),
        cancellation_fee: body.cancellation_fee,
        refund_amount: body.refund_amount,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating cancellation:", error);
      return NextResponse.json({ error: "Failed to cancel contract" }, { status: 500 });
    }

    // Update contract status
    await supabase
      .from("contracts")
      .update({ 
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", contractId);

    // Handle escrow payments
    if (escrowPayments && escrowPayments.length > 0) {
      // Calculate freelancer payment and client refund
      const freelancerPayment = totalEscrowAmount - body.refund_amount - body.cancellation_fee;
      const platformFee = freelancerPayment * platformFeeRate;
      const netFreelancerPayment = freelancerPayment - platformFee;

      // Update escrow payments status
      for (const payment of escrowPayments) {
        await supabase
          .from("escrow_payments")
          .update({ 
            status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq("id", payment.id);
      }

      // Create refund transaction if applicable
      if (body.refund_amount > 0) {
        await supabase
          .from("contract_transactions")
          .insert({
            contract_id: contractId,
            transaction_type: 'refund',
            amount: body.refund_amount,
            currency: contract.currency,
            from_user_id: null, // Platform refund
            to_user_id: contract.client_id,
            status: 'pending',
            metadata: {
              cancellation_id: cancellation.id,
              original_escrow_amount: totalEscrowAmount
            }
          });
      }

      // Create freelancer payment if they're owed anything
      if (netFreelancerPayment > 0) {
        await supabase
          .from("contract_transactions")
          .insert({
            contract_id: contractId,
            transaction_type: 'partial_payment',
            amount: netFreelancerPayment,
            currency: contract.currency,
            from_user_id: contract.client_id,
            to_user_id: contract.freelancer_id,
            status: 'pending',
            metadata: {
              cancellation_id: cancellation.id,
              cancellation_compensation: true
            }
          });
      }
    }

    // Update all contract milestones to cancelled
    await supabase
      .from("contract_milestones")
      .update({ status: 'cancelled' })
      .eq("contract_id", contractId)
      .neq("status", "completed");

    // Log the activity
    await auditLogger.log({
      user_id: user.id,
      action: 'contract_cancelled',
      resource_id: contractId,
      resource_type: 'contract',
      metadata: {
        cancellation_id: cancellation.id,
        reason: body.reason,
        cancellation_fee: body.cancellation_fee,
        refund_amount: body.refund_amount,
        escrow_amount: totalEscrowAmount
      }
    });

    // TODO: Send notifications to other party
    // TODO: Process actual refunds via Stripe
    
    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      cancellation,
      message: "Contract cancelled successfully" 
    });
  } catch (error) {
    console.error("Contract cancellation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}