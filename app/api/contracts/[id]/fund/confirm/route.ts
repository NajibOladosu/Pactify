import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const { id: contractId } = await params;
    const body = await request.json();
    const { payment_intent_id, payment_method_id } = body;

    if (!payment_intent_id) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Payment intent ID is required" },
        { status: 400 }
      );
    }

    // Fetch contract details
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (contractError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Contract not found" },
        { status: 404 }
      );
    }

    // Verify user is the client
    if (contract.client_id !== user.id) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Only the client can confirm funding" },
        { status: 403 }
      );
    }

    // Get the payment record
    const { data: payment, error: paymentError } = await supabase
      .from("contract_payments")
      .select("*")
      .eq("contract_id", contractId)
      .eq("stripe_payment_id", payment_intent_id)
      .single();

    if (paymentError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Payment record not found" },
        { status: 404 }
      );
    }

    if (payment.status === "funded") {
      return NextResponse.json(
        { error: "ALREADY_FUNDED", message: "Payment already confirmed" },
        { status: 400 }
      );
    }

    // In a real implementation, this would verify the payment with Stripe
    // For now, we'll simulate a successful payment confirmation
    const mockPaymentConfirmation = {
      id: payment_intent_id,
      status: "succeeded",
      amount_received: Math.round(parseFloat(payment.amount.toString()) * 100), // Convert to cents
      currency: payment.currency?.toLowerCase() || "usd",
      charges: {
        data: [
          {
            id: `ch_${Date.now()}_${contractId.slice(0, 8)}`,
            paid: true,
            status: "succeeded",
            payment_method: payment_method_id || "pm_card_visa"
          }
        ]
      }
    };

    const now = new Date().toISOString();

    // Update payment status
    const { error: updatePaymentError } = await supabase
      .from("contract_payments")
      .update({
        status: "funded",
        metadata: {
          ...payment.metadata,
          funded_at: now,
          updated_at: now
        }
      })
      .eq("id", payment.id);

    if (updatePaymentError) {
      console.error("Payment update error:", updatePaymentError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to update payment status" },
        { status: 500 }
      );
    }

    // Update contract status to active
    const { data: updatedContract, error: contractUpdateError } = await supabase
      .from("contracts")
      .update({
        status: "active",
        is_funded: true,
        updated_at: now
      })
      .eq("id", contractId)
      .select()
      .single();

    if (contractUpdateError) {
      console.error("Contract update error:", contractUpdateError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to update contract status" },
        { status: 500 }
      );
    }

    // Log funding completion activity
    await supabase.from("contract_activities").insert({
      contract_id: contractId,
      user_id: user.id,
      activity_type: "funding_completed",
      description: `Escrow funding completed. Contract is now active.`,
      metadata: {
        payment_intent_id,
        payment_id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        funded_at: now
      }
    });

    // Create notifications for freelancer
    if (contract.freelancer_id) {
      await supabase.from("notifications").insert({
        user_id: contract.freelancer_id,
        type: "contract_funded",
        title: "Contract Funded - Work Can Begin",
        message: `Contract "${contract.title}" has been funded and is now active. You can begin work.`,
        related_entity_type: "contract",
        related_entity_id: contractId
      });
    }

    // If this is a milestone contract, activate the first milestone
    if (contract.type === "milestone") {
      const { data: firstMilestone } = await supabase
        .from("contract_milestones")
        .select("*")
        .eq("contract_id", contractId)
        .eq("order_index", 1)
        .single();

      if (firstMilestone) {
        await supabase
          .from("contract_milestones")
          .update({
            status: "in_progress",
            updated_at: now
          })
          .eq("id", firstMilestone.id);

        // Log milestone activation
        await supabase.from("contract_activities").insert({
          contract_id: contractId,
          user_id: user.id,
          activity_type: "milestone_activated",
          description: `First milestone "${firstMilestone.title}" activated`,
          metadata: {
            milestone_id: firstMilestone.id,
            milestone_order: 1
          }
        });
      }
    }

    return NextResponse.json({
      success: true,
      contract: updatedContract,
      payment_confirmation: {
        payment_intent_id,
        status: "succeeded",
        amount: payment.amount,
        currency: payment.currency,
        funded_at: now
      },
      message: "Contract funded successfully and is now active",
      next_steps: {
        for_freelancer: "Begin work according to the contract terms",
        for_client: "Monitor progress and communicate with the freelancer"
      }
    });

  } catch (error) {
    console.error("Payment confirmation error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}