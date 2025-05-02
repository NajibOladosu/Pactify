"use client";

import { useState, useTransition } from "react"; // Import useTransition
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { PrinterIcon, DownloadIcon, SendIcon, CheckCircleIcon, XCircleIcon, PenIcon, TrashIcon, Loader2 } from "lucide-react"; // Added TrashIcon, Loader2
import { ContractDetail } from "@/app/(dashboard)/dashboard/contracts/[id]/page"; // Import type from server component
import { deleteContractAction } from "@/app/actions"; // Import delete action

interface ContractDetailClientActionsProps {
  contract: ContractDetail;
}

// Define status type more broadly based on schema
type ContractStatus = 'draft' | 'pending' | 'signed' | 'completed' | 'cancelled' | 'disputed';

export function ContractDetailClientActions({ contract: initialContract }: ContractDetailClientActionsProps) {
  const [contract, setContract] = useState<ContractDetail>(initialContract); // Local state if status changes locally
  const [isPending, startTransition] = useTransition(); // Add transition state
  const { toast } = useToast();
  const router = useRouter();

  // TODO: Implement Server Actions for status changes
  const handleChangeStatus = async (newStatus: ContractStatus) => {
    console.warn(`Status change to ${newStatus} requires a Server Action.`);
    // Optimistic UI update (optional)
    setContract({ ...contract, status: newStatus });
    toast({
      title: "Status updated (Locally)",
      description: `Implement server action to change status to ${newStatus}.`,
    });
    // Revalidate path or refetch data after server action completes
  };

  // TODO: Implement Server Action for sending
  const handleSendContract = async () => {
     console.warn(`Sending contract requires an API route or Server Action.`);
     // Placeholder for API call
     try {
        // Example: Call an API route (needs to be created)
        // const response = await fetch('/api/contracts/send', { ... });
        // const result = await response.json();
        // if (result.success) {
        //    handleChangeStatus("pending"); // Assuming 'pending' is the status after sending
        //    toast({ title: "Contract sent", ... });
        // } else { ... }
        handleChangeStatus("pending"); // Optimistic update for demo
        toast({ title: "Contract sent (Locally)", description: "Implement server action/API route." });
     } catch (error) {
        console.error("Failed to send contract:", error);
        toast({ title: "Error", description: "Failed to send contract.", variant: "destructive" });
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
      <Button variant="outline" size="sm" onClick={() => window.print()} disabled={isPending}>
        <PrinterIcon className="h-4 w-4 mr-2" />
        Print
      </Button>
      <Button variant="outline" size="sm" onClick={() => alert('Download functionality not implemented.')} disabled={isPending}>
        <DownloadIcon className="h-4 w-4 mr-2" />
        Download
      </Button>

      {/* Conditional Action Buttons based on status */}
      {contract.status === "draft" && (
        <Button
          size="sm"
          onClick={handleSendContract}
          disabled={isPending}
        >
          <SendIcon className="h-4 w-4 mr-2" />
          Send to Client (Action Needed)
        </Button>
      )}

      {contract.status === "pending" && ( // Assuming 'pending' is the status after sending
        <Button
          size="sm"
          onClick={() => handleChangeStatus("signed")}
          disabled={isPending}
        >
          <CheckCircleIcon className="h-4 w-4 mr-2" />
          Mark as Signed (Action Needed)
        </Button>
      )}

      {contract.status === "signed" && (
        <Button
          size="sm"
          onClick={() => handleChangeStatus("completed")}
          disabled={isPending}
        >
          <CheckCircleIcon className="h-4 w-4 mr-2" />
          Complete Contract (Action Needed)
        </Button>
      )}

       {/* Add Cancel Button - needs server action */}
       {contract.status !== "cancelled" && contract.status !== "completed" && (
         <Button
           variant="outline"
           size="sm"
           className="text-red-500 hover:text-red-600 disabled:opacity-50"
           onClick={() => handleChangeStatus("cancelled")}
           disabled={isPending}
         >
           <XCircleIcon className="h-4 w-4 mr-2" />
           Cancel (Action Needed)
         </Button>
       )}

        {/* Add Delete Button */}
       <Button
         variant="outline"
         size="sm"
         className="text-red-500 hover:text-red-600 disabled:opacity-50"
         onClick={handleDeleteContract}
         disabled={isPending} // Disable while any action is pending
       >
         {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
         ) : (
            <TrashIcon className="h-4 w-4 mr-2" />
         )}
         {isPending ? 'Deleting...' : 'Delete'}
       </Button>

        {/* Link Edit Button to the new edit page if contract is draft */}
       {contract.status === 'draft' && (
          <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/contracts/${contract.id}/edit`)} disabled={isPending}>
            <PenIcon className="h-4 w-4 mr-2" />
            Edit
          </Button>
       )}
       {/* Show disabled edit button if not draft */}
       {contract.status !== 'draft' && (
          <Button variant="outline" size="sm" disabled>
            <PenIcon className="h-4 w-4 mr-2" />
            Edit (Locked)
          </Button>
       )}
    </div>
  );
}
