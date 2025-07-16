"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { PaymentForm } from "@/components/payment/payment-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function PaymentPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [paymentData, setPaymentData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const contractId = params.id as string;
  const clientSecret = searchParams.get("client_secret");

  useEffect(() => {
    if (!clientSecret) {
      setError("Missing payment information");
      setLoading(false);
      return;
    }

    // Fetch contract and payment details
    const fetchPaymentData = async () => {
      try {
        const response = await fetch(`/api/contracts/${contractId}/fund`, {
          method: "GET",
        });
        
        if (response.ok) {
          const data = await response.json();
          setPaymentData(data);
        } else {
          setError("Failed to load payment information");
        }
      } catch (err) {
        setError("Failed to load payment information");
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentData();
  }, [contractId, clientSecret]);

  const handlePaymentSuccess = () => {
    router.push(`/dashboard/contracts/${contractId}?payment=success`);
  };

  const handlePaymentError = (error: string) => {
    setError(error);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Payment Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Invalid Payment Link</CardTitle>
          </CardHeader>
          <CardContent>
            <p>This payment link is invalid or has expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const options = {
    clientSecret,
    appearance: {
      theme: 'stripe' as const,
    },
  };

  return (
    <div className="max-w-md mx-auto mt-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Complete Payment</CardTitle>
        </CardHeader>
        <CardContent>
          {paymentData && (
            <div className="space-y-4 mb-6">
              <div className="flex justify-between">
                <span>Contract Amount:</span>
                <span>${paymentData.amount_breakdown?.contract_amount?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Platform Fee:</span>
                <span>${paymentData.amount_breakdown?.platform_fee?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Processing Fee:</span>
                <span>${paymentData.amount_breakdown?.stripe_fee?.toFixed(2)}</span>
              </div>
              <hr />
              <div className="flex justify-between font-semibold">
                <span>Total:</span>
                <span>${paymentData.amount_breakdown?.total_to_charge?.toFixed(2)}</span>
              </div>
            </div>
          )}
          
          <Elements options={options} stripe={stripePromise}>
            <PaymentForm
              clientSecret={clientSecret}
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
            />
          </Elements>
        </CardContent>
      </Card>
    </div>
  );
}