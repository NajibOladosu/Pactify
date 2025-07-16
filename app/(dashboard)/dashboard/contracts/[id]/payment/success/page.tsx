"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";
import Link from "next/link";

export default function PaymentSuccessPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [verifying, setVerifying] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contractId = params.id as string;
  const paymentIntent = searchParams.get("payment_intent");

  useEffect(() => {
    const verifyPayment = async () => {
      if (!paymentIntent) {
        setError("Missing payment information");
        setVerifying(false);
        return;
      }

      try {
        // Confirm the payment on the backend
        const response = await fetch(`/api/contracts/${contractId}/fund/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_intent_id: paymentIntent,
          }),
        });

        const result = await response.json();

        if (result.success) {
          setSuccess(true);
        } else {
          setError(result.message || "Payment verification failed");
        }
      } catch (err) {
        setError("Failed to verify payment");
      } finally {
        setVerifying(false);
      }
    };

    verifyPayment();
  }, [contractId, paymentIntent]);

  if (verifying) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Verifying Payment</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Verifying your payment...</span>
          </CardContent>
        </Card>
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
            <Button asChild className="mt-4">
              <Link href={`/dashboard/contracts/${contractId}`}>
                Return to Contract
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-green-600">
              <CheckCircle className="mr-2 h-5 w-5" />
              Payment Successful
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4">
              Your payment has been processed successfully! The contract has been funded and is now active.
            </p>
            <Button asChild className="w-full">
              <Link href={`/dashboard/contracts/${contractId}`}>
                View Contract
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}