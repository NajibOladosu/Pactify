// Optimized dashboard layout with reduced database calls and caching
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { DashboardLayoutWrapper } from "@/components/dashboard/layout-wrapper";
import { getOptimizedUserProfile, warmupUserCaches } from "@/utils/optimized-profile-helpers";
import { Suspense } from 'react';

export default async function OptimizedDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Single auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  // Get all user data in a single optimized call
  let profile;
  try {
    profile = await getOptimizedUserProfile(user.id);
    
    // Warm up additional caches in the background (don't await)
    warmupUserCaches(user.id);
  } catch (error) {
    console.error("Error getting optimized profile:", error);
    return redirect("/sign-in?error=profile_error");
  }

  const userType = profile.user_type || "both";
  const displayName = profile.display_name || user.email?.split('@')[0] || "User";
  const userInitial = displayName[0].toUpperCase();
  const currentPlan = profile.subscription_tier || "free";

  return (
    <DashboardLayoutWrapper
      userType={userType}
      displayName={displayName}
      userInitial={userInitial}
      userId={user.id}
      currentPlan={currentPlan}
      // Pass additional optimized data
      hasEnhancedKyc={profile.has_enhanced_kyc}
      contractCount={profile.contract_count}
      availableBalance={profile.available_balance_usd}
    >
      <Suspense fallback={<div className="animate-pulse">Loading...</div>}>
        {children}
      </Suspense>
    </DashboardLayoutWrapper>
  );
}