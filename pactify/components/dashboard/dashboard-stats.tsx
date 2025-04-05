"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { 
  FileTextIcon, 
  TrendingUpIcon, 
  ClockIcon, 
  CreditCardIcon, 
  DollarSignIcon, 
  UserCheckIcon,
  PlusIcon
} from "lucide-react";

interface DashboardStatsProps {
  userType: string;
  availableContracts?: number;
}

interface Contract {
  id: string;
  status: string;
  [key: string]: any;
}

export function DashboardStats({ userType, availableContracts = 3 }: DashboardStatsProps) {
  const [stats, setStats] = useState({
    activeContracts: 0,
    pendingSignatures: 0,
    pendingPayments: 0,
    clientCount: 0,
  });

  useEffect(() => {
    const loadStats = () => {
      try {
        // Load contracts from localStorage
        const savedContracts = localStorage.getItem('contracts');
        const contracts: Contract[] = savedContracts ? JSON.parse(savedContracts) : [];
        
        // Calculate stats
        const activeContracts = contracts.filter(c => 
          c.status === "draft" || c.status === "sent" || c.status === "signed"
        ).length;
        
        const pendingSignatures = contracts.filter(c => c.status === "sent").length;
        
        // Get unique clients/freelancers
        const uniqueEmails = new Set(
          contracts.map(c => c.clientEmail).filter(Boolean)
        );
        
        setStats({
          activeContracts,
          pendingSignatures,
          pendingPayments: 0, // Would come from a real payments system
          clientCount: uniqueEmails.size,
        });
      } catch (e) {
        console.error("Failed to load dashboard stats", e);
      }
    };

    loadStats();
    
    // Listen for storage events to update the stats when contracts change
    const handleStorageChange = () => loadStats();
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-muted-foreground">Active Contracts</p>
            <div className="p-2 bg-primary-500/10 rounded-full">
              <FileTextIcon className="h-5 w-5 text-primary-500" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-bold">{stats.activeContracts}</h3>
            <Badge variant="outline" className="font-normal">
              <TrendingUpIcon className="mr-1 h-3 w-3" />
              <span className="text-xs">Free plan: {availableContracts - stats.activeContracts} remaining</span>
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-muted-foreground">Pending Signatures</p>
            <div className="p-2 bg-secondary-500/10 rounded-full">
              <UserCheckIcon className="h-5 w-5 text-secondary-500" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-bold">{stats.pendingSignatures}</h3>
            <Badge variant="outline" className="font-normal">
              <ClockIcon className="mr-1 h-3 w-3" />
              <span className="text-xs">
                {stats.pendingSignatures 
                  ? `${stats.pendingSignatures} awaiting signature`
                  : "No pending signatures"}
              </span>
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-muted-foreground">
              {userType === 'client' ? 'Outgoing Payments' : 'Incoming Payments'}
            </p>
            <div className="p-2 bg-accent-500/10 rounded-full">
              <CreditCardIcon className="h-5 w-5 text-accent-500" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-bold">${stats.pendingPayments}</h3>
            <Badge variant="outline" className="font-normal">
              <DollarSignIcon className="mr-1 h-3 w-3" />
              <span className="text-xs">
                {stats.pendingPayments 
                  ? `${stats.pendingPayments} pending payments`
                  : "No active payments"}
              </span>
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-muted-foreground">
              {userType === 'client' ? 'Freelancers' : 'Clients'}
            </p>
            <div className="p-2 bg-success/10 rounded-full">
              <UserCheckIcon className="h-5 w-5 text-success" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-bold">{stats.clientCount}</h3>
            <Badge variant="outline" className="font-normal">
              <PlusIcon className="mr-1 h-3 w-3" />
              <span className="text-xs">Add new contact</span>
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
