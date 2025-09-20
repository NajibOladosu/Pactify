import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowLeft, FileText } from 'lucide-react';
import Link from 'next/link';

export default async function EnhancedKYCCompletePage() {
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
          <CardTitle className="text-xl">Identity Verification Submitted!</CardTitle>
          <CardDescription>
            Your documents have been submitted for enhanced verification
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                  Documents Successfully Uploaded
                </p>
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  Your identity documents are being reviewed by Stripe. This process usually takes just a few minutes, but can take up to 24 hours in some cases.
                </p>
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-foreground">What happens next?</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Your identity documents will be securely verified by Stripe</li>
              <li>• You&apos;ll receive email updates on your verification status</li>
              <li>• Once verified, you can process transactions over $100</li>
              <li>• Check your verification status in Settings → Verification</li>
            </ul>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                  Enhanced Security Active
                </p>
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                  Enhanced verification helps protect both you and your clients by ensuring secure high-value transactions.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 space-y-2">
            <Link href="/dashboard/settings?tab=verification">
              <Button className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Check Verification Status
              </Button>
            </Link>
            
            <Link href="/dashboard">
              <Button variant="outline" className="w-full">
                Return to Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}