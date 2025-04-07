"use client";

import { signUpAction, signUpWithGoogleAction } from "@/app/actions";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import Link from "next/link";
import { SmtpMessage } from "../smtp-message";

interface SearchParams {
  success?: string;
  error?: string;
  message?: string;
}

export default function Signup({ 
  searchParams = {}
}: { 
  searchParams?: { [key: string]: string | string[] }
}) {
  const [userType, setUserType] = useState<string>("both");

  const handleRadioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserType(e.target.value);
  };

  return (
    <>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Create your Pactify Account</h1>
        <p className="text-sm text-muted-foreground">
          Join thousands of freelancers and clients creating secure contracts
        </p>
      </div>
      
      <form 
        action={signUpAction}
        className="space-y-6"
        onSubmit={(e) => {
          // This is just to add the userType to the form data
          const form = e.currentTarget;
          const formData = new FormData(form);
          formData.append("userType", userType);
        }}
      >
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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            name="password"
            placeholder="Create a secure password"
            minLength={8}
            autoComplete="new-password"
            required
          />
          <p className="text-xs text-muted-foreground">
            Must be at least 8 characters
          </p>
        </div>

        <div className="space-y-2">
          <Label>I am a</Label>
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-2">
              <input 
                type="radio" 
                id="freelancer" 
                name="userType" 
                value="freelancer" 
                onChange={handleRadioChange}
                checked={userType === "freelancer"}
                className="h-4 w-4"
              />
              <Label htmlFor="freelancer" className="font-normal cursor-pointer">Freelancer</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input 
                type="radio" 
                id="client" 
                name="userType" 
                value="client"
                onChange={handleRadioChange}
                checked={userType === "client"}
                className="h-4 w-4"
              />
              <Label htmlFor="client" className="font-normal cursor-pointer">Client</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input 
                type="radio" 
                id="both" 
                name="userType" 
                value="both"
                onChange={handleRadioChange}
                checked={userType === "both"}
                className="h-4 w-4"
              />
              <Label htmlFor="both" className="font-normal cursor-pointer">Both (I hire and get hired)</Label>
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <SubmitButton className="w-full" pendingText="Creating Account...">
            Create Account
          </SubmitButton>
          
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link className="text-primary-500 hover:underline font-medium" href="/sign-in">
                Sign in
              </Link>
            </p>
          </div>
        </div>
        
        <div className="text-xs text-center text-muted-foreground mt-6">
          By creating an account, you agree to our{" "}
          <Link href="/terms" className="text-primary-500 hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-primary-500 hover:underline">
            Privacy Policy
          </Link>
        </div>
        
        {searchParams.error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
            {searchParams.error}
          </div>
        )}
        
        {searchParams.success && (
          <div className="bg-green-50 text-green-600 p-3 rounded-md text-sm">
            {searchParams.success}
          </div>
        )}
      </form>
      
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t"></span>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
        </div>
      </div>
      
      <form action={signUpWithGoogleAction}>
        <Button variant="outline" className="w-full" type="submit">
          <svg viewBox="0 0 24 24" className="h-5 w-5 mr-2" aria-hidden="true">
            <path d="M12.0003 4.75C13.7703 4.75 15.3553 5.36002 16.6053 6.54998L20.0303 3.125C17.9502 1.19 15.2353 0 12.0003 0C7.31028 0 3.25527 2.69 1.28027 6.60998L5.27028 9.70498C6.21525 6.86002 8.87028 4.75 12.0003 4.75Z" fill="#EA4335" />
            <path d="M23.49 12.275C23.49 11.49 23.415 10.73 23.3 10H12V14.51H18.47C18.18 15.99 17.34 17.25 16.08 18.1L19.945 21.1C22.2 19.01 23.49 15.92 23.49 12.275Z" fill="#4285F4" />
            <path d="M5.26498 14.2949C5.02498 13.5699 4.88501 12.7999 4.88501 11.9999C4.88501 11.1999 5.01998 10.4299 5.26498 9.7049L1.275 6.60986C0.46 8.22986 0 10.0599 0 11.9999C0 13.9399 0.46 15.7699 1.28 17.3899L5.26498 14.2949Z" fill="#FBBC05" />
            <path d="M12.0004 24.0001C15.2404 24.0001 17.9654 22.935 19.9454 21.095L16.0804 18.095C15.0054 18.82 13.6204 19.245 12.0004 19.245C8.8704 19.245 6.21537 17.135 5.2654 14.29L1.27539 17.385C3.25539 21.31 7.3104 24.0001 12.0004 24.0001Z" fill="#34A853" />
          </svg>
          Sign up with Google
        </Button>
      </form>
      
      <SmtpMessage />
    </>
  );
}
