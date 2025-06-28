import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { DashboardLayoutWrapper } from "@/components/dashboard/layout-wrapper";
import { ensureUserProfile, linkUserContracts } from "@/utils/profile-helpers";

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

  // Fetch user profile including subscription tier
  const profileResult = await supabase
    .from("profiles")
    .select("*, subscription_tier") // Ensure subscription_tier is selected
    .eq("id", user.id)
    .single();

  let profile = profileResult.data;
  const profileError = profileResult.error;

  // Handle potential error fetching profile
  if (profileError) {
    console.error("Error fetching profile in layout:", profileError);
    
    // If no profile found, try to create one using the helper
    if (profileError.code === 'PGRST116') {
      console.log("No profile found for user:", user.id, "attempting to create one");
      
      try {
        profile = await ensureUserProfile(user.id);
        console.log("Profile retrieved/created successfully for user:", user.id);
      } catch (helperError) {
        console.error("Profile helper failed:", helperError);
        return redirect("/sign-in?error=profile_creation_failed&user_id=" + user.id);
      }
    } else {
      // Other database errors
      console.error("Database error fetching profile:", profileError);
      return redirect("/sign-in?error=database_error");
    }
  }

  if (!profile) {
    console.warn(`Profile still not found for user ${user.id} after error handling.`);
    return redirect("/sign-in?error=profile_missing");
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
