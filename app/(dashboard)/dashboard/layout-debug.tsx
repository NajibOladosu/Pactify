import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { DashboardLayoutWrapper } from "@/components/dashboard/layout-wrapper";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Get user with more detailed error handling
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  console.log("Dashboard Layout - User:", user?.id, user?.email);
  console.log("Dashboard Layout - User Error:", userError);

  if (!user || userError) {
    console.log("No user or user error, redirecting to sign-in");
    return redirect("/sign-in");
  }

  // Add a small delay to ensure session is fully established
  await new Promise(resolve => setTimeout(resolve, 100));

  // Fetch user profile with more detailed error handling
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  console.log("Dashboard Layout - Profile:", profile);
  console.log("Dashboard Layout - Profile Error:", profileError);

  // Handle profile error more gracefully
  if (profileError) {
    console.error("Error fetching profile in layout:", profileError);
    
    // If it's a "no rows" error, try to create the profile
    if (profileError.code === 'PGRST116') {
      console.log("No profile found, attempting to create one");
      
      const { data: newProfile, error: createError } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || "User",
          user_type: user.user_metadata?.user_type || "both",
          subscription_tier: "free",
          available_contracts: 3
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating profile:", createError);
        return redirect("/sign-in");
      }

      console.log("Created new profile:", newProfile);
      // Use the newly created profile
      const profile = newProfile;
    } else {
      // Other types of errors - redirect to sign in
      return redirect("/sign-in");
    }
  }

  if (!profile) {
    console.warn(`Profile still not found for user ${user.id} after attempted creation`);
    return redirect("/sign-in");
  }

  const userType = profile.user_type || "both";
  const displayName = profile.display_name || user.email?.split('@')[0] || "User";
  const userInitial = displayName[0].toUpperCase();
  const currentPlan = profile.subscription_tier || "free";

  console.log("Dashboard Layout - Final profile data:", {
    userType,
    displayName,
    userInitial,
    currentPlan
  });

  return (
    <DashboardLayoutWrapper
      userType={userType}
      displayName={displayName}
      userInitial={userInitial}
      userId={user.id}
      currentPlan={currentPlan}
    >
      {children}
    </DashboardLayoutWrapper>
  );
}