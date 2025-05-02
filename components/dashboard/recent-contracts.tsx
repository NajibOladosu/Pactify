import { createClient } from "@/utils/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  FileTextIcon,
  PlusIcon,
  ArrowRightIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  FileIcon,
  SendIcon
} from "lucide-react";
import { Database } from "@/types/supabase"; // Import database types

// Define the type for fetched contracts based on your schema
// Include necessary fields for display
type RecentContract = Pick<
  Database['public']['Tables']['contracts']['Row'],
  'id' | 'title' | 'status' | 'created_at'
> & {
  // Add related data if needed, e.g., client name from contract_parties
  // For now, we'll just use what's directly on the contract
};

// Define status type more broadly based on schema
type ContractStatus = 'draft' | 'pending' | 'signed' | 'completed' | 'cancelled' | 'disputed';

const getStatusBadge = (status: string | null) => {
  switch (status as ContractStatus) {
    case "draft":
      return <Badge variant="outline" className="bg-muted text-muted-foreground">Draft</Badge>;
    case "pending":
       return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-200">Pending</Badge>;
    case "signed":
      return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-200">Signed</Badge>;
    case "completed":
      return <Badge variant="outline" className="bg-green-500/20 text-green-600 border-green-300">Completed</Badge>;
    case "cancelled":
      return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-200">Cancelled</Badge>;
    case "disputed":
      return <Badge variant="destructive">Disputed</Badge>;
    default:
      return <Badge variant="outline">{status ?? 'Unknown'}</Badge>;
  }
};

const getStatusIcon = (status: string | null) => {
  switch (status as ContractStatus) {
    case "draft":
      return <FileIcon className="h-5 w-5 text-muted-foreground" />;
    case "pending":
      return <SendIcon className="h-5 w-5 text-yellow-600" />; // Use yellow for pending
    case "signed":
      return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
    case "completed":
      return <CheckCircleIcon className="h-5 w-5 text-green-600" />;
    case "cancelled":
      return <XCircleIcon className="h-5 w-5 text-red-500" />;
    case "disputed":
      return <XCircleIcon className="h-5 w-5 text-destructive" />; // Use destructive color
    default:
      return <FileIcon className="h-5 w-5 text-muted-foreground" />;
  }
};

export async function RecentContracts() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If no user, maybe show a different state or return null
  if (!user) {
    return (
       <Card>
        <CardHeader>
          <CardTitle>Recent Contracts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Please sign in to view contracts.</p>
        </CardContent>
      </Card>
    );
  }

  // Fetch the 5 most recent contracts for the user
  // TODO: Later, adjust to fetch contracts where user is creator OR a party
  const { data: contracts, error } = await supabase
    .from("contracts")
    .select(`
      id,
      title,
      status,
      created_at
    `)
    .eq("creator_id", user.id) // Fetch contracts created by the user for now
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error fetching recent contracts:", error);
    // Handle error display appropriately
    return (
       <Card>
        <CardHeader>
          <CardTitle>Recent Contracts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Could not load recent contracts.</p>
        </CardContent>
      </Card>
    );
  }

  const recentContracts: RecentContract[] = contracts || [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recent Contracts</CardTitle>
          <CardDescription>Your 5 most recently created contracts.</CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/contracts">
            View all<ArrowRightIcon className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {recentContracts.length > 0 ? (
          <div className="space-y-4">
            {recentContracts.map((contract) => (
              <div key={contract.id} className="flex items-start p-3 rounded-lg border hover:bg-muted/20 transition-colors">
                <div className="mr-4 mt-0.5">
                  {getStatusIcon(contract.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <Link href={`/dashboard/contracts/${contract.id}`} className="text-sm font-medium hover:underline truncate">
                      {contract.title || "Untitled Contract"}
                    </Link>
                    <div className="ml-2 flex-shrink-0">
                      {getStatusBadge(contract.status)}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center text-xs text-muted-foreground">
                    <ClockIcon className="mr-1 h-3 w-3" />
                    Created {contract.created_at ? new Date(contract.created_at).toLocaleDateString() : 'N/A'}
                    {/* TODO: Add client info here once fetched */}
                    {/* <span className="mx-2">•</span>
                    <span className="truncate">{contract.clientName || 'No Client'}</span> */}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg bg-muted/30">
            <FileTextIcon className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="text-lg font-medium mb-2">No contracts yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">
              Create your first contract to see it listed here.
            </p>
            <Button asChild>
              <Link href="/dashboard/contracts/new">
                <PlusIcon className="mr-2 h-4 w-4" />
                Create Contract
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
