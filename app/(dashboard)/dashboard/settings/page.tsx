import { createClient } from "@/utils/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redirect } from "next/navigation";
import { UserIcon, CreditCardIcon, BellIcon, ShieldIcon, GlobeIcon, CheckCircleIcon } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from 'date-fns';
import { updateUserProfile } from "@/app/actions"; // Import the server action

export const metadata = {
  title: "Settings | Pactify",
  description: "Manage your account settings and profile",
};

export default async function SettingsPage() {
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

  // Fetch user subscription
  const { data: subscription } = await supabase
    .from("user_subscriptions")
    .select(`
      *,
      subscription_plans (
        id,
        name,
        description,
        features
      )
    `)
    .eq("user_id", user.id)
    .in("status", ["active", "trialing", "past_due"]) // Fetch active, trialing, or past_due subscriptions
    .maybeSingle(); // Use maybeSingle as user might not have a subscription

  const userType = profile?.user_type || user.user_metadata?.user_type || "both";
  const displayName = profile?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0];

  // Helper function to format dates
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'PPP'); // e.g., Jun 20, 2024
    } catch (error) {
      console.error("Error formatting date:", error);
      return 'Invalid Date';
    }
  };

  // Helper function to parse features JSON
  const parseFeatures = (featuresJson: any) => {
    try {
      if (typeof featuresJson === 'string') {
        const parsed = JSON.parse(featuresJson);
        return parsed?.features || [];
      }
      if (typeof featuresJson === 'object' && featuresJson !== null && Array.isArray(featuresJson.features)) {
        return featuresJson.features;
      }
      return [];
    } catch (error) {
      console.error("Error parsing features JSON:", error);
      return [];
    }
  };

  const currentPlan = subscription?.subscription_plans;
  const currentPlanFeatures = currentPlan ? parseFeatures(currentPlan.features) : [];
  const isFreeTier = !subscription || currentPlan?.id === 'free'; // Consider no subscription as free tier for display

  // Determine subscription content before return
  let subscriptionContent;
  if (currentPlan && !isFreeTier) {
    // User has an active paid subscription
    subscriptionContent = (
      <div className="p-4 border rounded-md bg-muted/30">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-lg">{currentPlan.name} Plan</h3>
              <Badge variant={subscription.status === 'active' || subscription.status === 'trialing' ? 'default' : 'destructive'}>
                {subscription.status === 'trialing' ? 'Trialing' : subscription.status === 'past_due' ? 'Past Due' : 'Active'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{currentPlan.description}</p>
          </div>
          {/* Add Price Display if available in subscription_plans */}
        </div>

        <div className="mt-4 pt-4 border-t space-y-2 text-sm">
          <p>
            Current Period: {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)}
          </p>
          {subscription.cancel_at_period_end && (
            <p className="text-destructive">
              Your subscription will be cancelled at the end of the current period ({formatDate(subscription.current_period_end)}).
            </p>
          )}
           {subscription.status === 'trialing' && (
            <p className="text-primary-500">
              Your trial ends on {formatDate(subscription.current_period_end)}.
            </p>
          )}
           {subscription.status === 'past_due' && (
            <p className="text-destructive">
              Your payment is past due. Please update your payment method.
            </p>
          )}
        </div>

        <div className="mt-4 pt-4 border-t">
          <h4 className="font-medium mb-2">Plan Features:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
            {currentPlanFeatures.length > 0 ? (
              currentPlanFeatures.map((feature: string, index: number) => (
                <div key={index} className="flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4 text-primary-500 flex-shrink-0" />
                  <span>{feature}</span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No specific features listed.</p>
            )}
          </div>
        </div>
        {/* Placeholder for Manage Billing Button (Phase 2) */}
        <div className="mt-6 flex justify-end">
           <Button variant="outline" disabled>Manage Billing (Coming Soon)</Button>
        </div>
      </div>
    );
  } else {
    // User is on Free Tier or has no subscription
    subscriptionContent = (
      <>
        <div className="p-4 border rounded-md bg-muted/30">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-lg">Free Plan</h3>
                <Badge>Current Plan</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Basic features for individuals just getting started</p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">$0</span>
              <span className="text-muted-foreground">/month</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
               <div className="flex items-center gap-2">
                 <CheckCircleIcon className="h-4 w-4 text-primary-500" />
                 <span>Up to 3 contracts</span>
               </div>
               <div className="flex items-center gap-2">
                 <CheckCircleIcon className="h-4 w-4 text-primary-500" />
                 <span>Basic contract templates</span>
               </div>
               <div className="flex items-center gap-2">
                 <CheckCircleIcon className="h-4 w-4 text-primary-500" />
                 <span>10% escrow fee</span>
               </div>
            </div> {/* Close Grid */}
          </div> {/* Close Features container */}
        </div> {/* Close Free plan block */}

        {/* Upgrade Section */}
        <div className="space-y-4 pt-6 border-t">
          <h3 className="font-medium text-lg">Upgrade Your Plan</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Professional Plan Card */}
            <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Professional</CardTitle>
                  <CardDescription className="mt-1">For growing freelance businesses</CardDescription>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">$19.99</span> {/* TODO: Fetch dynamically */}
                  <span className="text-muted-foreground">/mo</span> {/* TODO: Add yearly toggle */}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                {/* TODO: Fetch features dynamically */}
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4 text-primary-500" />
                  <span>Unlimited contracts</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4 text-primary-500" />
                  <span>All professional templates</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4 text-primary-500" />
                  <span>7.5% escrow fee</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4 text-primary-500" />
                  <span>Basic custom branding</span>
                </div>
              </div>
              <Button asChild className="w-full">
                <Link href="/checkout/professional">Upgrade to Professional</Link>
              </Button>
            </CardContent>
          </Card>

          {/* Business Plan Card */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Business</CardTitle>
                  <CardDescription className="mt-1">For established freelance businesses</CardDescription>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">$49.99</span> {/* TODO: Fetch dynamically */}
                  <span className="text-muted-foreground">/mo</span> {/* TODO: Add yearly toggle */}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                {/* TODO: Fetch features dynamically */}
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4 text-primary-500" />
                  <span>All Professional features</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4 text-primary-500" />
                  <span>Team collaboration (up to 5)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4 text-primary-500" />
                  <span>5% escrow fee</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4 text-primary-500" />
                  <span>Full white-labeling</span>
                </div>
              </div>
               <Button asChild variant="outline" className="w-full">
                 <Link href="/checkout/business">Upgrade to Business</Link>
               </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      </>
    );
  }


  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold">Account Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your profile and preferences.</p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="mb-8">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <UserIcon className="h-4 w-4" />
            <span>Profile</span>
          </TabsTrigger>
          <TabsTrigger value="subscription" className="flex items-center gap-2">
            <CreditCardIcon className="h-4 w-4" />
            <span>Subscription</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <BellIcon className="h-4 w-4" />
            <span>Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <ShieldIcon className="h-4 w-4" />
            <span>Security</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>
                Update your personal information and how others see you on the platform.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 pb-6 border-b">
                <div className="h-24 w-24 bg-primary-500 rounded-full flex items-center justify-center text-white text-2xl font-medium flex-shrink-0">
                  {(displayName || "U")[0].toUpperCase()}
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-lg">{displayName}</h3>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <p className="text-sm mt-1">
                    <Badge>{userType === 'both' ? 'Freelancer & Client' : userType === 'freelancer' ? 'Freelancer' : 'Client'}</Badge>
                  </p>
                </div>
                <div>
                  <Button variant="outline">Change Avatar</Button>
                </div>
              </div>

              {/* Add action attribute and name attributes to inputs */}
              <form action={updateUserProfile} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="display_name">Full Name</Label>
                    <Input
                      id="display_name"
                      name="display_name" // Add name attribute
                      defaultValue={displayName}
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      defaultValue={user.email}
                      disabled
                    />
                    <p className="text-xs text-muted-foreground mt-1">Email address cannot be changed</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="company">Company Name</Label>
                    <Input
                      id="company"
                      name="company_name" // Add name attribute
                      defaultValue={profile?.company_name || ''}
                      placeholder="Your company name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      name="website" // Add name attribute
                      defaultValue={profile?.website || ''}
                      placeholder="https://your-website.com"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="bio">Bio</Label>
                  <textarea
                    id="bio"
                    name="bio" // Add name attribute
                    className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    defaultValue={profile?.bio || ''}
                    placeholder="Tell others about yourself or your business..."
                  />
                </div>

                <div className="flex justify-end">
                  <Button type="submit">Save Changes</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Subscription Plan</CardTitle>
              <CardDescription>
                Manage your subscription and billing information.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {subscriptionContent} {/* Render the determined content */}
            </CardContent>
          </Card>
        </TabsContent>


        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Choose how and when you want to be notified.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-medium">Email Notifications</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <h4 className="font-medium text-sm">Contract Updates</h4>
                        <p className="text-xs text-muted-foreground">Notify when a contract is viewed, signed, or updated</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" value="" className="sr-only peer" defaultChecked />
                        <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-muted after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <h4 className="font-medium text-sm">Payment Notifications</h4>
                        <p className="text-xs text-muted-foreground">Notify about escrow deposits, releases, and refunds</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" value="" className="sr-only peer" defaultChecked />
                        <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-muted after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <h4 className="font-medium text-sm">Marketing Communications</h4>
                        <p className="text-xs text-muted-foreground">Updates about new features, tips, and promotions</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" value="" className="sr-only peer" />
                        <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-muted after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button>Save Preferences</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Manage your account security and authentication methods.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="font-medium">Change Password</h3>
                <form className="space-y-4">
                  <div>
                    <Label htmlFor="current_password">Current Password</Label>
                    <Input id="current_password" type="password" />
                  </div>
                  <div>
                    <Label htmlFor="new_password">New Password</Label>
                    <Input id="new_password" type="password" />
                  </div>
                  <div>
                    <Label htmlFor="confirm_password">Confirm New Password</Label>
                    <Input id="confirm_password" type="password" />
                  </div>
                  <Button type="submit">Update Password</Button>
                </form>
              </div>

              <div className="pt-6 border-t space-y-4">
                <h3 className="font-medium">Two-Factor Authentication</h3>
                <div className="bg-muted/30 p-4 rounded-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Two-factor authentication is not enabled yet.</p>
                      <p className="text-xs text-muted-foreground mt-1">Add an extra layer of security to your account.</p>
                    </div>
                    <Button variant="outline">Enable 2FA</Button>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t space-y-4">
                <h3 className="font-medium">Connected Accounts</h3>
                <div className="bg-muted/30 p-4 rounded-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <GlobeIcon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">Google Account</p>
                        <p className="text-xs text-muted-foreground mt-1">Connect your Google account for easier login.</p>
                      </div>
                    </div>
                    <Button variant="outline">Connect</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
