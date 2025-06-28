"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { 
  PrinterIcon, 
  DownloadIcon, 
  SendIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  PenIcon, 
  TrashIcon, 
  Loader2,
  CreditCardIcon,
  DollarSignIcon,
  UserCheckIcon,
  FileSignatureIcon
} from "lucide-react";
import { ContractDetail } from "@/app/(dashboard)/dashboard/contracts/[id]/page";
import { deleteContractAction, sendContractAction } from "@/app/actions";

interface ContractDetailClientActionsProps {
  contract: ContractDetail;
  userRole: 'client' | 'freelancer' | 'creator';
}

// Updated status type based on new workflow
type ContractStatus = 'draft' | 'pending_signatures' | 'pending_funding' | 'active' | 'pending_delivery' | 'in_review' | 'revision_requested' | 'pending_completion' | 'completed' | 'cancelled' | 'disputed';

export function ContractDetailClientActions({ contract: initialContract, userRole }: ContractDetailClientActionsProps) {
  const [contract, setContract] = useState<ContractDetail>(initialContract); // Local state if status changes locally
  const [isPending, startTransition] = useTransition(); // Add transition state
  const { toast } = useToast();
  const router = useRouter();

  // Send contract via email
  const handleSendContract = () => {
    if (!contract.client_email) {
      toast({
        title: "No client email",
        description: "Contract is missing client email. This should not happen.",
        variant: "destructive"
      });
      return;
    }

    startTransition(async () => {
      const result = await sendContractAction({ contractId: contract.id });

      if (result.error) {
        toast({
          title: "Error Sending Contract",
          description: result.error,
          variant: "destructive",
        });
      } else if (result.success) {
        toast({
          title: "Contract Sent",
          description: result.message || `Contract sent to ${contract.client_email}`,
        });
        // Force a full page reload to get updated data
        window.location.reload();
      }
    });
  };

  // Fund contract project
  const handleFundContract = async () => {
    try {
      const response = await fetch(`/api/contracts/${contract.id}/fund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          return_url: `${window.location.origin}/dashboard/contracts/${contract.id}`
        })
      });
      
      const result = await response.json();
      
      if (result.success && result.checkout_url) {
        // Redirect to Stripe checkout
        window.location.href = result.checkout_url;
      } else {
        toast({
          title: "Failed to initiate funding",
          description: result.message || "Please try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Failed to fund contract:", error);
      toast({
        title: "Error",
        description: "Failed to initiate funding. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Sign contract
  const handleSignContract = async () => {
    try {
      const response = await fetch(`/api/contracts/${contract.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature_data: 'digital_signature_placeholder' // In real implementation, this would be from a signature component
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Contract signed successfully",
          description: "The contract has been digitally signed.",
        });
        window.location.reload();
      } else {
        toast({
          title: "Failed to sign contract",
          description: result.message || "Please try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Failed to sign contract:", error);
      toast({
        title: "Error",
        description: "Failed to sign contract. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Release payment
  const handleReleasePayment = async () => {
    if (!confirm("Are you sure you want to release the payment? This action cannot be undone.")) {
      return;
    }
    
    try {
      const response = await fetch(`/api/contracts/${contract.id}/release-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Payment released successfully",
          description: "The payment has been released to the freelancer.",
        });
        window.location.reload();
      } else {
        toast({
          title: "Failed to release payment",
          description: result.message || "Please try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Failed to release payment:", error);
      toast({
        title: "Error",
        description: "Failed to release payment. Please try again.",
        variant: "destructive"
      });
    }
  };

 const handleDeleteContract = () => {
    if (isPending) return;

    // Confirmation dialog
    if (!confirm("Are you sure you want to delete this contract? This action cannot be undone.")) {
        return;
    }

    startTransition(async () => {
      const result = await deleteContractAction({ contractId: contract.id });

      if (result.error) {
        toast({
          title: "Error Deleting Contract",
          description: result.error,
          variant: "destructive",
        });
      } else if (result.success) {
        toast({
          title: "Contract Deleted",
          description: "The contract has been successfully deleted.",
        });
        // Navigate back to the contracts list after successful deletion
        router.push('/dashboard/contracts');
        // Revalidation happens in the server action
      } else {
         toast({
          title: "Error",
          description: "An unexpected error occurred while deleting.",
          variant: "destructive",
        });
      }
    });
  };


  return (
    <div className="flex flex-wrap items-center gap-2">
        {/* Primary Actions - Left Side */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status-Specific Primary Actions */}
          {contract.status === "draft" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/dashboard/contracts/${contract.id}/edit`)}
                disabled={isPending}
              >
                <PenIcon className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button
                size="sm"
                onClick={handleSendContract}
                disabled={isPending}
              >
                <SendIcon className="h-4 w-4 mr-2" />
                Send Contract
              </Button>
            </>
          )}

          {contract.status === "pending_signatures" && (
            <Button
              size="sm"
              onClick={handleSignContract}
              disabled={isPending}
            >
              <FileSignatureIcon className="h-4 w-4 mr-2" />
              Sign Contract
            </Button>
          )}

          {contract.status === "pending_funding" && userRole === "client" && (
            <Button
              size="sm"
              onClick={handleFundContract}
              disabled={isPending}
            >
              <CreditCardIcon className="h-4 w-4 mr-2" />
              Fund Project
            </Button>
          )}

          {(contract.status === "active" || contract.status === "pending_completion") && (
            <Button
              size="sm"
              onClick={handleReleasePayment}
              disabled={isPending}
            >
              <DollarSignIcon className="h-4 w-4 mr-2" />
              Release Payment
            </Button>
          )}

          {contract.status === "completed" && (
            <Button variant="outline" size="sm" disabled>
              <CheckCircleIcon className="h-4 w-4 mr-2" />
              Completed
            </Button>
          )}

          {/* Edit Button (locked for non-draft) */}
          {contract.status !== 'draft' && (
            <Button variant="outline" size="sm" disabled>
              <PenIcon className="h-4 w-4 mr-2" />
              Edit (Locked)
            </Button>
          )}
        </div>

        {/* Separator */}
        <div className="hidden sm:block h-6 w-px bg-border mx-2" />

        {/* Secondary Actions - Center */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={isPending}>
            <PrinterIcon className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={() => alert('Download functionality not implemented.')} disabled={isPending}>
            <DownloadIcon className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>

        {/* Separator */}
        <div className="hidden sm:block h-6 w-px bg-border mx-2" />

        {/* Destructive Actions - Right Side */}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {/* Cancel Button */}
          {!["cancelled", "completed"].includes(contract.status || '') && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={() => {
                if (confirm("Are you sure you want to cancel this contract?")) {
                  // TODO: Implement cancel contract API
                  toast({
                    title: "Cancel functionality",
                    description: "Cancel contract functionality not yet implemented.",
                    variant: "destructive"
                  });
                }
              }}
              disabled={isPending}
            >
              <XCircleIcon className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}

          {/* Delete Button (only for draft contracts) */}
          {contract.status === 'draft' && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={handleDeleteContract}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <TrashIcon className="h-4 w-4 mr-2" />
              )}
              {isPending ? 'Deleting...' : 'Delete'}
            </Button>
          )}
        </div>
      </div>
  );
}
