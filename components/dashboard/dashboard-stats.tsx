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
import { createClient } from "@/utils/supabase/client";

interface DashboardStatsProps {
  userType: string;
  activeContractsCount: number;
  maxContracts: number | null;
}

interface DashboardStatsData {
  pendingSignatures: number;
  pendingPayments: number;
  contactsCount: number;
}

export function DashboardStats({
  userType,
  activeContractsCount,
  maxContracts,
}: DashboardStatsProps) {
  const [stats, setStats] = useState<DashboardStatsData>({
    pendingSignatures: 0,
    pendingPayments: 0,
    contactsCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) return;

        // Fetch contracts data to calculate stats
        const { data: contracts } = await supabase
          .from('contracts')
          .select('status, total_amount, creator_id, client_id, freelancer_id')
          .or(`creator_id.eq.${user.id},client_id.eq.${user.id},freelancer_id.eq.${user.id}`);

        if (contracts) {
          const pendingSignatures = contracts.filter(c => c.status === 'pending_signatures').length;
          const pendingPayments = contracts
            .filter(c => ['pending_funding', 'active', 'pending_delivery', 'in_review', 'revision_requested', 'pending_completion'].includes(c.status))
            .reduce((sum, c) => sum + (c.total_amount || 0), 0);

          // Count unique contacts
          const uniqueContacts = new Set();
          contracts.forEach(contract => {
            if (contract.creator_id === user.id) {
              if (contract.client_id) uniqueContacts.add(contract.client_id);
              if (contract.freelancer_id) uniqueContacts.add(contract.freelancer_id);
            } else if (contract.client_id === user.id) {
              if (contract.creator_id) uniqueContacts.add(contract.creator_id);
              if (contract.freelancer_id) uniqueContacts.add(contract.freelancer_id);
            } else if (contract.freelancer_id === user.id) {
              if (contract.creator_id) uniqueContacts.add(contract.creator_id);
              if (contract.client_id) uniqueContacts.add(contract.client_id);
            }
          });

          setStats({
            pendingSignatures,
            pendingPayments,
            contactsCount: uniqueContacts.size,
          });
        }
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
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
            <h3 className="text-2xl font-bold">
              {loading ? "..." : stats.pendingSignatures}
            </h3>
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
            <h3 className="text-2xl font-bold">
              {loading ? "..." : `$${stats.pendingPayments.toLocaleString()}`}
            </h3>
            <Badge variant="outline" className="font-normal">
              <DollarSignIcon className="mr-1 h-3 w-3" />
              <span className="text-xs">
                {stats.pendingPayments > 0
                  ? "pending payments"
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
            <h3 className="text-2xl font-bold">
              {loading ? "..." : stats.contactsCount}
            </h3>
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
