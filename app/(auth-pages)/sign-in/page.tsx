import { signInAction, signInWithGoogleAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

export default async function Login(props: {
  searchParams: Promise<Message & { error?: string }>;
}) {
  const searchParams = await props.searchParams;
  
  // Handle specific error messages from dashboard redirect
  let errorMessage = "";
  if ((searchParams as any).error === "profile_creation_failed") {
    errorMessage = "There was an issue setting up your profile. Please try signing in again.";
  } else if ((searchParams as any).error === "database_error") {
    errorMessage = "Database connection issue. Please try again in a moment.";
  } else if ((searchParams as any).error === "profile_missing") {
    errorMessage = "Profile setup incomplete. Please contact support if this persists.";
  }
  
  if ("message" in searchParams || errorMessage) {
    return (
      <div className="flex flex-col items-center justify-center text-center">
        {errorMessage ? (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800 text-sm">{errorMessage}</p>
          </div>
        ) : (
          <FormMessage message={searchParams} />
        )}
      </div>
    );
  }

  return (
    <>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Welcome back to Pactify</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to manage your contracts and payments
        </p>
      </div>
      
      <form action={signInAction} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input 
            id="email"
            name="email" 
            type="email"
            placeholder="you@example.com" 
            autoComplete="email"
            required 
          />
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              className="text-xs text-primary-500 hover:underline"
              href="/forgot-password"
            >
              Forgot Password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            name="password"
            placeholder="Enter your password"
            autoComplete="current-password"
            required
          />
        </div>
        
        <div className="space-y-4">
          <SubmitButton className="w-full" pendingText="Signing In...">
            Sign In
          </SubmitButton>
          
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link className="text-primary-500 hover:underline font-medium" href="/sign-up">
                Sign up
              </Link>
            </p>
          </div>
        </div>
        
        <FormMessage message={searchParams} />
      </form>
      
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t"></span>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
        </div>
      </div>
      
      <form action={signInWithGoogleAction}>
        <Button variant="outline" className="w-full" type="submit">
          <svg viewBox="0 0 24 24" className="h-5 w-5 mr-2" aria-hidden="true">
            <path d="M12.0003 4.75C13.7703 4.75 15.3553 5.36002 16.6053 6.54998L20.0303 3.125C17.9502 1.19 15.2353 0 12.0003 0C7.31028 0 3.25527 2.69 1.28027 6.60998L5.27028 9.70498C6.21525 6.86002 8.87028 4.75 12.0003 4.75Z" fill="#EA4335" />
            <path d="M23.49 12.275C23.49 11.49 23.415 10.73 23.3 10H12V14.51H18.47C18.18 15.99 17.34 17.25 16.08 18.1L19.945 21.1C22.2 19.01 23.49 15.92 23.49 12.275Z" fill="#4285F4" />
            <path d="M5.26498 14.2949C5.02498 13.5699 4.88501 12.7999 4.88501 11.9999C4.88501 11.1999 5.01998 10.4299 5.26498 9.7049L1.275 6.60986C0.46 8.22986 0 10.0599 0 11.9999C0 13.9399 0.46 15.7699 1.28 17.3899L5.26498 14.2949Z" fill="#FBBC05" />
            <path d="M12.0004 24.0001C15.2404 24.0001 17.9654 22.935 19.9454 21.095L16.0804 18.095C15.0054 18.82 13.6204 19.245 12.0004 19.245C8.8704 19.245 6.21537 17.135 5.2654 14.29L1.27539 17.385C3.25539 21.31 7.3104 24.0001 12.0004 24.0001Z" fill="#34A853" />
          </svg>
          Sign in with Google
        </Button>
      </form>
    </>
  );
}
