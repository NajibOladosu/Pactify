import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import DashboardWrapper from "@/components/dashboard/dashboard-wrapper";

export const metadata = {
  title: "Dashboard | Pactify",
  description: "Manage your contracts, payments, and clients with Pactify",
};

export default async function DashboardPage() {
  const supabase = await createClient();

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

  // 1. Get active subscription
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (subscription?.plan_id) {
    planId = subscription.plan_id;
    // 2. Get plan details
    const { data: planDetails } = await supabase
      .from('subscription_plans')
      .select('max_contracts')
      .eq('id', planId)
      .single();
    maxContracts = planDetails?.max_contracts ?? null; // Use null for unlimited
  } else {
     // Ensure we have the free plan limit if no active sub
     const { data: freePlanDetails } = await supabase
      .from('subscription_plans')
      .select('max_contracts')
      .eq('id', 'free')
      .single();
     maxContracts = freePlanDetails?.max_contracts ?? 3; // Fallback to 3 if DB fetch fails
  }

  // 3. Count active contracts directly
  const { data: contracts, error: contractsError } = await supabase
    .from('contracts')
    .select('id')
    .or(`creator_id.eq.${user.id},client_id.eq.${user.id},freelancer_id.eq.${user.id}`)
    .in('status', ['draft', 'pending_signatures', 'pending_funding', 'active', 'pending_delivery', 'in_review', 'revision_requested', 'pending_completion']);

  if (contractsError) {
    console.error("Dashboard Error: Failed to count active contracts.", contractsError);
    activeContractsCount = 0; // Default to 0 on error
  } else {
    activeContractsCount = contracts?.length ?? 0;
  }

  // 4. Determine if limit is reached (only for plans with a limit)
  const isLimitReached = maxContracts !== null && activeContractsCount >= maxContracts;

  // 5. Fetch recent contracts
  const { data: recentContracts } = await supabase
    .from("contracts")
    .select(`
      id,
      title,
      status,
      created_at
    `)
    .or(`creator_id.eq.${user.id},client_id.eq.${user.id},freelancer_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(5);
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
    />
  );
}
