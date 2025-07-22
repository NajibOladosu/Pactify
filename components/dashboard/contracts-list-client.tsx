"use client";

import { useState, useEffect, useTransition } from "react"; // Import useTransition
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { PlusIcon, SearchIcon, FilterIcon, EyeIcon, TrashIcon, CheckCircleIcon, ClockIcon, XCircleIcon, Loader2, LockIcon } from "lucide-react"; // Import Loader2 and LockIcon
import { useToast } from "@/components/ui/use-toast";
import { ContractWithTemplate } from "@/app/(dashboard)/dashboard/contracts/page"; // Import the type from the server component
import { deleteContractAction, sendContractAction } from "@/app/actions"; // Import the delete and send actions

interface ContractsListClientProps {
  initialContracts: ContractWithTemplate[];
}

// Define status type more broadly based on schema
type ContractStatus = 'draft' | 'pending' | 'signed' | 'completed' | 'cancelled' | 'disputed';

interface ContractLimitInfo {
  subscriptionTier: string;
  totalContracts: number;
  visibleContracts: number;
  hiddenContracts: number;
  contractLimit: number | null;
}

export function ContractsListClient({ initialContracts }: ContractsListClientProps) {
  const [contracts, setContracts] = useState<ContractWithTemplate[]>(initialContracts);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContractStatus | null>(null);
  const [isPending, startTransition] = useTransition(); // Add transition state
  const [deletingId, setDeletingId] = useState<string | null>(null); // Track which contract is being deleted
  const [sendingId, setSendingId] = useState<string | null>(null); // Track which contract is being sent
  const [contractLimitInfo, setContractLimitInfo] = useState<ContractLimitInfo | null>(null);
  const { toast } = useToast();

  // Update contracts if initialContracts change (e.g., after revalidation)
  useEffect(() => {
    setContracts(initialContracts);
  }, [initialContracts]);

  // Fetch contract limit info
  useEffect(() => {
    const fetchContractLimitInfo = async () => {
      try {
        const response = await fetch('/api/contracts/limit-info');
        if (response.ok) {
          const data = await response.json();
          setContractLimitInfo(data);
        }
      } catch (error) {
        console.error('Failed to fetch contract limit info:', error);
      }
    };

    fetchContractLimitInfo();
  }, []);

  const filteredContracts = contracts.filter(contract => {
    // Filter by search query (check title, description)
    const matchesSearch =
      searchQuery === "" ||
      (contract.title && contract.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (contract.description && contract.description.toLowerCase().includes(searchQuery.toLowerCase()));
      // Add client email search if available (might need to fetch related party data)

    // Filter by status
    const matchesStatus =
      statusFilter === null ||
      contract.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleDeleteContract = (id: string) => {
    if (isPending) return; // Prevent multiple deletions at once
    setDeletingId(id); // Set loading state for this specific button

    // Confirmation dialog (optional but recommended)
    if (!confirm("Are you sure you want to delete this contract? This action cannot be undone.")) {
        setDeletingId(null); // Clear loading state if cancelled
        return;
    }

    startTransition(async () => {
      const result = await deleteContractAction({ contractId: id });
      setDeletingId(null); // Clear loading state after action completes

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
        // No need to manually update state, revalidatePath in action handles it
      } else {
         toast({
          title: "Error",
          description: "An unexpected error occurred while deleting.",
          variant: "destructive",
        });
      }
    });
  };

  const handleSendContract = (id: string) => {
    if (isPending) return; // Prevent multiple sends at once
    setSendingId(id); // Set loading state for this specific button

    startTransition(async () => {
      const result = await sendContractAction({ contractId: id });
      setSendingId(null); // Clear loading state after action completes

      if (result.error) {
        toast({
          title: "Error Sending Contract",
          description: result.error,
          variant: "destructive",
        });
      } else if (result.success) {
        toast({
          title: "Contract Sent",
          description: result.message || "The contract has been sent successfully.",
        });
        // No need to manually update state, revalidatePath in action handles it
      } else {
         toast({
          title: "Error",
          description: "An unexpected error occurred while sending.",
          variant: "destructive",
        });
      }
    });
  };

  const getStatusBadge = (status: string | null) => {
    switch (status?.toString().trim()) {
      case "draft":
        return <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-200">Draft</Badge>;
      case "pending_signatures":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-200">Pending Signatures</Badge>;
      case "pending_funding":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200">Pending Funding</Badge>;
      case "active":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">Active</Badge>;
      case "pending_delivery":
        return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-200">Pending Delivery</Badge>;
      case "in_review":
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-200">In Review</Badge>;
      case "revision_requested":
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200">Revision Requested</Badge>;
      case "pending_completion":
        return <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-200">Pending Completion</Badge>;
      case "completed":
        return <Badge variant="outline" className="bg-green-500/20 text-green-700 border-green-300">Completed</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-200">Cancelled</Badge>;
      case "disputed":
        return <Badge variant="destructive">Disputed</Badge>;
      default:
        return <Badge variant="outline">{status ?? 'Unknown'}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Contract Limit Banner */}
      {contractLimitInfo && contractLimitInfo.contractLimit && (
        <Card className="p-4 bg-muted/30 border-muted-foreground/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Contract Visibility:</span>
                <Badge variant="outline">
                  {contractLimitInfo.visibleContracts} of {contractLimitInfo.totalContracts} shown
                </Badge>
                {contractLimitInfo.hiddenContracts > 0 && (
                  <Badge variant="secondary">
                    <LockIcon className="mr-1 h-3 w-3" />
                    {contractLimitInfo.hiddenContracts} hidden
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                ({contractLimitInfo.subscriptionTier} plan)
              </span>
            </div>
            {contractLimitInfo.hiddenContracts > 0 && (
              <div className="text-sm text-muted-foreground">
                Upgrade to view all contracts
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Search and Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search contracts by title or description..."
              className="w-full pl-9 pr-4 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Filter:</span>
            <div className="flex flex-wrap gap-2">
              {/* Add all possible statuses from schema */}
              {(['All', 'draft', 'pending', 'signed', 'completed', 'cancelled', 'disputed'] as const).map((status) => (
                <Badge
                  key={status}
                  variant={statusFilter === (status === 'All' ? null : status) ? "default" : "outline"}
                  className="rounded-full px-3 cursor-pointer"
                  onClick={() => setStatusFilter(status === 'All' ? null : status)}
                >
                  {status === 'All' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Contracts List */}
      {filteredContracts.length > 0 ? (
        <div className="space-y-4">
          {filteredContracts.map((contract) => (
            <Card key={contract.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-start gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{contract.title}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1">{contract.description}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      {/* Client Email might need fetching from contract_parties */}
                      {/* <div>
                        <span className="inline-block w-20 opacity-70">Client:</span>
                        <span>{contract.clientEmail}</span>
                      </div> */}
                      <div>
                        <span className="inline-block w-20 opacity-70">Created:</span>
                        <span>{contract.created_at ? new Date(contract.created_at).toLocaleDateString() : 'N/A'}</span>
                      </div>
                      <div>
                        <span className="inline-block w-20 opacity-70">Template:</span>
                        {/* Display template name from joined data */}
                        <span>{contract.contract_templates?.name ?? 'Custom'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="mr-6">
                      {getStatusBadge(contract.status)}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Placeholder buttons - need server actions */}
                      {contract.status === "draft" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-blue-500 border-blue-200 hover:border-blue-300"
                          onClick={() => handleSendContract(contract.id)}
                          disabled={isPending && sendingId === contract.id}
                        >
                          {isPending && sendingId === contract.id ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <ClockIcon className="mr-1 h-4 w-4" />
                          )}
                          {isPending && sendingId === contract.id ? 'Sending...' : 'Send Contract'}
                        </Button>
                      )}

                      {/* Add other status change buttons as needed, linking to server actions */}

                      <Link
                        href={`/dashboard/contracts/${contract.id}`}
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
                      >
                        <EyeIcon className="mr-1 h-4 w-4" />
                        View
                      </Link>

                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-500 border-red-200 hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
                        onClick={() => handleDeleteContract(contract.id)}
                        disabled={isPending && deletingId === contract.id} // Disable button while deleting this specific contract
                      >
                        {isPending && deletingId === contract.id ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <TrashIcon className="mr-1 h-4 w-4" />
                        )}
                        {isPending && deletingId === contract.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg bg-muted/30">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <FilterIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No contracts found</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            {searchQuery || statusFilter
              ? "No contracts match your current search and filters. Try adjusting your criteria."
              : "You haven't created any contracts yet, or none match the current filter."}
          </p>
          {!(searchQuery || statusFilter) && (
             <Button asChild>
                <Link href="/dashboard/contracts/new">
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Create Your First Contract
                </Link>
              </Button>
          )}
        </div>
      )}
    </div>
  );
}
