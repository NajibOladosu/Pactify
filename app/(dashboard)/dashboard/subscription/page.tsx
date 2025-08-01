"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { CheckIcon, XIcon, CreditCardIcon, ExternalLinkIcon, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Progress } from "@/components/ui/progress"; // Assuming you have a Progress component
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"; // Assuming you have Table components

// Define interfaces for the fetched data structures
interface SubscriptionPlanFeatures {
  features: string[];
}

interface SubscriptionData {
  planId: string;
  planName: string;
  status: string;
  currentPeriodEnd: string | null;
  currentPeriodStart: string | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  billingCycle?: string;
  priceMonthly: number;
  priceYearly: number;
  escrowFeePercentage: number;
  maxContracts: number | null;
   features: SubscriptionPlanFeatures; // Assuming features is JSONB like {"features": [...]}
   availableContracts: number | null; // From profiles table (might be deprecated for display)
   activeContractsCount: number; // Added: Fetched count from RPC
   stripeCustomerId: string | null;
 }

interface InvoiceData {
  id: string;
  date: number; // Unix timestamp
  amount: number;
  currency: string;
  status: string;
  pdfUrl: string | null;
}

// Interface for available plans
interface AvailablePlan {
  id: string;
  name: string;
  description: string;
  price: { monthly: number; yearly: number };
  features: string[];
  limitations: string[];
  mostPopular: boolean;
  escrowFeePercentage: number;
  maxContracts: number | null;
}

