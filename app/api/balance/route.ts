import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { withAuth } from "@/utils/api/with-auth";
import type { User } from "@supabase/supabase-js";

async function handleBalanceRequest(request: NextRequest, user: User) {
  try {
    const supabase = await createClient();

    // Get user's contracts to calculate balance
    const { data: contractsFromRPC, error: contractsError } = await supabase
      .rpc('get_user_contracts', { 
        p_user_id: user.id,
        p_apply_free_tier_limit: false
      });

    if (contractsError) {
      console.error("Error fetching contracts for balance:", contractsError);
      return NextResponse.json({ 
        error: "Unable to fetch balance information" 
      }, { status: 500 });
    }

    // Calculate available balance from completed contracts where user is freelancer
    let availableBalance = 0;
    let totalEarned = 0;
    let pendingBalance = 0;

    if (contractsFromRPC && contractsFromRPC.length > 0) {
      for (const contract of contractsFromRPC) {
        if (contract.freelancer_id === user.id) {
          const amount = parseFloat(contract.total_amount) || 0;
          const fee = Math.round(amount * 0.05 * 100) / 100;
          const netAmount = amount - fee;

          if (contract.status === "completed") {
            availableBalance += netAmount;
            totalEarned += netAmount;
          } else if (['signed', 'in_progress', 'pending_delivery'].includes(contract.status)) {
            pendingBalance += netAmount;
          }
        }
      }
    }

    // Get withdrawal history to subtract withdrawn amounts
    const { data: withdrawals, error: withdrawalError } = await supabase
      .from('withdrawals')
      .select('amount, status')
      .eq('user_id', user.id);

    let totalWithdrawn = 0;
    let pendingWithdrawals = 0;

    if (withdrawals) {
      for (const withdrawal of withdrawals) {
        const amount = parseFloat(withdrawal.amount) || 0;
        if (withdrawal.status === 'paid') {
          totalWithdrawn += amount;
        } else if (['processing', 'pending'].includes(withdrawal.status)) {
          pendingWithdrawals += amount;
        }
      }
    }

    // Adjust available balance
    availableBalance -= totalWithdrawn;
    availableBalance -= pendingWithdrawals;

    // Get escrow balances
    const { data: escrows } = await supabase
      .from('contract_escrows')
      .select('total_amount, status, contracts!inner(freelancer_id)')
      .eq('contracts.freelancer_id', user.id);

    let escrowBalance = 0;
    if (escrows) {
      escrowBalance = escrows
        .filter(e => e.status === 'funded')
        .reduce((sum, e) => sum + (parseFloat(e.total_amount) || 0), 0);
    }

    return NextResponse.json({
      success: true,
      balance: {
        available: Math.max(0, availableBalance),
        pending: pendingBalance,
        escrow: escrowBalance,
        total_earned: totalEarned,
        total_withdrawn: totalWithdrawn,
        pending_withdrawals: pendingWithdrawals
      },
      currency: 'USD',
      last_updated: new Date().toISOString()
    });

  } catch (error) {
    console.error("Balance API error:", error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}

export const GET = withAuth(handleBalanceRequest);