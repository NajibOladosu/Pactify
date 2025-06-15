import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { 
  StripeOnboardingSchema,
  validateSchema 
} from "@/utils/security/enhanced-validation-schemas";
import { auditLog } from "@/utils/security/audit-logger";
import Stripe from 'stripe';

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    
    // Validate input
    const validation = validateSchema(StripeOnboardingSchema, body);
    if (!validation.success) {
      return NextResponse.json({ 
        error: "VALIDATION_ERROR", 
        message: "Invalid input data",
        details: validation.errors 
      }, { status: 400 });
    }

    const { country = "US", business_type = "individual" } = validation.data!;

    // Get user profile and KYC verification
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    const { data: kycVerification } = await supabase
      .from("kyc_verifications")
      .select("*")
      .eq("profile_id", user.id)
      .single();

    if (!kycVerification || kycVerification.verification_level === "basic") {
      return NextResponse.json(
        { error: "INSUFFICIENT_KYC", message: "Enhanced or Business verification required" },
        { status: 400 }
      );
    }

    if (kycVerification.stripe_account_id) {
      return NextResponse.json(
        { error: "ACCOUNT_EXISTS", message: "Stripe Connect account already exists" },
        { status: 400 }
      );
    }

    // Initialize Stripe (if STRIPE_SECRET_KEY is available)
    const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-03-31.basil',
    }) : null;

    try {
      let stripeAccount;
      let accountLink;

      if (stripe) {
        // Create real Stripe Express account
        stripeAccount = await stripe.accounts.create({
          type: 'express',
          country: country,
          business_type: business_type as 'individual' | 'company',
          email: user.email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true }
          },
          metadata: {
            user_id: user.id,
            verification_level: kycVerification.verification_level || 'enhanced'
          }
        });

        // Create account link for onboarding
        accountLink = await stripe.accountLinks.create({
          account: stripeAccount.id,
          refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?stripe_refresh=true`,
          return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?stripe_success=true`,
          type: 'account_onboarding',
        });
      } else {
        // Fallback to mock for development
        stripeAccount = {
          id: `acct_${Date.now()}_${user.id.slice(0, 8)}`,
          object: "account",
          business_type,
          country,
          email: user.email,
          type: "express",
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true }
          },
          requirements: {
            currently_due: [],
            eventually_due: [],
            pending_verification: []
          },
          details_submitted: false,
          charges_enabled: false,
          payouts_enabled: false
        };

        accountLink = {
          object: "account_link",
          created: Math.floor(Date.now() / 1000),
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?stripe_mock=true&account=${stripeAccount.id}`,
          type: "account_onboarding"
        };
      }

      // Update KYC verification with Stripe account ID
      const { error: updateError } = await supabase
        .from("kyc_verifications")
        .update({
          stripe_account_id: stripeAccount.id,
          updated_at: new Date().toISOString()
        })
        .eq("profile_id", user.id);

      if (updateError) {
        console.error("Failed to update KYC with Stripe account:", updateError);
        return NextResponse.json(
          { error: "DATABASE_ERROR", message: "Failed to update verification record" },
          { status: 500 }
        );
      }

      // Update profile with Stripe Connect account ID
      await supabase
        .from("profiles")
        .update({ stripe_connect_account_id: stripeAccount.id })
        .eq("id", user.id);

      // Log activity using audit logger
      await auditLog({
        action: 'stripe_onboarding_started',
        resource: 'stripe_account',
        resourceId: stripeAccount.id,
        userId: user.id,
        metadata: {
          business_type,
          country,
          verification_level: kycVerification.verification_level,
          is_real_stripe: !!stripe,
          onboarding_url: accountLink.url
        }
      });

      return NextResponse.json({
        success: true,
        stripe_account: {
          id: stripeAccount.id,
          business_type: stripeAccount.business_type,
          country: stripeAccount.country,
          details_submitted: stripeAccount.details_submitted || false,
          charges_enabled: stripeAccount.charges_enabled || false,
          payouts_enabled: stripeAccount.payouts_enabled || false
        },
        onboarding_link: {
          url: accountLink.url,
          expires_at: accountLink.expires_at
        },
        message: "Stripe Connect account created. Complete onboarding to enable payments.",
        is_production: !!stripe
      });

    } catch (stripeError) {
      console.error("Stripe account creation error:", stripeError);
      return NextResponse.json(
        { error: "STRIPE_ERROR", message: "Failed to create Stripe Connect account" },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error("Stripe onboarding error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("account_id");

    if (!accountId) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Account ID is required" },
        { status: 400 }
      );
    }

    // Verify the account belongs to the user
    const { data: kycVerification } = await supabase
      .from("kyc_verifications")
      .select("*")
      .eq("profile_id", user.id)
      .eq("stripe_account_id", accountId)
      .single();

    if (!kycVerification) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Stripe account not found" },
        { status: 404 }
      );
    }

    // In a real implementation, this would fetch account details from Stripe
    const mockAccountStatus = {
      id: accountId,
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: true,
      requirements: {
        currently_due: [],
        eventually_due: [],
        pending_verification: []
      },
      capabilities: {
        card_payments: "active",
        transfers: "active"
      },
      onboarding_complete: true
    };

    return NextResponse.json({
      success: true,
      account_status: mockAccountStatus,
      ready_for_payments: mockAccountStatus.charges_enabled && mockAccountStatus.payouts_enabled
    });

  } catch (error) {
    console.error("Stripe account status error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const { account_id, onboarding_complete = false } = body;

    if (!account_id) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Account ID is required" },
        { status: 400 }
      );
    }

    // Verify account belongs to user
    const { data: kycVerification } = await supabase
      .from("kyc_verifications")
      .select("*")
      .eq("profile_id", user.id)
      .eq("stripe_account_id", account_id)
      .single();

    if (!kycVerification) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Stripe account not found" },
        { status: 404 }
      );
    }

    if (onboarding_complete) {
      // Update KYC status to reflect completed onboarding
      await supabase
        .from("kyc_verifications")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("profile_id", user.id);

      // Update profile
      await supabase
        .from("profiles")
        .update({
          kyc_status: "approved",
          verification_level: kycVerification.verification_level
        })
        .eq("id", user.id);

      // Log completion
      await supabase.from("contract_activities").insert({
        contract_id: "00000000-0000-0000-0000-000000000000",
        user_id: user.id,
        activity_type: "stripe_onboarding_completed",
        description: "Stripe Connect onboarding completed successfully",
        metadata: {
          stripe_account_id: account_id,
          verification_level: kycVerification.verification_level
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: onboarding_complete 
        ? "Stripe onboarding completed successfully" 
        : "Account status updated"
    });

  } catch (error) {
    console.error("Stripe onboarding update error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}