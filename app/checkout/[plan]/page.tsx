"use client";

// Import use from React
import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon, LockIcon, CreditCardIcon, CheckIcon, Loader2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";
// Removed Input and Label as the form is gone

// Define plan details for display
const PLANS = {
  professional: {
    name: "Professional",
    price: { monthly: 19.99, yearly: 199.99 },
    features: [
      "Unlimited contracts",
      "All professional templates",
      "7.5% escrow fee",
      "Basic custom branding",
      "Priority email support"
    ]
  },
  business: {
    name: "Business",
    price: { monthly: 49.99, yearly: 499.99 },
    features: [
      "All Professional features",
      "Team collaboration (up to 5)",
      "5% escrow fee",
      "Full white-labeling",
      "Priority support",
      "API access",
      "Advanced analytics"
    ]
  }
};

export default function CheckoutPage({ params }: { params: { plan: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams(); // Get query params
  const [loading, setLoading] = useState(false);
  // Read initial billing cycle from query param or default to monthly
  const initialBillingCycle = searchParams.get('period') === 'yearly' ? 'yearly' : 'monthly';
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(initialBillingCycle);
  const { toast } = useToast();

  // Unwrap params using React.use() - Note: This might require adjusting component structure if not already compatible
  // For now, we assume the component structure allows top-level use()
  // If this causes issues, the component might need refactoring
  const routeParams = use(Promise.resolve(params)); // Simulate unwrapping if params is a Promise like searchParams
  const planId = routeParams.plan; // Access unwrapped param

  const plan = planId === 'professional' || planId === 'business'
    ? PLANS[planId as keyof typeof PLANS]
    : null;

  useEffect(() => {
    // Redirect if invalid plan ID in URL
    if (!plan) {
      toast({ title: "Invalid Plan", description: "The selected plan does not exist.", variant: "destructive" });
      router.push('/dashboard/subscription');
    }
  }, [plan, router, toast]);

  // Function to handle redirecting to Stripe Checkout
  const handleProceedToPayment = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId: planId,
          billingCycle: billingCycle
        }),
      });

      const result = await response.json();

      if (response.ok && result.url) {
        // Redirect to Stripe Checkout
        window.location.href = result.url;
      } else {
        throw new Error(result.error || 'Failed to create checkout session.');
      }
    } catch (error: any) {
      console.error('Checkout session error:', error);
      toast({
        title: "Checkout Error",
        description: error.message || "Could not initiate the payment process. Please try again.",
        variant: "destructive",
      });
      setLoading(false); // Stop loading indicator on error
    }
    // Note: setLoading(false) is not called on success because the page redirects
  };

  if (!plan) {
    // Render minimal loading/redirecting state
    return (
       <div className="flex justify-center items-center h-screen">
         <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
       </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-10">
          <Link href="/dashboard/subscription" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="mr-1 h-4 w-4" />
            Back to subscription
          </Link>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left side - Plan details */}
          <div className="lg:col-span-2">
            <div className="sticky top-8">
              <h1 className="text-2xl font-serif font-bold mb-4">Checkout</h1>
              <Card>
                <CardHeader>
                  <CardTitle>Order Summary</CardTitle>
                  <CardDescription>
                    {plan.name} Plan - {billingCycle === 'monthly' ? 'Monthly' : 'Annual'} billing
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">
                      {plan.name} Plan ({billingCycle === 'monthly' ? 'Monthly' : 'Annual'})
                    </span>
                    <span className="font-medium">
                      ${billingCycle === 'monthly' ? plan.price.monthly.toFixed(2) : plan.price.yearly.toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <div className="flex justify-between items-center font-semibold">
                      <span>Total</span>
                      <span>${billingCycle === 'monthly' ? plan.price.monthly.toFixed(2) : plan.price.yearly.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {billingCycle === 'monthly' 
                        ? `You will be charged $${plan.price.monthly.toFixed(2)} today and on this date each month.` 
                        : `You will be charged $${plan.price.yearly.toFixed(2)} today and on this date each year.`}
                    </p>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <h3 className="font-medium mb-2">Plan includes:</h3>
                    <ul className="space-y-2">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckIcon className="h-4 w-4 text-primary-500 mt-0.5 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-4">
                      <div 
                        className={`border rounded-md py-2 px-3 flex-1 text-center cursor-pointer ${billingCycle === 'monthly' ? 'border-primary-500 bg-primary-500/5' : 'hover:border-primary-300'}`}
                        onClick={() => setBillingCycle('monthly')}
                      >
                        <div className="font-medium">Monthly</div>
                        <div className="text-sm text-muted-foreground">${plan.price.monthly.toFixed(2)}/mo</div>
                      </div>
                      <div 
                        className={`border rounded-md py-2 px-3 flex-1 text-center cursor-pointer ${billingCycle === 'yearly' ? 'border-primary-500 bg-primary-500/5' : 'hover:border-primary-300'}`}
                        onClick={() => setBillingCycle('yearly')}
                      >
                        <div className="font-medium">Annual</div>
                        <div className="text-sm text-muted-foreground">${(plan.price.yearly / 12).toFixed(2)}/mo</div>
                        <div className="text-xs text-primary-500">Save 15%</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          
          {/* Right side - Simplified confirmation */}
          <div className="lg:col-span-3">
             <Card>
               <CardHeader>
                 <CardTitle>Confirm Your Upgrade</CardTitle>
                 <CardDescription>
                   You are upgrading to the <strong>{plan.name}</strong> plan with{' '}
                   <strong>{billingCycle === 'monthly' ? 'Monthly' : 'Annual'}</strong> billing.
                 </CardDescription>
               </CardHeader>
               <CardContent>
                 <div className="space-y-4">
                   <p>
                     Click the button below to proceed to our secure payment partner, Stripe,
                     to complete your subscription.
                   </p>
                   <p className="text-sm text-muted-foreground">
                     You will be charged{' '}
                     <strong>
                       ${billingCycle === 'monthly' ? plan.price.monthly.toFixed(2) : plan.price.yearly.toFixed(2)}
                     </strong>{' '}
                     today.
                   </p>
                 </div>

                 <div className="pt-6 border-t mt-6">
                   <Button onClick={handleProceedToPayment} className="w-full" size="lg" disabled={loading}>
                     {loading ? (
                       <>
                         <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                         Redirecting to payment...
                       </>
                     ) : (
                       `Proceed to Secure Payment`
                     )}
                   </Button>
                   <p className="text-xs text-muted-foreground text-center mt-2">
                     You can manage your subscription later from your dashboard.
                   </p>
                 </div>

                 <div className="flex items-center justify-center space-x-2 pt-6">
                   <LockIcon className="h-4 w-4 text-muted-foreground" />
                   <p className="text-xs text-muted-foreground">Secure checkout via Stripe</p>
                 </div>
               </CardContent>
             </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
