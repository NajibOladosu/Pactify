"use client";

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

// Define the type for recent contracts
type RecentContract = {
  id: string;
  title: string | null;
  status: string | null;
  created_at: string;
};

// Define status type more broadly based on schema
type ContractStatus = 'draft' | 'pending_signatures' | 'pending_funding' | 'active' | 'pending_delivery' | 'in_review' | 'revision_requested' | 'pending_completion' | 'completed' | 'cancelled' | 'disputed';

interface RecentContractsProps {
  contracts: RecentContract[];
}

const getStatusBadge = (status: string | null) => {
  switch (status as ContractStatus) {
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

const getStatusIcon = (status: string | null) => {
  switch (status as ContractStatus) {
    case "draft":
      return <FileIcon className="h-5 w-5 text-muted-foreground" />;
    case "pending_signatures":
    case "pending_funding":
      return <SendIcon className="h-5 w-5 text-yellow-600" />;
    case "active":
    case "pending_delivery":
    case "in_review":
    case "pending_completion":
      return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
    case "completed":
      return <CheckCircleIcon className="h-5 w-5 text-green-600" />;
    case "cancelled":
      return <XCircleIcon className="h-5 w-5 text-red-500" />;
    case "disputed":
      return <XCircleIcon className="h-5 w-5 text-destructive" />;
    default:
      return <FileIcon className="h-5 w-5 text-muted-foreground" />;
  }
};

export function RecentContracts({ contracts }: RecentContractsProps) {
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
        {contracts.length > 0 ? (
          <div className="space-y-4">
            {contracts.map((contract) => (
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
