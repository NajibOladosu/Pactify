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
  dashboardStats?: {
    total_contracts: number;
    active_contracts: number;
    pending_signatures: number;
    completed_contracts: number;
    cancelled_contracts: number;
    pending_payments: number;
    total_revenue: number;
    avg_contract_value: number;
    contacts_count?: number;
  };
}

interface DashboardStatsData {
  pendingSignatures: number;
  pendingPayments: number;
  contactsCount: number;
  totalIncoming: number;
  totalOutgoing: number;
}

export function DashboardStats({
  userType,
  activeContractsCount,
  maxContracts,
  dashboardStats,
}: DashboardStatsProps) {
  const [stats, setStats] = useState<DashboardStatsData>({
    pendingSignatures: dashboardStats?.pending_signatures || 0,
    pendingPayments: dashboardStats?.pending_payments || 0,
    contactsCount: dashboardStats?.contacts_count || 0,
    totalIncoming: 0,
    totalOutgoing: 0,
  });
  const [loading, setLoading] = useState(!dashboardStats);

  useEffect(() => {
    console.log('[DASHBOARD STATS] Component mounted, starting fetch...');
    console.log('[DASHBOARD STATS] Server stats passed:', dashboardStats);
    
    async function fetchStats() {
      try {
        console.log('[DASHBOARD STATS] Fetching stats...');
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        console.log('[DASHBOARD STATS] Got user:', user?.id);
        if (!user) {
          console.log('[DASHBOARD STATS] No user found, aborting');
          return;
        }

        // Use server-side stats if available, otherwise calculate from contracts
        let pendingSignatures = dashboardStats?.pending_signatures || 0;
        let contactsCount = dashboardStats?.contacts_count || 0;
        let pendingPaymentsOld = dashboardStats?.pending_payments || 0;
        
        console.log('[DASHBOARD STATS] Initial values - pendingSignatures:', pendingSignatures, 'contactsCount:', contactsCount, 'pendingPaymentsOld:', pendingPaymentsOld);
        
        // If no server-side stats, calculate from contracts
        if (!dashboardStats) {
          console.log('[DASHBOARD STATS] No server stats, fetching contracts...');
          const contractsResponse = await supabase.rpc('get_user_contracts', { p_user_id: user.id });
          
          if (contractsResponse.data) {
            const contracts = contractsResponse.data;
            pendingSignatures = contracts.filter((c: any) => c.status === 'pending_signatures').length;
            pendingPaymentsOld = contracts
              .filter((c: any) => ['pending_funding', 'active', 'pending_delivery', 'in_review', 'revision_requested', 'pending_completion', 'disputed'].includes(c.status))
              .reduce((sum: number, c: any) => sum + (c.total_amount || 0), 0);

            // Count unique contacts
            const uniqueContacts = new Set();
            contracts.forEach((contract: any) => {
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
            contactsCount = uniqueContacts.size;
          }
        }
        
        console.log('[DASHBOARD STATS] About to fetch payments API...');
        // Always fetch payments data for accurate totals
        const paymentsResponse = await fetch('/api/payments');
        console.log('[DASHBOARD STATS] Payments response status:', paymentsResponse.status, paymentsResponse.ok);

        // Process payments data
        let totalIncoming = 0;
        let totalOutgoing = 0;
        let actualPendingPayments = 0;

        if (paymentsResponse.ok) {
          const paymentsData = await paymentsResponse.json();
          console.log('[DASHBOARD STATS] Payments response data:', paymentsData);
          
          if (paymentsData.success && paymentsData.payments) {
            const payments = paymentsData.payments;
            console.log('[DASHBOARD STATS] User ID:', user.id);
            console.log('[DASHBOARD STATS] Total payments count:', payments.length);
            console.log('[DASHBOARD STATS] First 3 payments:', payments.slice(0, 3));
            
            // Calculate incoming (where user is payee and payment is released)
            const incomingPayments = payments.filter((p: any) => {
              console.log('[DASHBOARD STATS] Checking incoming payment:', {
                payee_id: p.payee_id,
                user_id: user.id,
                status: p.status,
                amount: p.amount,
                net_amount: p.net_amount,
                matches: p.payee_id === user.id && p.status === 'released'
              });
              return p.payee_id === user.id && p.status === 'released';
            });
            totalIncoming = incomingPayments.reduce((sum: number, p: any) => {
              const amount = Number(p.net_amount || p.amount);
              console.log('[DASHBOARD STATS] Adding to incoming total:', amount, 'running total:', sum + amount);
              return sum + amount;
            }, 0);
            console.log('[DASHBOARD STATS] FINAL Incoming payments:', incomingPayments.length, 'Total incoming:', totalIncoming);

            // Calculate outgoing (where user is payer and payment is released)
            const outgoingPayments = payments.filter((p: any) => {
              console.log('[DASHBOARD STATS] Checking outgoing payment:', {
                payer_id: p.payer_id,
                user_id: user.id,
                status: p.status,
                amount: p.amount,
                matches: p.payer_id === user.id && p.status === 'released'
              });
              return p.payer_id === user.id && p.status === 'released';
            });
            totalOutgoing = outgoingPayments.reduce((sum: number, p: any) => {
              const amount = Number(p.amount);
              console.log('[DASHBOARD STATS] Adding to outgoing total:', amount, 'running total:', sum + amount);
              return sum + amount;
            }, 0);
            console.log('[DASHBOARD STATS] FINAL Outgoing payments:', outgoingPayments.length, 'Total outgoing:', totalOutgoing);

            // Calculate pending payments (where user is involved and payment is pending/funded)
            actualPendingPayments = payments
              .filter((p: any) => 
                (p.payee_id === user.id || p.payer_id === user.id) && 
                ['pending', 'funded'].includes(p.status)
              )
              .reduce((sum: number, p: any) => sum + Number(p.amount), 0);
          } else {
            console.log('[DASHBOARD STATS] Payments API returned unsuccessful response or no payments');
          }
        } else {
          console.log('[DASHBOARD STATS] Payments API call failed');
        }

        const finalStats = {
          pendingSignatures,
          pendingPayments: actualPendingPayments || pendingPaymentsOld,
          contactsCount,
          totalIncoming,
          totalOutgoing,
        };
        
        console.log('[DASHBOARD STATS] Setting final stats:', finalStats);
        setStats(finalStats);
      } catch (error) {
        console.error('[DASHBOARD STATS] Error fetching dashboard stats:', error);
      } finally {
        setLoading(false);
        console.log('[DASHBOARD STATS] Finished loading');
      }
    }

    fetchStats();
  }, [dashboardStats]);

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
              {userType === 'client' ? 'Total Sent' : 'Total Received'}
            </p>
            <div className="p-2 bg-accent-500/10 rounded-full">
              <CreditCardIcon className="h-5 w-5 text-accent-500" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-bold">
              {loading ? "..." : `$${(userType === 'client' ? stats.totalOutgoing : stats.totalIncoming).toLocaleString()}`}
            </h3>
            <Badge variant="outline" className="font-normal">
              <DollarSignIcon className="mr-1 h-3 w-3" />
              <span className="text-xs">
                {userType === 'client' 
                  ? (stats.totalOutgoing > 0 ? "total payments sent" : "No payments sent")
                  : (stats.totalIncoming > 0 ? "total received" : "No payments received")
                }
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
