import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: "Webhooks endpoint active",
    available_webhooks: {
      stripe: "/api/webhooks/stripe",
      stripe_connect: "/api/webhooks/stripe/connect",
      stripe_escrow: "/api/webhooks/stripe/escrow",
      stripe_identity: "/api/webhooks/stripe-identity",
      payoneer: "/api/webhooks/payout/payoneer",
      wise: "/api/webhooks/payout/wise",
      paypal: "/api/webhooks/payout/paypal",
      contract_payment: "/api/webhooks/contract-payment"
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    // Simple webhook dispatcher for testing
    console.log(`Webhook received: ${type}`, data);

    return NextResponse.json({
      success: true,
      message: `Webhook ${type} received and processed`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ 
      error: "Webhook processing failed" 
    }, { status: 500 });
  }
}