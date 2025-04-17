import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { DashboardLayoutWrapper } from "@/components/dashboard/layout-wrapper";

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
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*, subscription_tier") // Ensure subscription_tier is selected
    .eq("id", user.id)
    .single();

  // Handle potential error fetching profile
  if (profileError && profileError.code !== 'PGRST116') { // Ignore 'No rows found' error
    console.error("Error fetching profile in layout:", profileError);
    // Redirect or show error? For now, proceed cautiously.
  }
  if (!profile) {
     // This case should ideally not happen if user exists, but handle defensively
     console.warn(`Profile not found for user ${user.id} in layout.`);
     // Maybe redirect to a setup page or use defaults?
     return redirect("/sign-in"); // Or handle differently
  }

  const userType = profile.user_type || "both";
  const displayName = profile.display_name || user.email?.split('@')[0] || "User";
  const userInitial = displayName[0].toUpperCase();
  // Get the subscription tier from the profile, default to 'free' if somehow missing
  const currentPlan = profile.subscription_tier || "free";

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
