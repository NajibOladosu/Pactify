import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import OnboardingWizard from "@/components/onboarding/onboarding-wizard";

export default async function OnboardingPage() {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  // Get user profile to check onboarding status
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // If user is already onboarded, redirect to dashboard
  if (profile?.onboarding_completed) {
    return redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Welcome to Pactify! 🎉
            </h1>
            <p className="text-lg text-gray-600">
              Let's get your account set up so you can start creating contracts and managing payments.
            </p>
          </div>
          
          <OnboardingWizard user={user} profile={profile} />
        </div>
      </div>
    </div>
  );
}