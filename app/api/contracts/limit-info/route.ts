import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: getUserError,
    } = await supabase.auth.getUser();

    if (getUserError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch contract limit info using the new function
    const { data: limitInfo, error: limitError } = await supabase
      .rpc('get_user_contract_limit_info', { p_user_id: user.id });

    if (limitError) {
      console.error("Error fetching contract limit info:", limitError);
      return NextResponse.json(
        { error: "Failed to fetch contract limit info" },
        { status: 500 }
      );
    }

    const info = limitInfo?.[0];
    if (!info) {
      return NextResponse.json(
        { error: "No contract limit info found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      subscriptionTier: info.subscription_tier,
      totalContracts: info.total_contracts,
      visibleContracts: info.visible_contracts,
      hiddenContracts: info.hidden_contracts,
      contractLimit: info.contract_limit,
    });
  } catch (error) {
    console.error("Unexpected error in contract limit info API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}