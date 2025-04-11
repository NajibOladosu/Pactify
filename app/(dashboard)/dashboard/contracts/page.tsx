"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { PlusIcon, SearchIcon, FilterIcon, EyeIcon, TrashIcon, CheckCircleIcon, ClockIcon, XCircleIcon } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/components/ui/use-toast";

// This would normally come from database, for now we'll use localStorage to simulate backend
interface Contract {
  id: string;
  title: string;
  description: string;
  clientEmail: string;
  status: "draft" | "sent" | "signed" | "completed" | "cancelled";
  createdAt: string;
  template: string;
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Load contracts from localStorage
    const loadContracts = () => {
      const savedContracts = localStorage.getItem('contracts');
      if (savedContracts) {
        try {
          setContracts(JSON.parse(savedContracts));
        } catch (e) {
          console.error("Failed to parse contracts", e);
          setContracts([]);
        }
      }
    };

    loadContracts();

    // Listen for contract creation event
    const handleContractCreated = (event: StorageEvent) => {
      if (event.key === 'contracts') {
        loadContracts();
      }
    };

    window.addEventListener('storage', handleContractCreated);
    return () => {
      window.removeEventListener('storage', handleContractCreated);
    };
  }, []);

  const filteredContracts = contracts.filter(contract => {
    // Filter by search query
    const matchesSearch = 
      searchQuery === "" || 
      contract.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contract.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contract.clientEmail.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Filter by status
    const matchesStatus = 
      statusFilter === null || 
      contract.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleDeleteContract = (id: string) => {
    const updatedContracts = contracts.filter(contract => contract.id !== id);
    setContracts(updatedContracts);
    localStorage.setItem('contracts', JSON.stringify(updatedContracts));
    toast({
      title: "Contract deleted",
      description: "The contract has been deleted successfully.",
      variant: "default",
    });
  };

  const handleChangeStatus = (id: string, newStatus: "draft" | "sent" | "signed" | "completed" | "cancelled") => {
    const updatedContracts = contracts.map(contract => 
      contract.id === id ? { ...contract, status: newStatus } : contract
    );
    setContracts(updatedContracts);
    localStorage.setItem('contracts', JSON.stringify(updatedContracts));
    toast({
      title: "Status updated",
      description: `Contract status changed to ${newStatus}.`,
      variant: "default",
    });
  };

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

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">Contracts</h1>
          <p className="text-muted-foreground mt-1">Manage your contracts and agreements.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/contracts/new">
            <PlusIcon className="mr-2 h-4 w-4" />
            Create Contract
          </Link>
        </Button>
      </div>

      {/* Search and Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search contracts..." 
              className="w-full pl-9 pr-4 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Filter:</span>
            <div className="flex flex-wrap gap-2">
              <Badge 
                variant={statusFilter === null ? "default" : "outline"} 
                className="rounded-full px-3 cursor-pointer"
                onClick={() => setStatusFilter(null)}
              >
                All
              </Badge>
              
              <Badge 
                variant={statusFilter === "draft" ? "default" : "outline"} 
                className="rounded-full px-3 cursor-pointer"
                onClick={() => setStatusFilter("draft")}
              >
                Draft
              </Badge>
              
              <Badge 
                variant={statusFilter === "sent" ? "default" : "outline"} 
                className="rounded-full px-3 cursor-pointer"
                onClick={() => setStatusFilter("sent")}
              >
                Sent
              </Badge>
              
              <Badge 
                variant={statusFilter === "signed" ? "default" : "outline"} 
                className="rounded-full px-3 cursor-pointer"
                onClick={() => setStatusFilter("signed")}
              >
                Signed
              </Badge>
              
              <Badge 
                variant={statusFilter === "completed" ? "default" : "outline"} 
                className="rounded-full px-3 cursor-pointer"
                onClick={() => setStatusFilter("completed")}
              >
                Completed
              </Badge>
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
                        <h3 className="font-medium">{contract.title}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-1">{contract.description}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <div>
                        <span className="inline-block w-20 opacity-70">Client:</span>
                        <span>{contract.clientEmail}</span>
                      </div>
                      <div>
                        <span className="inline-block w-20 opacity-70">Created:</span>
                        <span>{new Date(contract.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div>
                        <span className="inline-block w-20 opacity-70">Template:</span>
                        <span>{contract.template}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="mr-6">
                      {getStatusBadge(contract.status)}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {contract.status === "draft" && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-blue-500 border-blue-200 hover:border-blue-300"
                          onClick={() => handleChangeStatus(contract.id, "sent")}
                        >
                          <ClockIcon className="mr-1 h-4 w-4" />
                          Send
                        </Button>
                      )}
                      
                      {contract.status === "sent" && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-green-500 border-green-200 hover:border-green-300"
                          onClick={() => handleChangeStatus(contract.id, "signed")}
                        >
                          <CheckCircleIcon className="mr-1 h-4 w-4" />
                          Mark Signed
                        </Button>
                      )}
                      
                      {contract.status === "signed" && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-green-600 border-green-300 hover:border-green-400"
                          onClick={() => handleChangeStatus(contract.id, "completed")}
                        >
                          <CheckCircleIcon className="mr-1 h-4 w-4" />
                          Complete
                        </Button>
                      )}
                      
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
                        className="text-red-500 border-red-200 hover:border-red-300 hover:bg-red-50"
                        onClick={() => handleDeleteContract(contract.id)}
                      >
                        <TrashIcon className="mr-1 h-4 w-4" />
                        Delete
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
              : "You haven't created any contracts yet. Create your first contract to get started."}
          </p>
          <Button asChild>
            <Link href="/dashboard/contracts/new">
              <PlusIcon className="mr-2 h-4 w-4" />
              Create Your First Contract
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
