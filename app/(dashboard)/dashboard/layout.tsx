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

  // Fetch user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const userType = profile?.user_type || user.user_metadata?.user_type || "both";
  const displayName = profile?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0];
  const userInitial = (displayName || "U")[0].toUpperCase();

  return (
    <DashboardLayoutWrapper
      userType={userType}
      displayName={displayName}
      userInitial={userInitial}
      userId={user.id}
    >
      {children}
    </DashboardLayoutWrapper>
  );
}
