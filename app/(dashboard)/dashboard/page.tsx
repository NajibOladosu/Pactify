import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { redirect } from "next/navigation";
import DashboardWrapper from "@/components/dashboard/dashboard-wrapper";

export const metadata = {
  title: "Dashboard | Pactify",
  description: "Manage your contracts, payments, and clients with Pactify",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  
  // Create service role client for bypassing RLS when needed
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const userType = profile?.user_type || user.user_metadata?.user_type || "both";
  const displayName = profile?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0];
  // const availableContracts = profile?.available_contracts || 3; // We will fetch this dynamically now

  // --- Fetch Subscription and Contract Data ---
  let planId = 'free';
  let maxContracts: number | null = 3; // Default to free plan limit
  let activeContractsCount = 0;

  // 1. Get active subscription using service role client
  const { data: subscription } = await serviceSupabase
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (subscription?.plan_id) {
    planId = subscription.plan_id;
    // 2. Get plan details using service role client
    const { data: planDetails } = await serviceSupabase
      .from('subscription_plans')
      .select('max_contracts')
      .eq('id', planId)
      .single();
    maxContracts = planDetails?.max_contracts ?? null; // Use null for unlimited
  } else {
     // Ensure we have the free plan limit if no active sub
     const { data: freePlanDetails } = await serviceSupabase
      .from('subscription_plans')
      .select('max_contracts')
      .eq('id', 'free')
      .single();
     maxContracts = freePlanDetails?.max_contracts ?? 3; // Fallback to 3 if DB fetch fails
  }

  // 3. Count active contracts using security definer function
  const { data: contractCountResult, error: contractsError } = await supabase
    .rpc('get_user_contract_count', { p_user_id: user.id });

  if (contractsError) {
    console.error("Dashboard Error: Failed to count active contracts.", contractsError);
    activeContractsCount = 0; // Default to 0 on error
  } else {
    activeContractsCount = contractCountResult ?? 0;
  }

  // 4. Determine if limit is reached (only for plans with a limit)
  const isLimitReached = maxContracts !== null && activeContractsCount >= maxContracts;

  // 5. Fetch recent contracts and detailed statistics
  const [contractsResult, statsResult] = await Promise.all([
    supabase.rpc('get_user_contracts', { p_user_id: user.id }),
    supabase.rpc('get_user_dashboard_stats', { p_user_id: user.id })
  ]);
  
  // Get the 5 most recent contracts (they're already ordered by created_at DESC in the function)
  const recentContracts = contractsResult.data?.slice(0, 5).map((contract: any) => ({
    id: contract.id,
    title: contract.title,
    status: contract.status,
    created_at: contract.created_at
  })) || [];

  // Parse dashboard statistics
  const dashboardStats = statsResult.data || {
    total_contracts: 0,
    active_contracts: 0,
    pending_signatures: 0,
    completed_contracts: 0,
    cancelled_contracts: 0,
    pending_payments: 0,
    total_revenue: 0,
    avg_contract_value: 0
  };
  // --- End Fetch ---


  // Get time of day for greeting
  const hour = new Date().getHours();
  let greeting = "Good morning";
  if (hour >= 12 && hour < 18) greeting = "Good afternoon";
  if (hour >= 18) greeting = "Good evening";

  return (
    <DashboardWrapper
      displayName={displayName}
      userType={userType}
      userId={user.id}
      activeContractsCount={activeContractsCount}
      maxContracts={maxContracts}
      isLimitReached={isLimitReached}
      greeting={greeting}
      recentContracts={recentContracts || []}
      dashboardStats={dashboardStats}
    />
  );
}
