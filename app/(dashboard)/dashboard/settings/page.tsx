import { createClient } from "@/utils/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redirect } from "next/navigation";
import { UserIcon, BellIcon, ShieldIcon, GlobeIcon, ShieldCheckIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from 'date-fns';
import { ProfileUpdateForm } from "@/components/profile/profile-update-form";
import { KYCDashboardSection } from "@/components/kyc/kyc-dashboard-section";
import EmailNotificationSettings from "@/components/dashboard/email-notification-settings";

export const metadata = {
  title: "Settings | Pactify",
  description: "Manage your account settings and profile",
};

// Force dynamic rendering to ensure fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0; // Never cache this page

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  // Fetch user profile using secure function that bypasses RLS issues
  const { data: profileResult, error: profileError } = await supabase
    .rpc('get_user_profile', { p_user_id: user.id });

  let profile = null;
  if (profileResult?.success) {
    profile = profileResult.profile;
  } else if (profileError) {
    console.error("Error fetching profile:", profileError);
  }
  
  console.log("Profile data loaded in settings:", profile?.display_name, profile?.updated_at);


  // Fetch KYC verification data
  const { data: kycVerification } = await supabase
    .from("kyc_verifications")
    .select("*")
    .eq("profile_id", user.id)
    .single();

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
          <TabsTrigger value="verification" className="flex items-center gap-2">
            <ShieldCheckIcon className="h-4 w-4" />
            <span>Verification</span>
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
                </div>
                <div>
                  <Button variant="outline">Change Avatar</Button>
                </div>
              </div>

              <ProfileUpdateForm 
                user={{
                  id: user.id,
                  email: user.email || null
                }}
                profile={{
                  display_name: profile?.display_name || null,
                  company_name: profile?.company_name || null,
                  website: profile?.website || null,
                  bio: profile?.bio || null
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Verification Tab */}
        <TabsContent value="verification">
          <div>
            <h2 className="text-2xl font-semibold mb-2">Payment Account Verification</h2>
            <p className="text-muted-foreground mb-6">
              Set up and verify your payment account to receive funds from completed contracts securely.
            </p>
            <KYCDashboardSection 
              userType={profile?.user_type || 'both'} 
            />
          </div>
        </TabsContent>



        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <EmailNotificationSettings userId={user.id} />
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
