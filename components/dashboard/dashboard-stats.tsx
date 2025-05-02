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
  activeContractsCount: number; // Renamed from availableContracts
  maxContracts: number | null; // Can be null for unlimited
}

// Placeholder stats for parts not yet refactored
const placeholderStats = {
  pendingSignatures: 0, // TODO: Fetch real data
  pendingPayments: 0,   // TODO: Fetch real data
  clientCount: 0,       // TODO: Fetch real data
};

export function DashboardStats({
  userType,
  activeContractsCount,
  maxContracts,
}: DashboardStatsProps) {
  // The activeContractsCount is now passed directly as a prop.
  // Other stats are placeholders for now.

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
            <h3 className="text-2xl font-bold">{activeContractsCount}</h3>
            <Badge variant="outline" className="font-normal">
              {maxContracts === null ? (
                <>
                  <TrendingUpIcon className="mr-1 h-3 w-3 text-success" />
                  <span className="text-xs">Unlimited contracts</span>
                </>
              ) : (
                <>
                  <FileTextIcon className="mr-1 h-3 w-3" />
                  <span className="text-xs">
                    {activeContractsCount} / {maxContracts} used
                  </span>
                </>
              )}
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
            {/* Placeholder */}
            <h3 className="text-2xl font-bold">{placeholderStats.pendingSignatures}</h3>
            <Badge variant="outline" className="font-normal">
              <ClockIcon className="mr-1 h-3 w-3" />
              <span className="text-xs">
                {placeholderStats.pendingSignatures
                  ? `${placeholderStats.pendingSignatures} awaiting signature`
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
             {/* Placeholder */}
            <h3 className="text-2xl font-bold">${placeholderStats.pendingPayments}</h3>
            <Badge variant="outline" className="font-normal">
              <DollarSignIcon className="mr-1 h-3 w-3" />
              <span className="text-xs">
                {placeholderStats.pendingPayments
                  ? `${placeholderStats.pendingPayments} pending payments`
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
             {/* Placeholder */}
            <h3 className="text-2xl font-bold">{placeholderStats.clientCount}</h3>
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
