import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default async function OnboardingRefreshPage() {
  const supabase = await createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/sign-in');
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle className="text-xl">Session Expired</CardTitle>
          <CardDescription>
            Your onboarding session has expired. Let&apos;s continue where you left off.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
            <p className="text-sm text-orange-700 dark:text-orange-300">
              Don&apos;t worry! Your progress has been saved. Click the button below to continue your account verification.
            </p>
          </div>

          <div className="space-y-4">
            <form action="/api/connect/onboarding-link" method="POST">
              <Button type="submit" className="w-full">
                <RefreshCw className="w-4 h-4 mr-2" />
                Continue Verification
              </Button>
            </form>
            
            <Link href="/dashboard">
              <Button variant="outline" className="w-full">
                Return to Dashboard
              </Button>
            </Link>
          </div>

          <div className="text-xs text-muted-foreground text-center">
            If you continue to experience issues, please contact support.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}