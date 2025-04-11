"use client"

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { CheckIcon, XIcon, ArrowRightIcon, CreditCardIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// This would normally come from an API call or context
const SUBSCRIPTION_TIERS = [
  {
    id: "free",
    name: "Free",
    description: "Basic features for individuals just getting started",
    price: {
      monthly: 0,
      yearly: 0,
    },
    features: [
      "Up to 3 contracts",
      "Basic contract templates",
      "10% escrow fee",
      "Email support"
    ],
    limitations: [
      "No custom branding",
      "Limited templates",
      "No team features"
    ],
    current: true,
  },
  {
    id: "professional",
    name: "Professional",
    description: "For growing freelance businesses",
    price: {
      monthly: 19.99,
      yearly: 199.99,
    },
    features: [
      "Unlimited contracts",
      "All professional templates",
      "7.5% escrow fee",
      "Basic custom branding",
      "Priority email support"
    ],
    limitations: [
      "No team features",
      "Basic reporting only"
    ],
    current: false,
    mostPopular: true,
  },
  {
    id: "business",
    name: "Business",
    description: "For established freelance businesses",
    price: {
      monthly: 49.99,
      yearly: 499.99,
    },
    features: [
      "All Professional features",
      "Team collaboration (up to 5)",
      "5% escrow fee",
      "Full white-labeling",
      "Priority support",
      "API access",
      "Advanced analytics"
    ],
    limitations: [],
    current: false,
  }
];

export default function SubscriptionPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const handleUpgrade = async (planId: string) => {
    setLoading(planId);
    
    // Redirect to checkout page
    setTimeout(() => {
      router.push(`/checkout/${planId}`);
    }, 500);
  };

  const handleCancelSubscription = async () => {
    setLoading("cancel");
    
    // This would be replaced with actual cancellation logic
    setTimeout(() => {
      toast({
        title: "Cannot Cancel Free Plan",
        description: "You are currently on the free plan which cannot be cancelled.",
        variant: "default",
      });
      setLoading(null);
    }, 1500);
  };

  const calculateYearlySavings = (plan: any) => {
    const monthlyCost = plan.price.monthly * 12;
    const yearlyCost = plan.price.yearly;
    const savings = monthlyCost - yearlyCost;
    const savingsPercentage = Math.round((savings / monthlyCost) * 100);
    return savingsPercentage;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold">Subscription</h1>
        <p className="text-muted-foreground mt-1">Manage your subscription plan and billing.</p>
      </div>

      {/* Current Plan Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Current Plan</CardTitle>
          <CardDescription>Your current subscription plan and usage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4 p-4 border rounded-lg">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg">Free Plan</h3>
                <Badge variant="outline" className="text-xs">Current Plan</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Basic features for individuals just getting started</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-2xl font-bold">$0</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <Button 
                variant="outline" 
                className="whitespace-nowrap"
                onClick={handleCancelSubscription}
                disabled={loading === "cancel"}
              >
                {loading === "cancel" ? "Processing..." : "Cancel Plan"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 border rounded-lg space-y-1">
              <p className="text-sm text-muted-foreground">Contracts Used</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold">0</span>
                <span className="text-sm text-muted-foreground">/ 3</span>
              </div>
              <div className="h-2 bg-muted rounded-full mt-2">
                <div className="h-full bg-primary-500 rounded-full w-0"></div>
              </div>
            </div>
            
            <div className="p-4 border rounded-lg space-y-1">
              <p className="text-sm text-muted-foreground">Escrow Fee</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold">10%</span>
                <span className="text-xs text-muted-foreground">per transaction</span>
              </div>
            </div>
            
            <div className="p-4 border rounded-lg space-y-1">
              <p className="text-sm text-muted-foreground">Renewal Date</p>
              <div className="text-2xl font-semibold">N/A</div>
              <p className="text-xs text-muted-foreground">Free plan</p>
            </div>
            
            <div className="p-4 border rounded-lg space-y-1">
              <p className="text-sm text-muted-foreground">Payment Method</p>
              <div className="text-2xl font-semibold">None</div>
              <p className="text-xs text-muted-foreground">No payment required</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div className="pt-8">
        <div className="mb-8">
          <h2 className="text-2xl font-medium">Upgrade Your Plan</h2>
          <p className="text-muted-foreground">Choose a plan that's right for your business.</p>
        </div>
        
        <div className="flex justify-end mb-6">
          <div className="bg-muted/30 p-1 rounded-lg inline-flex">
            <button 
              className={`px-4 py-2 text-sm rounded-md ${billingPeriod === 'monthly' ? 'bg-white shadow' : ''}`}
              onClick={() => setBillingPeriod('monthly')}
            >
              Monthly
            </button>
            <button 
              className={`px-4 py-2 text-sm rounded-md ${billingPeriod === 'yearly' ? 'bg-white shadow' : ''}`}
              onClick={() => setBillingPeriod('yearly')}
            >
              Yearly
              <span className="ml-1 text-xs bg-primary-500 text-white px-1.5 py-0.5 rounded-full">
                Save 15%
              </span>
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {SUBSCRIPTION_TIERS.map((tier) => (
            <Card key={tier.id} className={`${tier.mostPopular ? 'border-primary-500 border-2 relative' : ''}`}>
              <CardHeader>
                <CardTitle>{tier.name}</CardTitle>
                <CardDescription>{tier.description}</CardDescription>
                <div className="mt-4">
                  <div className="flex items-baseline">
                    <span className="text-3xl font-bold">${billingPeriod === 'monthly' ? tier.price.monthly : (tier.price.yearly / 12).toFixed(2)}</span>
                    <span className="text-muted-foreground ml-1">/month</span>
                  </div>
                  {billingPeriod === 'yearly' && tier.price.monthly > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Billed annually (${tier.price.yearly}/year)
                      <span className="text-primary-500 ml-2">
                        Save {calculateYearlySavings(tier)}%
                      </span>
                    </p>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Features</h4>
                  <ul className="space-y-2">
                    {tier.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckIcon className="h-4 w-4 text-primary-500 mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                {tier.limitations.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Limitations</h4>
                    <ul className="space-y-2">
                      {tier.limitations.map((limitation, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <XIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>{limitation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <Button 
                  className="w-full mt-4" 
                  variant={tier.current ? "outline" : (tier.mostPopular ? "default" : "outline")}
                  disabled={tier.current || loading === tier.id}
                  onClick={() => handleUpgrade(tier.id)}
                >
                  {loading === tier.id
                    ? "Processing..."
                    : tier.current
                      ? "Current Plan"
                      : `Upgrade to ${tier.name}`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Billing History */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>View your past invoices and payment history.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <CreditCardIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No billing history</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              You're currently on the free plan. Your billing history will appear here once you upgrade to a paid plan.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