export default function SubscriptionPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [actionLoading, setActionLoading] = useState<string | null>(null); // For button clicks like upgrade/cancel
  const [dataLoading, setDataLoading] = useState<boolean>(true); // For initial data fetch
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [availablePlans, setAvailablePlans] = useState<AvailablePlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      setDataLoading(true);
      setError(null);
      try {
        // Fetch subscription details
        const subRes = await fetch('/api/subscriptions');
        if (!subRes.ok) {
          throw new Error(`Failed to fetch subscription: ${subRes.statusText}`);
        }
        const subData = await subRes.json();
        console.log('🔍 Client received subscription data:', subData);
        console.log('🔍 Subscription planId:', subData.subscription?.planId);
        console.log('🔍 Subscription planName:', subData.subscription?.planName);
        setSubscription(subData.subscription);

        // Fetch available plans from database
        const plansRes = await fetch('/api/subscription-plans');
        if (!plansRes.ok) {
          console.warn(`Failed to fetch subscription plans: ${plansRes.statusText}`);
          // Keep empty array as fallback
          setAvailablePlans([]);
        } else {
          const plansData = await plansRes.json();
          setAvailablePlans(plansData.plans || []);
        }

        // Fetch invoices
        const invRes = await fetch('/api/subscription/invoices');
        if (!invRes.ok) {
          // Don't throw error for invoices, maybe user just has no history
          console.warn(`Failed to fetch invoices: ${invRes.statusText}`);
          setInvoices([]);
        } else {
          const invData = await invRes.json();
          setInvoices(invData.invoices || []);
        }

      } catch (err: any) {
        console.error("Error fetching subscription data:", err);
        setError(err.message || "An unexpected error occurred.");
        toast({
          title: "Error Loading Data",
          description: err.message || "Could not load subscription details.",
          variant: "destructive",
        });
      } finally {
        setDataLoading(false);
      }
    };

    fetchData();
  }, [toast]);


  const handleUpgrade = async (planId: string) => {
    setActionLoading(planId);
    // Redirect to checkout page (logic remains similar for now)
    // TODO: In Phase 2, ensure this calls a proper API to *create* the session first
    router.push(`/checkout/${planId}?period=${billingPeriod}`);
    // No need for setTimeout if redirection is handled properly on checkout page
    // setActionLoading(null); // Reset loading state after navigation or on error
  };

  const handleManageSubscription = async () => {
    setActionLoading("manage");
    try {
      const response = await fetch('/api/subscription/billing-portal', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to create billing portal session.');
      }
      const { url } = await response.json();
      if (url) {
        window.location.href = url; // Redirect to Stripe Billing Portal
      } else {
        throw new Error('Billing portal URL not received.');
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Could not open billing portal.",
        variant: "destructive",
      });
      setActionLoading(null);
    }
    // Loading state will persist until redirection or error
  };

  const handleCancelSubscription = async () => {
    setActionLoading("cancel");
    try {
      const response = await fetch('/api/subscription/cancel', { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel subscription.');
      }
      
      const result = await response.json();
      
      toast({
        title: "Subscription Cancellation Initiated",
        description: "Your plan will be downgraded to Free at the end of your current billing period.",
      });

      // Instead of router.refresh(), refetch the data directly
      try {
        const subRes = await fetch('/api/subscriptions');
        if (subRes.ok) {
          const subData = await subRes.json();
          setSubscription(subData.subscription);
        }
      } catch (refetchError) {
        console.warn('Failed to refetch subscription data:', refetchError);
      }

    } catch (err: any) {
      console.error('Cancel subscription error:', err);
      
      // Try to get more details from the error response
      let errorMessage = err.message || "Could not process cancellation request.";
      if (err.message.includes('No active subscription found')) {
        errorMessage = "No active subscription found to cancel. Please refresh the page and try again.";
      }
      
      toast({
        title: "Error Cancelling Subscription",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const calculateYearlySavings = (plan: any) => {
    if (!plan.price.monthly || !plan.price.yearly) return 0;
    const monthlyCost = plan.price.monthly * 12;
    const yearlyCost = plan.price.yearly;
    if (monthlyCost <= 0) return 0;
    const savings = monthlyCost - yearlyCost;
    const savingsPercentage = Math.round((savings / monthlyCost) * 100);
    return savingsPercentage;
  };

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const formatCurrency = (amount: number | null, currency: string = 'usd') => {
    if (amount === null || amount === undefined) return "N/A";
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(amount);
  };

  // Render Loading State
  if (dataLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading subscription details...</span>
      </div>
    );
  }

  // Render Error State
  if (error || !subscription) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          <p>There was an issue loading your subscription details.</p>
          <p className="text-sm text-muted-foreground mt-2">{error || "Subscription data is missing."}</p>
          <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

   // Determine current plan details from fetched data
   const currentPlan = subscription;
   const currentPlanFeatures = currentPlan.features?.features || []; // Safely access nested features array
   // Use the directly fetched activeContractsCount
   const contractsUsed = currentPlan.activeContractsCount;
   const contractsLimit = currentPlan.maxContracts === null ? 'Unlimited' : currentPlan.maxContracts;
   // Calculate usage percentage based on active count and limit
   const usagePercentage = currentPlan.maxContracts ? (contractsUsed / currentPlan.maxContracts) * 100 : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold">Subscription</h1>
        <p className="text-muted-foreground mt-1">Manage your subscription plan and billing.</p>
      </div>

      {/* Current Plan Summary - Dynamic */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Current Plan</CardTitle>
          <CardDescription>Your current subscription plan and usage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4 p-4 border rounded-lg">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg">{currentPlan.planName}</h3>
                <Badge 
                  variant={currentPlan.status === 'expired' ? 'destructive' : currentPlan.status === 'active' ? 'default' : 'secondary'} 
                  className="text-xs capitalize"
                >
                  {currentPlan.status === 'expired' ? 'Expired' : currentPlan.status}
                </Badge>
                {currentPlan.status === 'expired' && (
                  <Badge variant="outline" className="text-xs">
                    Expired on {formatDate(currentPlan.currentPeriodEnd ? Date.parse(currentPlan.currentPeriodEnd)/1000 : null)}
                  </Badge>
                )}
                {currentPlan.cancelAtPeriodEnd && currentPlan.status === 'active' && (
                  <Badge variant="destructive" className="text-xs">
                    Cancels on {formatDate(currentPlan.currentPeriodEnd ? Date.parse(currentPlan.currentPeriodEnd)/1000 : null)}
                  </Badge>
                )}
              </div>
              {/* Find description from fetched plans */}
              <p className="text-sm text-muted-foreground mt-1">
                {availablePlans.find(p => p.id === currentPlan.planId)?.description || 'Plan details'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                 {/* Display price based on actual billing cycle */}
                 {currentPlan.planId === 'free' ? (
                   <>
                     <span className="text-2xl font-bold">Free</span>
                   </>
                 ) : currentPlan.billingCycle === 'yearly' ? (
                   <>
                     <span className="text-2xl font-bold">{formatCurrency(currentPlan.priceYearly)}</span>
                     <span className="text-muted-foreground">/year</span>
                     <div className="text-sm text-muted-foreground">
                       {formatCurrency(currentPlan.priceYearly / 12)}/month
                     </div>
                   </>
                 ) : (
                   <>
                     <span className="text-2xl font-bold">{formatCurrency(currentPlan.priceMonthly)}</span>
                     <span className="text-muted-foreground">/month</span>
                   </>
                 )}
              </div>

              {/* --- Corrected Button Logic --- */}

              {/* Case 1: Active Paid Plan, Not Cancelling */}
              {currentPlan.planId !== 'free' && currentPlan.status === 'active' && !currentPlan.cancelAtPeriodEnd && (
                <>
                  <Button
                    variant="destructive"
                    className="whitespace-nowrap"
                    onClick={handleCancelSubscription}
                    disabled={actionLoading === "cancel"}
                  >
                    {actionLoading === "cancel" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Cancel Plan
                  </Button>
                </>
              )}

              {/* Case 2: Paid Plan, Cancellation Pending */}
              {currentPlan.planId !== 'free' && currentPlan.status === 'active' && currentPlan.cancelAtPeriodEnd && (
                 <Button variant="outline" disabled>Cancellation Pending</Button>
              )}

              {/* Case 3: Expired Plan */}
              {currentPlan.status === 'expired' && (
                 <Button variant="default" onClick={() => handleUpgrade(currentPlan.planId)}>
                   Reactivate Plan
                 </Button>
              )}

              {/* Case 4: Free Plan */}
              {currentPlan.planId === 'free' && (
                 <Button variant="outline" disabled>Current Plan</Button>
              )}
              {/* --- End Corrected Button Logic --- */}

            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 border rounded-lg space-y-1">
              <p className="text-sm text-muted-foreground">Contracts Used</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold">{contractsUsed}</span>
                <span className="text-sm text-muted-foreground">/ {contractsLimit}</span>
              </div>
              {currentPlan.maxContracts !== null && (
                <Progress value={usagePercentage} className="h-2 mt-2" />
              )}
            </div>

            <div className="p-4 border rounded-lg space-y-1">
              <p className="text-sm text-muted-foreground">Escrow Fee</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold">{currentPlan.escrowFeePercentage}%</span>
                <span className="text-xs text-muted-foreground">per transaction</span>
              </div>
            </div>

            <div className="p-4 border rounded-lg space-y-1">
              <p className="text-sm text-muted-foreground">
                {currentPlan.planId === 'free' 
                  ? 'Plan Status' 
                  : currentPlan.status === 'expired' 
                    ? 'Expired On' 
                    : 'Next Billing'
                }
              </p>
              <div className="text-2xl font-semibold">
                {currentPlan.planId === 'free' 
                  ? 'Active' 
                  : (currentPlan.currentPeriodEnd ? formatDate(Date.parse(currentPlan.currentPeriodEnd)/1000) : 'N/A')
                }
              </div>
              <p className="text-xs text-muted-foreground">
                {currentPlan.planId === 'free' 
                  ? 'No billing required' 
                  : currentPlan.status === 'expired'
                    ? 'Plan has expired'
                    : currentPlan.cancelAtPeriodEnd 
                      ? 'Subscription ends' 
                      : `${currentPlan.billingCycle === 'yearly' ? 'Yearly' : 'Monthly'} billing`
                }
              </p>
            </div>

            <div className="p-4 border rounded-lg space-y-1">
              <p className="text-sm text-muted-foreground">Payment Method</p>
              <div className="text-2xl font-semibold">
                {currentPlan.planId === 'free' ? 'None' : 'Stripe'}
              </div>
               <p className="text-xs text-muted-foreground">
                 {currentPlan.planId === 'free' ? 'No payment required' : 'Managed via Stripe'}
               </p>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Available Plans - Dynamic Current Plan Check */}
      {availablePlans.length > 0 && (
        <div className="pt-8">
          <div className="mb-8">
            <h2 className="text-2xl font-medium">Upgrade Your Plan</h2>
            <p className="text-muted-foreground">Choose a plan that's right for your business.</p>
          </div>

        <div className="flex justify-end mb-6">
          <div className="bg-muted/30 p-1 rounded-lg inline-flex">
            <button
              className={`px-4 py-2 text-sm rounded-md ${billingPeriod === 'monthly' ? 'bg-background shadow' : ''}`}
              onClick={() => setBillingPeriod('monthly')}
            >
              Monthly
            </button>
            <button
              className={`px-4 py-2 text-sm rounded-md ${billingPeriod === 'yearly' ? 'bg-background shadow' : ''}`}
              onClick={() => setBillingPeriod('yearly')}
            >
              Yearly
              {/* Calculate savings based on actual plans if possible */}
              <span className="ml-1 text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                Save {calculateYearlySavings(availablePlans.find(p => p.id === 'professional'))}%+
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {availablePlans.map((tier) => {
            const isCurrent = tier.id === currentPlan.planId;
            const price = billingPeriod === 'monthly' ? tier.price.monthly : (tier.price.yearly / 12);
            const yearlyPrice = tier.price.yearly;
            const savings = calculateYearlySavings(tier);

            return (
              // Apply border based on isCurrent, remove mostPopular check for border
              <Card key={tier.id} className={`${isCurrent ? 'border-primary border-2' : ''} ${isCurrent ? 'opacity-70' : ''}`}>
                <CardHeader>
                  <CardTitle>{tier.name}</CardTitle>
                  <CardDescription>{tier.description}</CardDescription>
                  <div className="mt-4">
                    <div className="flex items-baseline">
                      <span className="text-3xl font-bold">{formatCurrency(price)}</span>
                      <span className="text-muted-foreground ml-1">/month</span>
                    </div>
                    {billingPeriod === 'yearly' && tier.price.monthly > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Billed annually ({formatCurrency(yearlyPrice)}/year)
                        {savings > 0 && <span className="text-primary ml-2">Save {savings}%</span>}
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
                          <CheckIcon className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
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
                    // Adjust variant: Use outline if it's the current plan OR the free plan card
                    variant={isCurrent || tier.id === 'free' ? "outline" : (tier.mostPopular ? "default" : "outline")}
                    // Disable button if it's the current plan OR the free plan card OR if an action is loading
                    disabled={isCurrent || tier.id === 'free' || actionLoading === tier.id}
                    // Only attach onClick handler if it's NOT the current plan AND NOT the free plan card
                    onClick={() => {
                      if (!isCurrent && tier.id !== 'free') {
                        handleUpgrade(tier.id);
                      }
                    }}
                  >
                    {actionLoading === tier.id
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : null}
                    {/* Adjust button text */}
                    {isCurrent
                      ? "Current Plan" // Show "Current Plan" if this card matches the user's plan
                      : (tier.id === 'free'
                          ? "Free Plan" // Show "Free Plan" (or similar) on the free card itself
                          : `Upgrade to ${tier.name}` // Show "Upgrade to..." for other non-current plans
                        )
                    }
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
        </div>
      )}

      {/* Billing History - Dynamic */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>View your past invoices and payment history.</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <CreditCardIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No billing history</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                {currentPlan.planId === 'free'
                  ? "You're currently on the free plan. Your billing history will appear here once you upgrade to a paid plan."
                  : "No invoices found. Your billing history will appear here after your first payment."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{formatDate(invoice.date)}</TableCell>
                    <TableCell>{formatCurrency(invoice.amount, invoice.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={invoice.status === 'paid' ? 'default' : 'secondary'} className="capitalize">
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {invoice.pdfUrl ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                            View PDF <ExternalLinkIcon className="ml-2 h-3 w-3" />
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
