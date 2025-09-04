import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default async function OnboardingCompletePage() {
  const supabase = await createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/sign-in');
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle className="text-xl">Verification Complete!</CardTitle>
          <CardDescription>
            Your payment account has been set up successfully
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
            <p className="text-sm text-green-700 dark:text-green-300">
              🎉 Your Stripe Connect account is now being verified. You&apos;ll be able to receive payments once the verification process is complete (usually within a few minutes).
            </p>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-foreground">What happens next?</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Your account information will be verified by Stripe</li>
              <li>• You&apos;ll receive email updates on your verification status</li>
              <li>• Once approved, you can receive payments from completed contracts</li>
            </ul>
          </div>

          <div className="pt-4">
            <Link href="/dashboard">
              <Button className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Return to Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}