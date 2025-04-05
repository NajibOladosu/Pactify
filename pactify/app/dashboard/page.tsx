import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { RecentContracts } from "@/components/dashboard/recent-contracts";

export const metadata = {
  title: "Dashboard | Pactify",
  description: "Manage your contracts, payments, and clients with Pactify",
};

export default async function DashboardPage() {
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
  const availableContracts = profile?.available_contracts || 3;

  // Get time of day for greeting
  const hour = new Date().getHours();
  let greeting = "Good morning";
  if (hour >= 12 && hour < 18) greeting = "Good afternoon";
  if (hour >= 18) greeting = "Good evening";

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start flex-col sm:flex-row gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">{greeting}, {displayName}!</h1>
          <p className="text-muted-foreground mt-1">Here's what's happening with your contracts today.</p>
        </div>
        <Button size="sm" asChild>
          <Link href="/dashboard/contracts/new">
            <PlusIcon className="mr-2 h-4 w-4" />
            New Contract
          </Link>
        </Button>
      </div>

      {/* Quick Stats */}
      <DashboardStats userType={userType} availableContracts={availableContracts} />

      {/* Main content section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent contracts */}
        <div className="lg:col-span-2">
          <RecentContracts />
        </div>

        {/* Get started cards */}
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>Complete these steps to set up your account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-success/20 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-1">Create your account</h4>
                  <p className="text-xs text-muted-foreground">You've successfully created your account.</p>
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-background flex items-center justify-center border">
                  <span className="text-sm font-medium">2</span>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-1">Complete your profile</h4>
                  <p className="text-xs text-muted-foreground mb-2">Add your business details and contact information.</p>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/dashboard/settings">
                      Complete profile
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-background flex items-center justify-center border">
                  <span className="text-sm font-medium">3</span>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-1">Create your first contract</h4>
                  <p className="text-xs text-muted-foreground mb-2">Select a template or create a custom contract.</p>
                  <Button size="sm" asChild>
                    <Link href="/dashboard/contracts/new">
                      Create contract
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
