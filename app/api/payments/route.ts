import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { withAuth } from "@/utils/api/with-auth";
import type { User } from "@supabase/supabase-js";

async function handlePaymentsRequest(request: NextRequest, user: User) {
  try {
    // Use regular client with updated RLS policies
    const supabase = await createClient();
    
    // Use the same RPC function as progress API to get contracts (bypasses RLS issues)
    const { data: contractsFromRPC, error: contractsError } = await supabase
      .rpc('get_user_contracts', { 
        p_user_id: user.id,
        p_apply_free_tier_limit: false
      });

    // Get real payment data from database
    const allPayments: any[] = [];
    
    // First get contracts where user is client or freelancer
    const { data: userContracts, error: userContractsError } = await supabase
      .from("contracts")
      .select("id")
      .or(`client_id.eq.${user.id},freelancer_id.eq.${user.id}`);


    // Get escrow payments - simplified to avoid join issues
    let escrowPayments = null;
    let escrowError = null;
    
    if (userContracts && userContracts.length > 0) {
      const contractIds = userContracts.map(c => c.id);
      
      const result = await supabase
        .from("contract_escrows")
        .select("*")
        .in("contract_id", contractIds)
        .order("created_at", { ascending: false });
      
      escrowPayments = result.data;
      escrowError = result.error;
      
    }

    // Get milestone payments - using service role, so we can query directly
    let milestonePayments = null;
    let milestoneError = null;

    // Query payments directly where user is payer or payee - simplified without complex joins
    const { data: userPayments, error: paymentsError } = await supabase
      .from("payments")
      .select("*")
      .or(`payer_id.eq.${user.id},payee_id.eq.${user.id}`)
      .order("created_at", { ascending: false });
    

    // Now enhance the payments with contract and profile info
    if (userPayments && userPayments.length > 0) {
      const enhancedPayments = [];
      
      for (const payment of userPayments) {
        // Get contract info
        const { data: contract, error: contractError } = await supabase
          .from("contracts")
          .select("id, title, client_id, freelancer_id")
          .eq("id", payment.contract_id)
          .single();
          
        
        let clientProfile = null;
        let freelancerProfile = null;
        
        // Get profiles separately
        if (contract?.client_id) {
          const { data: client } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", contract.client_id)
            .single();
          clientProfile = client;
        }
        
        if (contract?.freelancer_id) {
          const { data: freelancer } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", contract.freelancer_id)
            .single();
          freelancerProfile = freelancer;
        }
        
        enhancedPayments.push({
          ...payment,
          contracts: {
            ...contract,
            profiles: clientProfile,
            freelancer_profile: freelancerProfile
          }
        });
      }
      
      milestonePayments = enhancedPayments;
    } else {
      milestonePayments = [];
    }
    
    milestoneError = paymentsError;

    // Get withdrawal payments (skip if table doesn't exist)
    let withdrawalPayments = null;
    let withdrawalError = null;
    
    // Check if withdrawals table exists first
    const { data: tableExists } = await supabase
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_name", "withdrawals")
      .eq("table_schema", "public")
      .single();
    
    if (tableExists) {
      const result = await supabase
        .from("withdrawals")
        .select(`
          *,
          connected_accounts!connected_account_id(
            profiles!user_id(display_name)
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      withdrawalPayments = result.data;
      withdrawalError = result.error;
    }


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

    // Sort all payments by creation date
    allPayments.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

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