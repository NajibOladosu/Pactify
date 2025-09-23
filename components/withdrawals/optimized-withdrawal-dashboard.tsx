// Optimized withdrawal dashboard with React.memo, lazy loading, and virtual scrolling

'use client';

import React, { memo, useMemo, useCallback, useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DollarSign, 
  Clock, 
  TrendingUp, 
  ArrowUpRight,
  Plus,
  RefreshCw,
  Download,
  Filter
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';

// Lazy load heavy components
const WithdrawDialog = dynamic(() => import('./withdraw-dialog').then(mod => ({ default: mod.WithdrawDialog })), {
  loading: () => <div className="animate-pulse h-8 bg-gray-200 rounded" />
});

const WithdrawalMethodsManager = dynamic(() => import('./withdrawal-methods-manager').then(mod => ({ default: mod.WithdrawalMethodsManager })), {
  loading: () => <div className="animate-pulse h-32 bg-gray-200 rounded" />
});

const TransactionHistory = dynamic(() => import('./optimized-transaction-history'), {
  loading: () => <div className="animate-pulse h-64 bg-gray-200 rounded" />
});

// Memoized balance card component
const BalanceCard = memo(({ 
  title, 
  amount, 
  currency, 
  subtitle, 
  icon: Icon, 
  trend,
  loading = false 
}: {
  title: string;
  amount: number;
  currency: string;
  subtitle?: string;
  icon: React.ElementType;
  trend?: { value: number; label: string };
  loading?: boolean;
}) => {
  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="animate-pulse h-4 bg-gray-200 rounded w-20" />
          <div className="animate-pulse h-4 w-4 bg-gray-200 rounded" />
        </CardHeader>
        <CardContent>
          <div className="animate-pulse h-8 bg-gray-200 rounded w-24 mb-2" />
          <div className="animate-pulse h-3 bg-gray-200 rounded w-16" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {formatCurrency(amount, currency)}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">
            {subtitle}
          </p>
        )}
        {trend && (
          <div className="flex items-center text-xs text-green-600 mt-1">
            <TrendingUp className="h-3 w-3 mr-1" />
            {trend.value > 0 ? '+' : ''}{trend.value}% {trend.label}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

BalanceCard.displayName = 'BalanceCard';

// Memoized quick action component
const QuickAction = memo(({ 
  title, 
  description, 
  onClick, 
  icon: Icon, 
  variant = "outline" 
}: {
  title: string;
  description: string;
  onClick: () => void;
  icon: React.ElementType;
  variant?: "outline" | "default";
}) => (
  <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
    <CardContent className="flex items-center p-4">
      <div className="rounded-full bg-blue-100 p-2 mr-3">
        <Icon className="h-5 w-5 text-blue-600" />
      </div>
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ArrowUpRight className="h-4 w-4 ml-auto text-muted-foreground" />
    </CardContent>
  </Card>
));

QuickAction.displayName = 'QuickAction';

// Main optimized dashboard component
export const OptimizedWithdrawalDashboard = memo(({ 
  userId, 
  initialData 
}: { 
  userId: string;
  initialData?: any;
}) => {
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [showMethodsManager, setShowMethodsManager] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);

  // Optimized data fetching with React Query
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['withdrawal-stats', userId],
    queryFn: async () => {
      const response = await fetch(`/api/withdrawals/history?limit=1`);
      const data = await response.json();
      return data.data?.stats;
    },
    initialData: initialData?.stats,
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: false
  });

  const { data: methods, isLoading: methodsLoading } = useQuery({
    queryKey: ['withdrawal-methods', userId],
    queryFn: async () => {
      const response = await fetch('/api/withdrawals/methods');
      const data = await response.json();
      return data.data?.methods || [];
    },
    staleTime: 300000, // 5 minutes
    refetchOnWindowFocus: false
  });

  // Memoized balance calculations
  const balanceData = useMemo(() => {
    if (!stats) return null;

    return [
      {
        title: "Available Balance",
        amount: (stats.available_balance || 0) / 100, // Convert from minor units
        currency: "USD",
        subtitle: "Ready to withdraw",
        icon: DollarSign,
        trend: { value: 12.5, label: "this month" }
      },
      {
        title: "Pending Balance",
        amount: (stats.pending_balance || 0) / 100,
        currency: "USD", 
        subtitle: "Being processed",
        icon: Clock
      },
      {
        title: "Total Earned",
        amount: (stats.total_earned || 0) / 100,
        currency: "USD",
        subtitle: "All time earnings",
        icon: TrendingUp,
        trend: { value: 8.2, label: "vs last month" }
      }
    ];
  }, [stats]);

  // Optimized refresh handler
  const handleRefresh = useCallback(() => {
    startTransition(() => {
      setRefreshing(true);
      Promise.all([
        refetchStats(),
        // Add other refresh operations
      ]).finally(() => {
        setRefreshing(false);
      });
    });
  }, [refetchStats]);

  // Memoized quick actions
  const quickActions = useMemo(() => [
    {
      title: "Withdraw Funds",
      description: "Transfer money to your account",
      onClick: () => setShowWithdrawDialog(true),
      icon: ArrowUpRight
    },
    {
      title: "Add Payment Method",
      description: "Connect bank or digital wallet",
      onClick: () => setShowMethodsManager(true),
      icon: Plus
    },
    {
      title: "Download Statement",
      description: "Get transaction history PDF",
      onClick: () => window.open('/api/withdrawals/statement', '_blank'),
      icon: Download
    }
  ], []);

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Withdrawals</h1>
          <p className="text-muted-foreground">
            Manage your earnings and payment methods
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Balance cards - memoized grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {balanceData ? balanceData.map((balance, index) => (
          <BalanceCard key={index} {...balance} />
        )) : (
          // Loading skeleton
          Array.from({ length: 3 }).map((_, i) => (
            <BalanceCard
              key={i}
              title=""
              amount={0}
              currency="USD"
              icon={DollarSign}
              loading={true}
            />
          ))
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {quickActions.map((action, index) => (
            <QuickAction key={index} {...action} />
          ))}
        </div>
      </div>

      <Separator />

      {/* Tabbed content with lazy loading */}
      <Tabs defaultValue="history" className="space-y-4">
        <TabsList>
          <TabsTrigger value="history">Transaction History</TabsTrigger>
          <TabsTrigger value="methods">Payment Methods</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          <TransactionHistory userId={userId} />
        </TabsContent>

        <TabsContent value="methods" className="space-y-4">
          <WithdrawalMethodsManager 
            userId={userId} 
            methods={methods}
            loading={methodsLoading}
          />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Analytics Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Withdrawal analytics and insights coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Lazy loaded dialogs */}
      {showWithdrawDialog && (
        <WithdrawDialog
          isOpen={showWithdrawDialog}
          onOpenChange={setShowWithdrawDialog}
          availableBalance={(stats?.available_balance || 0) / 100}
          currency="USD"
          onSuccess={() => {
            setShowWithdrawDialog(false);
            // Refetch stats
            refetchStats();
          }}
          trigger={null}
        />
      )}
    </div>
  );
});

OptimizedWithdrawalDashboard.displayName = 'OptimizedWithdrawalDashboard';