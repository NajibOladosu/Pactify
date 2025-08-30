import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { redirect } from "next/navigation";
import EnhancedContractWizard from "@/components/contracts/enhanced-contract-wizard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { LockIcon, CrownIcon } from "lucide-react";

export default async function NewContractPage() {
  const supabase = await createClient();
  
  // Create service role client for bypassing RLS when needed
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!
  );

  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user) {
    return redirect("/sign-in");
  }

  // --- Fetch Subscription and Contract Limit Data ---
  let planId = 'free';
  let maxContracts: number | null = 3; // Default to free plan limit
  let activeContractsCount = 0;

  // 1. Get active subscription using service role client
  const { data: subscription } = await serviceSupabase
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (subscription?.plan_id) {
    planId = subscription.plan_id;
    // 2. Get plan details using service role client
    const { data: planDetails } = await serviceSupabase
      .from('subscription_plans')
      .select('max_contracts')
      .eq('id', planId)
      .single();
    maxContracts = planDetails?.max_contracts ?? null; // Use null for unlimited
  } else {
     // Ensure we have the free plan limit if no active sub
     const { data: freePlanDetails } = await serviceSupabase
      .from('subscription_plans')
      .select('max_contracts')
      .eq('id', 'free')
      .single();
     maxContracts = freePlanDetails?.max_contracts ?? 3; // Fallback to 3 if DB fetch fails
  }

  // 3. Get active contracts count for limit checking
  const { data: dashboardStats } = await serviceSupabase.rpc('get_dashboard_stats', { p_user_id: user.id });
  activeContractsCount = dashboardStats?.[0]?.active_contracts || 0;

  // 4. Determine if limit is reached (only for plans with a limit)
  const isLimitReached = maxContracts !== null && activeContractsCount >= maxContracts;

  // 5. If limit is reached, show upgrade page instead of contract wizard
  if (isLimitReached) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
              <LockIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">Contract Limit Reached</CardTitle>
            <CardDescription>
              You've reached your plan's contract limit of {maxContracts} active contracts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <span className="font-medium">Current Usage</span>
              </div>
              <p className="text-sm text-muted-foreground ml-5">
                {activeContractsCount} of {maxContracts} contracts active
              </p>
            </div>
            
            <div className="space-y-3">
              <h3 className="font-medium">What you can do:</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <span>Complete or cancel existing contracts to free up slots</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <span>Upgrade to Professional or Business plan for more contracts</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button asChild className="flex-1">
                <Link href="/dashboard/subscription">
                  <CrownIcon className="mr-2 h-4 w-4" />
                  Upgrade Plan
                </Link>
              </Button>
              <Button variant="outline" asChild className="flex-1">
                <Link href="/dashboard/contracts">
                  View Contracts
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If limit is not reached, show the contract wizard
  return <EnhancedContractWizard />;
}
