"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, LockIcon, CreditCardIcon, CheckIcon } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";

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
  const [loading, setLoading] = useState(false);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [formState, setFormState] = useState({
    cardNumber: "",
    cardExpiry: "",
    cardCvc: "",
    cardName: "",
    billingEmail: ""
  });
  const { toast } = useToast();
  
  const plan = params.plan === 'professional' || params.plan === 'business' 
    ? PLANS[params.plan as keyof typeof PLANS] 
    : null;
  
  useEffect(() => {
    // Redirect if invalid plan
    if (!plan) {
      router.push('/dashboard/subscription');
    }
  }, [plan, router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Format card number with spaces
    if (name === 'cardNumber') {
      const formatted = value
        .replace(/\s/g, '')
        .replace(/(.{4})/g, '$1 ')
        .trim()
        .substring(0, 19);
      
      setFormState(prev => ({ ...prev, [name]: formatted }));
      return;
    }
    
    // Format expiry date with slash
    if (name === 'cardExpiry') {
      const input = value.replace(/\D/g, '');
      let formatted = input;
      
      if (input.length >= 3) {
        formatted = `${input.substring(0, 2)}/${input.substring(2, 4)}`;
      }
      
      setFormState(prev => ({ ...prev, [name]: formatted }));
      return;
    }
    
    // Handle all other fields
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Call API to update subscription
      const response = await fetch('/api/subscription/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan: params.plan,
          billingCycle
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Store plan info in localStorage
        localStorage.setItem('subscription', JSON.stringify({
          plan: params.plan,
          billingCycle,
          purchaseDate: new Date().toISOString(),
          status: 'active'
        }));
        
        // Dispatch event to update UI components that use subscription data
        window.dispatchEvent(new Event('storage'));
        
        // Show success message
        toast({
          title: "Subscription upgraded successfully!",
          description: `Your ${plan?.name} plan is now active.`,
          variant: "default",
        });
        
        // Redirect to subscription page
        router.push('/dashboard/subscription');
      } else {
        throw new Error(result.error || 'Failed to process payment');
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast({
        title: "Payment failed",
        description: "There was an error processing your payment. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  if (!plan) {
    return <div>Loading...</div>;
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
          
          {/* Right side - Payment details */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>Payment Details</CardTitle>
                <CardDescription>Enter your payment information to upgrade to the {plan.name} plan.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="cardName">Name on card</Label>
                      <Input 
                        id="cardName" 
                        name="cardName" 
                        placeholder="John Smith" 
                        value={formState.cardName}
                        onChange={handleInputChange}
                        required 
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="cardNumber">Card number</Label>
                      <div className="relative">
                        <Input 
                          id="cardNumber" 
                          name="cardNumber" 
                          placeholder="4242 4242 4242 4242" 
                          value={formState.cardNumber}
                          onChange={handleInputChange}
                          maxLength={19}
                          required 
                        />
                        <CreditCardIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="cardExpiry">Expiry date</Label>
                        <Input 
                          id="cardExpiry" 
                          name="cardExpiry" 
                          placeholder="MM/YY" 
                          value={formState.cardExpiry}
                          onChange={handleInputChange}
                          maxLength={5}
                          required 
                        />
                      </div>
                      <div>
                        <Label htmlFor="cardCvc">CVC</Label>
                        <div className="relative">
                          <Input 
                            id="cardCvc" 
                            name="cardCvc" 
                            placeholder="123" 
                            value={formState.cardCvc}
                            onChange={handleInputChange}
                            maxLength={3}
                            required 
                          />
                          <LockIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="billingEmail">Email for receipt</Label>
                      <Input 
                        id="billingEmail" 
                        name="billingEmail" 
                        type="email" 
                        placeholder="you@example.com" 
                        value={formState.billingEmail}
                        onChange={handleInputChange}
                        required 
                      />
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <Button type="submit" className="w-full" size="lg" disabled={loading}>
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Processing...
                        </>
                      ) : (
                        `Pay ${billingCycle === 'monthly' ? `$${plan.price.monthly.toFixed(2)}` : `$${plan.price.yearly.toFixed(2)}`}`
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      You can cancel your subscription at any time from your dashboard
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-center space-x-2 pt-6">
                    <LockIcon className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Secure payment processing</p>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
