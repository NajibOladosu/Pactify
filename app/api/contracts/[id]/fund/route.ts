import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-06-30.basil",
  typescript: true,
});

// Get base URL for redirects
const getURL = () => {
  // Prioritize NEXT_PUBLIC_SITE_URL based on user's Vercel config
  let url =
    process?.env?.NEXT_PUBLIC_SITE_URL ?? // Use the variable set in Vercel
    process?.env?.NEXT_PUBLIC_VERCEL_URL ?? // Fallback to Vercel system variable
    'http://localhost:3000/'; // Default for local dev
  // Make sure to include `https://` when not localhost.
  url = url.includes('http') ? url : `https://${url}`;
  // Make sure to include a trailing `/`.
  url = url.charAt(url.length - 1) === '/' ? url : `${url}/`;
  return url;
}

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

    // Fetch contract details first
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

    // Fetch contract parties separately
    const { data: contractParties, error: partiesError } = await supabase
      .from("contract_parties")
      .select("user_id, role, status")
      .eq("contract_id", contractId);

    if (partiesError || !contractParties) {
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch contract parties" },
        { status: 500 }
      );
    }

    // Check if user is the client (only client can fund)
    const clientParty = contractParties.find(
      (party: any) => party.role === 'client'
    );
    
    if (!clientParty || clientParty.user_id !== user.id) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Only the client can fund the contract" },
        { status: 403 }
      );
    }

    // Get freelancer party for later use
    const freelancerParty = contractParties.find(
      (party: any) => party.role === 'freelancer'
    );
    
    if (!freelancerParty) {
      return NextResponse.json(
        { error: "INVALID_CONTRACT", message: "Freelancer not found for this contract" },
        { status: 400 }
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

    // Create payment record (RLS policy now allows contract participants)
    const { data: payment, error: paymentError } = await supabase
      .from("contract_payments")
      .insert({
        contract_id: contractId,
        amount: contractAmount,
        user_id: user.id,
        currency: contract.currency || "USD",
        status: "pending",
        payment_type: "escrow",
        metadata: {
          platform_fee: platformFee,
          stripe_fee: stripeFee,
          total_charge: totalToCharge,
          payer_id: user.id,
          payee_id: freelancerParty.user_id
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

    const baseUrl = getURL();
    const successUrl = `${baseUrl}dashboard/contracts/${contractId}?payment=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}dashboard/contracts/${contractId}?payment=cancelled`;

    console.log('[Contract Funding] Base URL:', baseUrl);
    console.log('[Contract Funding] Success URL:', successUrl);
    console.log('[Contract Funding] Cancel URL:', cancelUrl);

    // Create Stripe Checkout Session (like subscription flow)
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: (contract.currency || "USD").toLowerCase(),
            product_data: {
              name: `Contract Funding: ${contract.title}`,
              description: `Escrow payment for contract`,
            },
            unit_amount: Math.round(contractAmount * 100), // Contract amount
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: (contract.currency || "USD").toLowerCase(),
            product_data: {
              name: 'Platform Fee',
              description: 'Pactify platform fee (2.5%)',
            },
            unit_amount: Math.round(platformFee * 100), // Platform fee
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: (contract.currency || "USD").toLowerCase(),
            product_data: {
              name: 'Processing Fee',
              description: 'Payment processing fee',
            },
            unit_amount: Math.round(stripeFee * 100), // Processing fee
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        contract_id: contractId,
        payment_id: payment.id,
        platform_fee: platformFee.toFixed(2),
        stripe_fee: stripeFee.toFixed(2),
        contract_amount: contractAmount.toFixed(2),
        payment_type: 'contract_funding'
      },
      customer_email: user.email || undefined,
    });

    if (!checkoutSession.url) {
      console.error("Stripe session creation failed, no URL returned.");
      return NextResponse.json(
        { error: 'STRIPE_ERROR', message: 'Could not create checkout session' }, 
        { status: 500 }
      );
    }

    // Update payment with Stripe checkout session ID
    await supabase
      .from("contract_payments")
      .update({
        stripe_payment_id: checkoutSession.id,
        metadata: {
          ...payment.metadata,
          checkout_session_id: checkoutSession.id,
          checkout_url: checkoutSession.url
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
        checkout_session_id: checkoutSession.id,
        amount: contractAmount,
        platform_fee: platformFee,
        stripe_fee: stripeFee,
        total_charge: totalToCharge
      }
    });

    return NextResponse.json({
      success: true,
      checkout_session: {
        id: checkoutSession.id,
        url: checkoutSession.url,
        amount_total: checkoutSession.amount_total,
        currency: checkoutSession.currency
      },
      payment_id: payment.id,
      amount_breakdown: {
        contract_amount: contractAmount,
        platform_fee: platformFee,
        stripe_fee: stripeFee,
        total_to_charge: totalToCharge
      },
      message: "Checkout session created successfully. Redirecting to Stripe Checkout.",
      next_steps: {
        action: "redirect_to_stripe",
        description: "Redirect user to Stripe Checkout page",
        checkout_url: checkoutSession.url
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

    // Fetch contract details first
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

    // Fetch contract parties separately
    const { data: contractParties, error: partiesError } = await supabase
      .from("contract_parties")
      .select("user_id, role, status")
      .eq("contract_id", contractId);

    if (partiesError || !contractParties) {
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch contract parties" },
        { status: 500 }
      );
    }

    // Check access - user must be a party to the contract
    const hasAccess = contractParties.some(
      (party: any) => party.user_id === user.id
    );

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

    // Calculate amounts for display
    const contractAmount = parseFloat(contract.total_amount?.toString() || "0");
    const platformFeeRate = 0.025; // 2.5%
    const stripeFee = (contractAmount * 0.029) + 0.30;
    const platformFee = contractAmount * platformFeeRate;
    const totalToCharge = contractAmount + stripeFee + platformFee;

    // Determine funding status
    const fundedPayment = payments?.find(p => p.status === "completed");
    const pendingPayment = payments?.find(p => p.status === "pending");
    
    const fundingStatus = {
      is_funded: !!fundedPayment,
      funding_amount: fundedPayment?.amount || null,
      funded_at: fundedPayment?.metadata?.funded_at || null,
      pending_payment: pendingPayment ? {
        id: pendingPayment.id,
        amount: pendingPayment.amount,
        stripe_payment_id: pendingPayment.stripe_payment_id,
        created_at: pendingPayment.created_at
      } : null,
      can_fund: contractParties.some((party: any) => party.role === 'client' && party.user_id === user.id) && contract.status === "pending_funding" && !fundedPayment,
      payments: payments || []
    };

    const amountBreakdown = {
      contract_amount: contractAmount,
      platform_fee: platformFee,
      stripe_fee: stripeFee,
      total_to_charge: totalToCharge
    };

    return NextResponse.json({
      success: true,
      contract_id: contractId,
      funding_status: fundingStatus,
      contract_status: contract.status,
      contract_amount: contract.total_amount,
      currency: contract.currency || "USD",
      amount_breakdown: amountBreakdown
    });

  } catch (error) {
    console.error("Funding status fetch error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}