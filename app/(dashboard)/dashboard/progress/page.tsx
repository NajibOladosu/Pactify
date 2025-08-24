import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import ProgressTrackingDashboard from "@/components/dashboard/progress-tracking-dashboard";

export const metadata = {
  title: "Progress Tracking | Pactify",
  description: "Track your contract progress and performance metrics",
};

export default async function ProgressPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  // Fetch user profile for user type
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .single();

  const userType = profile?.user_type || "both";


  return (
    <div className="space-y-8">
      <ProgressTrackingDashboard userId={user.id} userType={userType} />
    </div>
  );
}