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
import { deleteContractAction } from "@/app/actions";

interface ContractDetailClientActionsProps {
  contract: ContractDetail;
}

// Updated status type based on new workflow
type ContractStatus = 'draft' | 'pending_signatures' | 'pending_funding' | 'active' | 'pending_delivery' | 'in_review' | 'revision_requested' | 'pending_completion' | 'completed' | 'cancelled' | 'disputed';

export function ContractDetailClientActions({ contract: initialContract }: ContractDetailClientActionsProps) {
  const [contract, setContract] = useState<ContractDetail>(initialContract); // Local state if status changes locally
  const [isPending, startTransition] = useTransition(); // Add transition state
  const { toast } = useToast();
  const router = useRouter();

  // Send contract via email
  const handleSendContract = async () => {
    const email = prompt("Enter client email address:");
    if (!email) return;
    
    setContract({ ...contract, status: 'pending_signatures' });
    
    try {
      const response = await fetch('/api/contracts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId: contract.id,
          recipientEmail: email
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Contract sent successfully",
          description: `Contract invitation sent to ${email}`,
        });
        // Refresh the page to get updated data
        window.location.reload();
      } else {
        setContract({ ...contract, status: 'draft' }); // Revert status
        toast({
          title: "Failed to send contract",
          description: result.message || "Please try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      setContract({ ...contract, status: 'draft' }); // Revert status
      console.error("Failed to send contract:", error);
      toast({
        title: "Error",
        description: "Failed to send contract. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Fund contract via escrow
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
    <div className="flex flex-wrap gap-2">
      {/* Basic Actions */}
      <Button variant="outline" size="sm" onClick={() => window.print()} disabled={isPending}>
        <PrinterIcon className="h-4 w-4 mr-2" />
        Print
      </Button>
      <Button variant="outline" size="sm" onClick={() => alert('Download functionality not implemented.')} disabled={isPending}>
        <DownloadIcon className="h-4 w-4 mr-2" />
        Download
      </Button>

      {/* Workflow Actions */}
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

      {contract.status === "pending_funding" && (
        <Button
          size="sm"
          onClick={handleFundContract}
          disabled={isPending}
        >
          <CreditCardIcon className="h-4 w-4 mr-2" />
          Fund Escrow
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

      {/* Cancel Button */}
      {!["cancelled", "completed"].includes(contract.status) && (
        <Button
          variant="outline"
          size="sm"
          className="text-red-500 hover:text-red-600"
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
          className="text-red-500 hover:text-red-600"
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
  );
}
