"use client";

import { useEffect, useState } from "react";
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

interface Contract {
  id: string;
  title: string;
  description: string;
  clientEmail: string;
  price?: string;
  currency?: string;
  paymentType?: string;
  status: "draft" | "sent" | "signed" | "completed" | "cancelled";
  createdAt: string;
  template: string;
}

export function RecentContracts() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadContracts = () => {
      setLoading(true);
      try {
        const savedContracts = localStorage.getItem('contracts');
        if (savedContracts) {
          const allContracts: Contract[] = JSON.parse(savedContracts);
          
          // Sort by creation date (newest first) and take the top 5
          const sortedContracts = [...allContracts].sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          ).slice(0, 5);
          
          setContracts(sortedContracts);
        }
      } catch (e) {
        console.error("Failed to load contracts", e);
      } finally {
        setLoading(false);
      }
    };

    loadContracts();
    
    // Listen for storage events to update the contracts list when it changes
    const handleStorageChange = () => loadContracts();
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="bg-muted text-muted-foreground">Draft</Badge>;
      case "sent":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-200">Sent</Badge>;
      case "signed":
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-200">Signed</Badge>;
      case "completed":
        return <Badge variant="outline" className="bg-green-500/20 text-green-600 border-green-300">Completed</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-200">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "draft":
        return <FileIcon className="h-5 w-5 text-muted-foreground" />;
      case "sent":
        return <SendIcon className="h-5 w-5 text-blue-500" />;
      case "signed":
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case "completed":
        return <CheckCircleIcon className="h-5 w-5 text-green-600" />;
      case "cancelled":
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      default:
        return <FileIcon className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recent Contracts</CardTitle>
          <CardDescription>Your recently created or signed contracts.</CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/contracts">
            View all<ArrowRightIcon className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          </div>
        ) : contracts.length > 0 ? (
          <div className="space-y-4">
            {contracts.map((contract) => (
              <div key={contract.id} className="flex items-start p-3 rounded-lg border hover:bg-muted/20 transition-colors">
                <div className="mr-4 mt-0.5">
                  {getStatusIcon(contract.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <Link href={`/dashboard/contracts/${contract.id}`} className="text-sm font-medium hover:underline truncate">
                      {contract.title}
                    </Link>
                    <div className="ml-2 flex-shrink-0">
                      {getStatusBadge(contract.status)}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center text-xs text-muted-foreground">
                    <ClockIcon className="mr-1 h-3 w-3" />
                    Created {new Date(contract.createdAt).toLocaleDateString()}
                    <span className="mx-2">•</span>
                    <span className="truncate">{contract.clientEmail}</span>
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
              Create your first contract by clicking the button below.
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
