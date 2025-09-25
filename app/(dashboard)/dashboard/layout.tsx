import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DashboardLayoutWrapper } from "@/components/dashboard/layout-wrapper";
import { ensureUserProfile, linkUserContracts } from "@/utils/profile-helpers";

// Force dynamic rendering to ensure fresh profile data
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  // Fetch user profile using secure function that bypasses RLS issues
  const { data: profileResult, error: profileError } = await supabase
    .rpc('get_user_profile', { p_user_id: user.id });

  let profile = null;
  if (profileResult?.success) {
    profile = profileResult.profile;
  }

  // Handle potential error fetching profile
  if (profileError) {
    console.error("Error fetching profile in layout:", profileError);
    return redirect("/sign-in?error=database_error");
  }
  
  // If no profile found, try to create one using the helper
  if (!profile) {
    console.log("No profile found for user:", user.id, "attempting to create one");
    
    try {
      profile = await ensureUserProfile(user.id);
      console.log("Profile retrieved/created successfully for user:", user.id);
    } catch (helperError) {
      console.error("Profile helper failed:", helperError);
      return redirect("/sign-in?error=profile_creation_failed&user_id=" + user.id);
    }
  }

  if (!profile) {
    console.warn(`Profile still not found for user ${user.id} after error handling.`);
    return redirect("/sign-in?error=profile_missing");
  }

  // Check if user needs to complete onboarding
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || '';
  const searchParams = headersList.get('x-search-params') || '';
  
  console.log('Dashboard layout check:', {
    userId: user.id,
    pathname,
    searchParams,
    onboardingCompleted: profile.onboarding_completed,
    profileExists: !!profile
  });
  
  // Only redirect to onboarding if user hasn't completed it AND they're not already on onboarding page AND not coming from welcome redirect
  // Now that onboarding_completed column exists, use it properly
  const needsOnboarding = !profile.onboarding_completed;
  if (needsOnboarding && !pathname.includes('/onboarding') && !searchParams.includes('welcome=true')) {
    console.log('Redirecting to onboarding:', { pathname, onboardingCompleted: profile.onboarding_completed });
    return redirect("/dashboard/onboarding");
  }

  const userType = profile.user_type || "both";
  const displayName = profile.display_name || user.email?.split('@')[0] || "User";
  const userInitial = displayName[0].toUpperCase();
  // Get the subscription tier from the profile, default to 'free' if somehow missing
  const currentPlan = profile.subscription_tier || "free";

  // Link any contracts waiting for this user (for existing users)
  // This is safe to call multiple times as it only links unlinked contracts
  if (user.email) {
    await linkUserContracts(user.id, user.email);
  }

  return (
    <DashboardLayoutWrapper
      userType={userType}
      displayName={displayName}
      userInitial={userInitial}
      userId={user.id}
      currentPlan={currentPlan} // Pass the fetched plan
    >
      {children}
    </DashboardLayoutWrapper>
  );
}
