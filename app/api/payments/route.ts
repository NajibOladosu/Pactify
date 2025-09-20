import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { withAuth } from "@/utils/api/with-auth";
import type { User } from "@supabase/supabase-js";

async function handlePaymentsRequest(request: NextRequest, user: User) {
  try {
    const supabase = await createClient();
    
    console.log(`[PAYMENTS API] Fetching payments for user ${user.id}`);

    // Use the same RPC function as progress API to get contracts (bypasses RLS issues)
    const { data: contractsFromRPC, error: contractsError } = await supabase
      .rpc('get_user_contracts', { 
        p_user_id: user.id,
        p_apply_free_tier_limit: false
      });

    console.log(`[PAYMENTS API] RPC contracts result:`, { 
      contracts: contractsFromRPC?.length || 0,
      contractsError: contractsError?.message 
    });

    // Get real payment data from database
    const allPayments: any[] = [];
    
    // Get escrow payments
    const { data: escrowPayments, error: escrowError } = await supabase
      .from("contract_escrows")
      .select(`
        *,
        contracts!inner(
          id,
          title,
          client_id,
          freelancer_id,
          profiles!client_id(display_name),
          freelancer_profile:profiles!freelancer_id(display_name)
        )
      `)
      .or(`contracts.client_id.eq.${user.id},contracts.freelancer_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    // Get milestone payments
    const { data: milestonePayments, error: milestoneError } = await supabase
      .from("payments")
      .select(`
        *,
        contracts!contract_id(
          id,
          title,
          client_id,
          freelancer_id,
          profiles!client_id(display_name),
          freelancer_profile:profiles!freelancer_id(display_name)
        )
      `)
      .or(`contracts.client_id.eq.${user.id},contracts.freelancer_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    // Get withdrawal payments
    const { data: withdrawalPayments, error: withdrawalError } = await supabase
      .from("withdrawals")
      .select(`
        *,
        connected_accounts!connected_account_id(
          profiles!user_id(display_name)
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    console.log(`[PAYMENTS API] Database query results:`, {
      escrowPayments: escrowPayments?.length || 0,
      milestonePayments: milestonePayments?.length || 0,
      withdrawalPayments: withdrawalPayments?.length || 0,
      errors: {
        escrowError: escrowError?.message,
        milestoneError: milestoneError?.message,
        withdrawalError: withdrawalError?.message
      }
    });

    // Process escrow payments
    if (escrowPayments) {
      const formattedEscrowPayments = escrowPayments.map(escrow => {
        const isClient = escrow.contracts.client_id === user.id;
        const amount = parseFloat(escrow.total_amount) || 0;
        const fee = Math.round(amount * 0.05 * 100) / 100;
        const netAmount = amount - fee;

        return {
          id: `escrow-${escrow.id}`,
          amount: amount,
          net_amount: isClient ? amount : netAmount,
          fee: isClient ? 0 : fee,
          currency: escrow.currency || "USD",
          status: escrow.status, // pending_funding, funded, released, refunded
          payment_type: isClient ? "escrow_payment" : "escrow_release",
          created_at: escrow.created_at,
          completed_at: escrow.released_at || escrow.refunded_at,
          payer_id: escrow.contracts.client_id,
          payee_id: escrow.contracts.freelancer_id,
          contract: {
            id: escrow.contracts.id,
            title: escrow.contracts.title
          },
          payer: { 
            display_name: isClient ? "You" : escrow.contracts.profiles?.display_name || "Client"
          },
          payee: { 
            display_name: isClient ? escrow.contracts.freelancer_profile?.display_name || "Freelancer" : "You"
          },
          stripe_payment_intent_id: escrow.stripe_payment_intent_id,
          stripe_transfer_id: escrow.stripe_transfer_id
        };
      });
      allPayments.push(...formattedEscrowPayments);
    }

    // Process milestone payments
    if (milestonePayments) {
      const formattedMilestonePayments = milestonePayments.map(payment => {
        const isClient = payment.contracts.client_id === user.id;
        const amount = parseFloat(payment.amount) || 0;
        const fee = parseFloat(payment.platform_fee) || Math.round(amount * 0.05 * 100) / 100;
        const netAmount = amount - fee;

        return {
          id: `payment-${payment.id}`,
          amount: amount,
          net_amount: isClient ? amount : netAmount,
          fee: isClient ? 0 : fee,
          currency: payment.currency || "USD",
          status: payment.status, // pending, paid, failed, refunded
          payment_type: isClient ? "milestone_payment" : "milestone_release",
          created_at: payment.created_at,
          completed_at: payment.paid_at,
          payer_id: payment.contracts.client_id,
          payee_id: payment.contracts.freelancer_id,
          contract: {
            id: payment.contracts.id,
            title: payment.contracts.title
          },
          payer: { 
            display_name: isClient ? "You" : payment.contracts.profiles?.display_name || "Client"
          },
          payee: { 
            display_name: isClient ? payment.contracts.freelancer_profile?.display_name || "Freelancer" : "You"
          },
          stripe_payment_intent_id: payment.stripe_payment_intent_id,
          milestone_id: payment.milestone_id
        };
      });
      allPayments.push(...formattedMilestonePayments);
    }

    // Process withdrawal payments
    if (withdrawalPayments) {
      const formattedWithdrawalPayments = withdrawalPayments.map(withdrawal => ({
        id: `withdrawal-${withdrawal.id}`,
        amount: parseFloat(withdrawal.amount) || 0,
        net_amount: parseFloat(withdrawal.amount) || 0,
        fee: 0, // Withdrawal fees are handled separately
        currency: withdrawal.currency || "USD",
        status: withdrawal.status, // processing, paid, failed, canceled
        payment_type: "withdrawal",
        created_at: withdrawal.created_at,
        completed_at: withdrawal.arrived_at,
        payer_id: "platform", // Platform pays out
        payee_id: user.id,
        contract: null,
        payer: { display_name: "Pactify" },
        payee: { display_name: "You" },
        stripe_payout_id: withdrawal.stripe_payout_id,
        expected_arrival_date: withdrawal.expected_arrival_date
      }));
      allPayments.push(...formattedWithdrawalPayments);
    }

    console.log(`[PAYMENTS API] Processed ${allPayments.length} real payments for user ${user.id}`);

    // Sort all payments by creation date
    allPayments.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    console.log(`[PAYMENTS API] Final result: ${allPayments.length} payments for user ${user.id}`);

    return NextResponse.json({
      success: true,
      payments: allPayments,
      user_id: user.id,
      total: allPayments.length,
      debug: {
        escrow_payments: escrowPayments?.length || 0,
        milestone_payments: milestonePayments?.length || 0,
        withdrawal_payments: withdrawalPayments?.length || 0,
        total_payments: allPayments.length,
        errors: {
          escrow: escrowError?.message,
          milestone: milestoneError?.message,
          withdrawal: withdrawalError?.message
        },
        is_real_data: true
      }
    });

  } catch (error) {
    console.error("[PAYMENTS API] Unexpected error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handlePaymentsRequest);