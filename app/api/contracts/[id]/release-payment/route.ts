import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { balanceSyncManager } from '@/lib/payout/balance-sync';

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
    const { milestone_id = null, release_amount = null } = body;

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

    // Verify user is the client (only client can release payments)
    if (contract.client_id !== user.id) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Only the client can release payments" },
        { status: 403 }
      );
    }

    // Check contract status
    if (!["pending_completion", "completed"].includes(contract.status)) {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: `Cannot release payment. Contract status: ${contract.status}` },
        { status: 400 }
      );
    }

    // Verify contract is funded
    if (!contract.is_funded) {
      return NextResponse.json(
        { error: "NOT_FUNDED", message: "Contract is not funded" },
        { status: 400 }
      );
    }

    // Get the funded payment record
    const { data: fundedPayment, error: paymentError } = await supabase
      .from("contract_payments")
      .select("*")
      .eq("contract_id", contractId)
      .eq("status", "completed")
      .single();

    if (paymentError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "No funded payment found for this contract" },
        { status: 404 }
      );
    }

    // Check if payment has already been released
    if (fundedPayment.status === "released") {
      return NextResponse.json(
        { error: "ALREADY_RELEASED", message: "Payment has already been released" },
        { status: 400 }
      );
    }

    // For milestone contracts, verify the milestone if provided
    let milestoneAmount = null;
    if (milestone_id) {
      const { data: milestone, error: milestoneError } = await supabase
        .from("contract_milestones")
        .select("*")
        .eq("id", milestone_id)
        .eq("contract_id", contractId)
        .single();

      if (milestoneError) {
        return NextResponse.json(
          { error: "NOT_FOUND", message: "Milestone not found" },
          { status: 404 }
        );
      }

      if (milestone.status !== "approved") {
        return NextResponse.json(
          { error: "MILESTONE_NOT_APPROVED", message: "Milestone must be approved before payment release" },
          { status: 400 }
        );
      }

      milestoneAmount = milestone.amount;
    }

    // Determine release amount
    const amountToRelease = release_amount || milestoneAmount || fundedPayment.net_amount;

    // Verify sufficient funds
    if (amountToRelease > fundedPayment.net_amount) {
      return NextResponse.json(
        { error: "INSUFFICIENT_FUNDS", message: "Release amount exceeds available funds" },
        { status: 400 }
      );
    }

    // Verify freelancer KYC requirements for receiving payments
    const freelancerKycCheckResponse = await fetch(`${request.nextUrl.origin}/api/kyc/check-requirements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: contract.freelancer_id,
        contract_amount: amountToRelease,
        currency: contract.currency || "USD",
        action: "withdrawal"
      })
    });

    if (freelancerKycCheckResponse.ok) {
      const freelancerKycCheck = await freelancerKycCheckResponse.json();
      if (!freelancerKycCheck.eligible) {
        return NextResponse.json(
          { 
            error: "FREELANCER_KYC_REQUIRED", 
            message: "Freelancer must complete KYC verification before receiving payments",
            kyc_requirements: freelancerKycCheck.action_plan,
            required_verification: freelancerKycCheck.required_verification
          },
          { status: 403 }
        );
      }
    }

    // Get freelancer's Stripe Connect account
    const { data: freelancerProfile } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id")
      .eq("id", contract.freelancer_id)
      .single();

    if (!freelancerProfile?.stripe_connect_account_id) {
      return NextResponse.json(
        { error: "NO_PAYOUT_ACCOUNT", message: "Freelancer has not set up payout account" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // In a real implementation, this would create a Stripe transfer
    const mockStripeTransfer = {
      id: `tr_${Date.now()}_${contractId.slice(0, 8)}`,
      amount: Math.round(amountToRelease * 100), // Stripe uses cents
      currency: fundedPayment.currency?.toLowerCase() || "usd",
      destination: freelancerProfile.stripe_connect_account_id,
      created: Math.floor(Date.now() / 1000),
      metadata: {
        contract_id: contractId,
        milestone_id: milestone_id || null,
        payment_id: fundedPayment.id
      }
    };

    // Create new payment record for the release
    const { data: releasePayment, error: releaseError } = await supabase
      .from("contract_payments")
      .insert({
        contract_id: contractId,
        user_id: user.id, // Current user (client) creating the release record
        amount: amountToRelease,
        currency: fundedPayment.currency,
        status: "released",
        payment_type: "release",
        stripe_payment_id: mockStripeTransfer.id,
        metadata: {
          milestone_id,
          payer_id: contract.client_id,
          payee_id: contract.freelancer_id,
          fee: 0,
          net_amount: amountToRelease,
          stripe_transfer_id: mockStripeTransfer.id,
          released_at: now
        }
      })
      .select()
      .single();

    if (releaseError) {
      console.error("Release payment creation error:", releaseError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to create release payment record" },
        { status: 500 }
      );
    }

    // Update original payment record
    const fundedNetAmount = fundedPayment.metadata?.net_amount || fundedPayment.amount;
    const remainingAmount = fundedNetAmount - amountToRelease;
    const paymentUpdateData: any = {
      metadata: {
        ...fundedPayment.metadata,
        net_amount: remainingAmount,
        updated_at: now
      }
    };

    // If full amount released, mark as released
    if (remainingAmount <= 0) {
      paymentUpdateData.status = "released";
      paymentUpdateData.metadata.released_at = now;
    }

    await supabase
      .from("contract_payments")
      .update(paymentUpdateData)
      .eq("id", fundedPayment.id);

    // Update milestone status if applicable
    if (milestone_id) {
      await supabase
        .from("contract_milestones")
        .update({
          status: "completed",
          completed_at: now,
          updated_at: now
        })
        .eq("id", milestone_id);
    }

    // Check if contract should be marked as completed
    let shouldCompleteContract = false;
    if (contract.type === "milestone") {
      // Check if all milestones are completed
      const { data: allMilestones } = await supabase
        .from("contract_milestones")
        .select("status")
        .eq("contract_id", contractId);

      const incompleteMilestones = allMilestones?.filter(m => m.status !== "completed") || [];
      shouldCompleteContract = incompleteMilestones.length === 0;
    } else {
      // For fixed contracts, complete when full payment is released
      shouldCompleteContract = remainingAmount <= 0;
    }

    // Update contract status if completed
    if (shouldCompleteContract) {
      await supabase
        .from("contracts")
        .update({
          status: "completed",
          completed_at: now,
          updated_at: now
        })
        .eq("id", contractId);
    }

    // Log payment release activity
    await supabase.from("contract_activities").insert({
      contract_id: contractId,
      user_id: user.id,
      activity_type: milestone_id ? "milestone_payment_released" : "payment_released",
      description: milestone_id ? 
        `Payment released for completed milestone (${amountToRelease} ${fundedPayment.currency})` :
        `Payment released to freelancer (${amountToRelease} ${fundedPayment.currency})`,
      metadata: {
        release_payment_id: releasePayment.id,
        milestone_id,
        amount_released: amountToRelease,
        stripe_transfer_id: mockStripeTransfer.id,
        remaining_escrow: remainingAmount,
        contract_completed: shouldCompleteContract
      }
    });

    // Credit freelancer's wallet balance for withdrawal
    try {
      await balanceSyncManager.creditFreelancerBalance(
        contractId,
        contract.freelancer_id,
        amountToRelease,
        fundedPayment.currency || 'USD',
        releasePayment.id,
        {
          contract_title: contract.title,
          milestone_id: milestone_id,
          release_type: milestone_id ? 'milestone' : 'full_payment'
        }
      );
    } catch (balanceError) {
      console.error('Failed to credit freelancer balance:', balanceError);
      // Don't fail the release if balance credit fails, but log it
      // In production, you might want to queue this for retry
    }

    // Create notification for freelancer
    await supabase.from("notifications").insert({
      user_id: contract.freelancer_id,
      type: "payment_released",
      title: "Payment Released!",
      message: milestone_id ?
        `Payment for completed milestone has been released: ${amountToRelease} ${fundedPayment.currency}` :
        `Payment has been released: ${amountToRelease} ${fundedPayment.currency}`,
      related_entity_type: "contract",
      related_entity_id: contractId
    });

    // If contract is now completed, create completion notifications
    if (shouldCompleteContract) {
      const completionNotifications = [
        {
          user_id: contract.client_id,
          title: "Contract Completed",
          message: `Contract "${contract.title}" has been completed successfully.`
        },
        {
          user_id: contract.freelancer_id,
          title: "Contract Completed",
          message: `Contract "${contract.title}" has been completed. All payments have been released.`
        }
      ];

      for (const notification of completionNotifications) {
        await supabase.from("notifications").insert({
          ...notification,
          type: "contract_completed",
          related_entity_type: "contract",
          related_entity_id: contractId
        });
      }
    }

    return NextResponse.json({
      success: true,
      payment_release: {
        id: releasePayment.id,
        amount: amountToRelease,
        currency: fundedPayment.currency,
        transfer_id: mockStripeTransfer.id,
        released_at: now
      },
      escrow_status: {
        original_amount: fundedPayment.amount,
        released_amount: amountToRelease,
        remaining_amount: remainingAmount,
        fully_released: remainingAmount <= 0
      },
      contract_completed: shouldCompleteContract,
      message: shouldCompleteContract ?
        "Payment released and contract completed successfully" :
        "Payment released successfully"
    });

  } catch (error) {
    console.error("Payment release error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
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

    // Create service client for database operations
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );

    // Verify access to contract
    const { data: contract, error: contractError } = await serviceSupabase
      .from("contracts")
      .select("creator_id, client_id, freelancer_id, status, is_funded, type, total_amount, currency")
      .eq("id", contractId)
      .single();

    if (contractError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Contract not found" },
        { status: 404 }
      );
    }

    const hasAccess = 
      contract.creator_id === user.id ||
      contract.client_id === user.id ||
      contract.freelancer_id === user.id;

    if (!hasAccess) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Access denied to contract" },
        { status: 403 }
      );
    }

    // Get all payment records for this contract
    const { data: payments, error: paymentsError } = await serviceSupabase
      .from("contract_payments")
      .select("*")
      .eq("contract_id", contractId)
      .order("created_at", { ascending: false });

    if (paymentsError) {
      console.error("Payments fetch error:", paymentsError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch payment records" },
        { status: 500 }
      );
    }

    // Calculate payment summary
    const fundedPayments = payments?.filter(p => p.status === "completed") || [];
    const releasedPayments = payments?.filter(p => p.status === "released") || [];
    
    const totalFunded = fundedPayments.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);
    const totalReleased = releasedPayments.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);
    const remainingInEscrow = totalFunded - totalReleased;

    const paymentSummary = {
      total_contract_amount: parseFloat(contract.total_amount?.toString() || "0"),
      total_funded: totalFunded,
      total_released: totalReleased,
      remaining_in_escrow: remainingInEscrow,
      can_release_payment: contract.client_id === user.id && 
                          contract.is_funded && 
                          remainingInEscrow > 0 &&
                          ["pending_completion", "completed"].includes(contract.status),
      release_eligibility: {
        is_client: contract.client_id === user.id,
        is_funded: contract.is_funded,
        has_escrow_balance: remainingInEscrow > 0,
        valid_status: ["pending_completion", "completed"].includes(contract.status)
      }
    };

    return NextResponse.json({
      success: true,
      payments: payments || [],
      payment_summary: paymentSummary,
      contract_status: contract.status,
      contract_type: contract.type,
      currency: contract.currency || "USD"
    });

  } catch (error) {
    console.error("Payment status fetch error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}