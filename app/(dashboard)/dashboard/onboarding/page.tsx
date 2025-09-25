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

  // Get user profile to check onboarding status (force fresh data)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .order('updated_at', { ascending: false }) // Force fresh query
    .single();

  console.log('Onboarding page - profile check:', {
    userId: user.id,
    profileExists: !!profile,
    onboardingCompleted: profile?.onboarding_completed,
    profileError: profileError?.message,
    profileData: profile
  });

  // If user is already onboarded, redirect to dashboard
  if (profile?.onboarding_completed === true) {
    console.log('User already onboarded, redirecting to dashboard');
    return redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary-50 to-accent-50 dark:from-background dark:via-primary-900/10 dark:to-accent-900/10">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-gradient-to-br from-primary-500/20 to-accent-500/20 blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-gradient-to-tr from-secondary-500/20 to-primary-500/20 blur-3xl"></div>
      </div>
      
      <div className="relative container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Hero Header */}
          <div className="text-center mb-12">
            <div className="mb-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-primary-500 to-accent-500 rounded-2xl flex items-center justify-center shadow-lg">
                <span className="text-2xl">🎉</span>
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-serif font-bold leading-tight mb-4">
              Welcome to <span className="text-primary-500">Pactify</span>!
            </h1>
            <p className="text-xl text-foreground/80 max-w-2xl mx-auto">
              Let's personalize your experience so you can start creating contracts and managing secure payments with confidence.
            </p>
          </div>
          
          <OnboardingWizard user={user} profile={profile} />
        </div>
      </div>
    </div>
  );
}