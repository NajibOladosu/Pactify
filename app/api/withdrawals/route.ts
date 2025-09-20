import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { withAuth } from "@/utils/api/with-auth";
import type { User } from "@supabase/supabase-js";

async function handleWithdrawalsRequest(request: NextRequest, user: User) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status');

    // Build query
    let query = supabase
      .from('withdrawals')
      .select(`
        *,
        connected_accounts!connected_account_id(
          stripe_account_id,
          details_submitted,
          payouts_enabled
        )
      `)
      .eq('user_id', user.id)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: withdrawals, error } = await query;

    if (error) {
      console.error("Error fetching withdrawals:", error);
      return NextResponse.json({ 
        error: "Failed to fetch withdrawals" 
      }, { status: 500 });
    }

    // Get withdrawal statistics
    const { data: stats } = await supabase
      .rpc('get_user_withdrawal_stats', { user_uuid: user.id });

    return NextResponse.json({
      success: true,
      withdrawals: withdrawals || [],
      stats: stats?.[0] || {
        total_withdrawn: 0,
        pending_withdrawals: 0,
        successful_withdrawals: 0,
        failed_withdrawals: 0
      },
      pagination: {
        limit,
        offset,
        has_more: (withdrawals?.length || 0) === limit
      }
    });

  } catch (error) {
    console.error("Withdrawals API error:", error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}

async function handleWithdrawalCreation(request: NextRequest, user: User) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { amount, method = 'stripe', external_account_id } = body;

    // Validate amount
    if (!amount || amount <= 0) {
      return NextResponse.json({ 
        error: "Invalid amount" 
      }, { status: 400 });
    }

    // Check user's available balance
    const { data: contractsFromRPC } = await supabase
      .rpc('get_user_contracts', { 
        p_user_id: user.id,
        p_apply_free_tier_limit: false
      });

    let availableBalance = 0;
    if (contractsFromRPC && contractsFromRPC.length > 0) {
      availableBalance = contractsFromRPC
        .filter((contract: any) => 
          contract.status === "completed" && 
          contract.freelancer_id === user.id
        )
        .reduce((sum: number, contract: any) => {
          const amount = parseFloat(contract.total_amount) || 0;
          const fee = Math.round(amount * 0.05 * 100) / 100;
          const netAmount = amount - fee;
          return sum + netAmount;
        }, 0);
    }

    // Subtract already withdrawn amounts
    const { data: withdrawnAmount } = await supabase
      .from('withdrawals')
      .select('amount')
      .eq('user_id', user.id)
      .in('status', ['processing', 'paid']);

    const totalWithdrawn = withdrawnAmount?.reduce((sum, w) => sum + parseFloat(w.amount), 0) || 0;
    availableBalance -= totalWithdrawn;

    if (availableBalance < amount) {
      return NextResponse.json({ 
        error: `Insufficient balance. Available: $${availableBalance.toFixed(2)}` 
      }, { status: 400 });
    }

    // Get or verify connected account
    const { data: connectedAccount } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!connectedAccount) {
      return NextResponse.json({ 
        error: "No connected account found. Please complete account verification first." 
      }, { status: 400 });
    }

    if (!connectedAccount.details_submitted || !connectedAccount.payouts_enabled) {
      return NextResponse.json({ 
        error: "Account verification required. Please complete your account setup first." 
      }, { status: 400 });
    }

    // Create withdrawal request record
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('withdrawals')
      .insert({
        user_id: user.id,
        connected_account_id: connectedAccount.id,
        amount: amount,
        currency: 'USD',
        status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (withdrawalError) {
      console.error("Error creating withdrawal record:", withdrawalError);
      return NextResponse.json({ 
        error: "Failed to create withdrawal request" 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      withdrawal: withdrawal,
      message: `Withdrawal request of $${amount.toFixed(2)} created successfully. Processing will begin shortly.`
    });

  } catch (error) {
    console.error("Withdrawal creation error:", error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}

export const GET = withAuth(handleWithdrawalsRequest);
export const POST = withAuth(handleWithdrawalCreation);