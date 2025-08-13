"use client";

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircleIcon } from 'lucide-react';

export default function FundingSuccessMessage() {
  const searchParams = useSearchParams();
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (searchParams.get('funded') === 'true') {
      setShowSuccess(true);
      
      // Auto-hide after 10 seconds
      const timer = setTimeout(() => {
        setShowSuccess(false);
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  if (!showSuccess) return null;

  return (
    <Alert className="mb-6 border-green-200 bg-green-50">
      <CheckCircleIcon className="h-4 w-4 text-green-600" />
      <AlertDescription className="text-green-800">
        <strong>Payment Successful!</strong> Your escrow payment has been processed. 
        The funds are now held securely and the freelancer can begin work. 
        You will be able to release the payment once the work is completed.
      </AlertDescription>
    </Alert>
  );
}