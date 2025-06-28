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
    const { payment_method_id, return_url } = body;

    // Fetch contract details
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (contractError) {
      if (contractError.code === 'PGRST116') {
        return NextResponse.json(
          { error: "NOT_FOUND", message: "Contract not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch contract" },
        { status: 500 }
      );
    }

    // Verify user is the client (only client can fund)
    if (contract.client_id !== user.id) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Only the client can fund the contract" },
        { status: 403 }
      );
    }

    // Check contract status
    if (contract.status !== "pending_funding") {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: `Contract must be in pending_funding status. Current status: ${contract.status}` },
        { status: 400 }
      );
    }

    // Check if contract is already funded
    const { data: existingPayment } = await supabase
      .from("contract_payments")
      .select("*")
      .eq("contract_id", contractId)
      .eq("status", "funded")
      .single();

    if (existingPayment) {
      return NextResponse.json(
        { error: "ALREADY_FUNDED", message: "Contract is already funded" },
        { status: 400 }
      );
    }

    // KYC verification will be required only when withdrawing funds
    // For funding projects, we allow users to proceed without KYC verification

    // Calculate fees
    const contractAmount = parseFloat(contract.total_amount.toString());
    const platformFeeRate = 0.025; // 2.5%
    const stripeFee = (contractAmount * 0.029) + 0.30; // Stripe's fee
    const platformFee = contractAmount * platformFeeRate;
    const totalToCharge = contractAmount + stripeFee + platformFee;

    // Create payment record
    const { data: payment, error: paymentError } = await supabase
      .from("contract_payments")
      .insert({
        contract_id: contractId,
        amount: contractAmount,
        user_id: user.id, // Required for RLS policy
        currency: contract.currency || "USD",
        status: "pending",
        payment_type: "funding",
        metadata: {
          platform_fee: platformFee,
          stripe_fee: stripeFee,
          total_charge: totalToCharge,
          payer_id: user.id,
          payee_id: contract.freelancer_id
        }
      })
      .select()
      .single();

    if (paymentError) {
      console.error("Payment creation error:", paymentError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to create payment record" },
        { status: 500 }
      );
    }

    // In a real implementation, this would create a Stripe Payment Intent
    const mockPaymentIntent = {
      id: `pi_${Date.now()}_${contractId.slice(0, 8)}`,
      amount: Math.round(totalToCharge * 100), // Stripe uses cents
      currency: (contract.currency || "USD").toLowerCase(),
      client_secret: `pi_${Date.now()}_secret_${contractId.slice(0, 8)}`,
      status: "requires_payment_method",
      payment_method: payment_method_id || null,
      metadata: {
        contract_id: contractId,
        payment_id: payment.id,
        platform_fee: platformFee.toFixed(2),
        stripe_fee: stripeFee.toFixed(2)
      }
    };

    // Update payment with Stripe payment intent ID
    await supabase
      .from("contract_payments")
      .update({
        stripe_payment_id: mockPaymentIntent.id,
        metadata: {
          ...payment.metadata,
          payment_intent_id: mockPaymentIntent.id
        }
      })
      .eq("id", payment.id);

    // Log funding initiation activity
    await supabase.from("contract_activities").insert({
      contract_id: contractId,
      user_id: user.id,
      activity_type: "funding_initiated",
      description: `Escrow funding initiated for ${contractAmount} ${contract.currency}`,
      metadata: {
        payment_intent_id: mockPaymentIntent.id,
        amount: contractAmount,
        platform_fee: platformFee,
        stripe_fee: stripeFee,
        total_charge: totalToCharge
      }
    });

    return NextResponse.json({
      success: true,
      payment_intent: mockPaymentIntent,
      payment_id: payment.id,
      amount_breakdown: {
        contract_amount: contractAmount,
        platform_fee: platformFee,
        stripe_fee: stripeFee,
        total_to_charge: totalToCharge
      },
      message: "Payment intent created successfully",
      next_steps: {
        action: "confirm_payment",
        description: "Complete payment to fund the project",
        client_secret: mockPaymentIntent.client_secret
      }
    });

  } catch (error) {
    console.error("Contract funding error:", error);
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

    // Check access
    const hasAccess = 
      contract.creator_id === user.id ||
      contract.client_id === user.id ||
      contract.freelancer_id === user.id;

    if (!hasAccess) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Access denied" },
        { status: 403 }
      );
    }

    // Get payment records for this contract
    const { data: payments, error: paymentsError } = await supabase
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

    // Determine funding status
    const fundedPayment = payments?.find(p => p.status === "funded");
    const pendingPayment = payments?.find(p => p.status === "pending");
    
    const fundingStatus = {
      is_funded: !!fundedPayment,
      funding_amount: fundedPayment?.amount || null,
      funded_at: fundedPayment?.funded_at || null,
      pending_payment: pendingPayment ? {
        id: pendingPayment.id,
        amount: pendingPayment.amount,
        stripe_payment_intent_id: pendingPayment.stripe_payment_intent_id,
        created_at: pendingPayment.created_at
      } : null,
      can_fund: contract.client_id === user.id && contract.status === "pending_funding" && !fundedPayment,
      payments: payments || []
    };

    return NextResponse.json({
      success: true,
      contract_id: contractId,
      funding_status: fundingStatus,
      contract_status: contract.status,
      contract_amount: contract.total_amount,
      currency: contract.currency || "USD"
    });

  } catch (error) {
    console.error("Funding status fetch error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}