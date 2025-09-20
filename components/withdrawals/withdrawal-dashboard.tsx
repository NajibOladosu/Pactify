'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DollarSign, 
  TrendingUp, 
  Clock, 
  CreditCard, 
  Plus, 
  ArrowUpRight,
  AlertCircle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';
import { WithdrawDialog } from './withdraw-dialog';
import { WithdrawalHistory } from './withdrawal-history';
import { WithdrawalMethods } from './withdrawal-methods';
import { useToast } from '@/components/ui/use-toast';

interface WalletStats {
  available_balance: number;
  pending_balance: number;
  total_earned: number;
  total_withdrawn: number;
  pending_payouts: number;
  successful_payouts: number;
  failed_payouts: number;
}

interface WithdrawalDashboardProps {
  className?: string;
}

export function WithdrawalDashboard({ className }: WithdrawalDashboardProps) {
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isWithdrawDialogOpen, setIsWithdrawDialogOpen] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const { toast } = useToast();

  useEffect(() => {
    loadStats();
  }, [currency]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/withdrawals/history?currency=${currency}&limit=1`);
      const data = await response.json();
      
      if (response.ok && data.stats) {
        setStats(data.stats);
      } else {
        console.error('Failed to load wallet stats:', data.error);
      }
    } catch (error) {
      console.error('Error loading wallet stats:', error);
      toast({
        title: 'Error',
        description: 'Failed to load wallet information',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount / 100); // Convert from minor units
  };

  if (loading && !stats) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-serif font-bold">Withdrawals</h1>
            <p className="text-muted-foreground mt-1">Manage your earnings and payout methods.</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-2" />
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse mb-1" />
                <div className="h-3 w-32 bg-gray-200 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const availableBalance = stats?.available_balance || 0;
  const pendingBalance = stats?.pending_balance || 0;
  const totalEarned = stats?.total_earned || 0;
  const totalWithdrawn = stats?.total_withdrawn || 0;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">Withdrawals</h1>
          <p className="text-muted-foreground mt-1">Manage your earnings and payout methods.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadStats}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <WithdrawDialog
            isOpen={isWithdrawDialogOpen}
            onOpenChange={setIsWithdrawDialogOpen}
            availableBalance={availableBalance}
            currency={currency}
            onSuccess={loadStats}
            trigger={
              <Button
                disabled={availableBalance <= 0}
                className="bg-green-600 hover:bg-green-700"
              >
                <ArrowUpRight className="h-4 w-4 mr-2" />
                Withdraw Funds
              </Button>
            }
          />
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-medium text-muted-foreground">Available Balance</p>
              <DollarSign className="h-5 w-5 text-green-500" />
            </div>
            <h3 className="text-2xl font-bold text-green-600">{formatAmount(availableBalance)}</h3>
            <p className="text-xs text-muted-foreground mt-1">Ready to withdraw</p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-medium text-muted-foreground">Pending</p>
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <h3 className="text-2xl font-bold text-amber-600">{formatAmount(pendingBalance)}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.pending_payouts || 0} payout{stats?.pending_payouts !== 1 ? 's' : ''} processing
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-medium text-muted-foreground">Total Earned</p>
              <TrendingUp className="h-5 w-5 text-blue-500" />
            </div>
            <h3 className="text-2xl font-bold text-blue-600">{formatAmount(totalEarned)}</h3>
            <p className="text-xs text-muted-foreground mt-1">All-time earnings</p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-medium text-muted-foreground">Total Withdrawn</p>
              <CreditCard className="h-5 w-5 text-purple-500" />
            </div>
            <h3 className="text-2xl font-bold text-purple-600">{formatAmount(totalWithdrawn)}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.successful_payouts || 0} successful payout{stats?.successful_payouts !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alert for failed payouts */}
      {stats && stats.failed_payouts > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-900">
                {stats.failed_payouts} Failed Payout{stats.failed_payouts !== 1 ? 's' : ''}
              </h4>
              <p className="text-sm text-red-700 mt-1">
                Some of your recent withdrawals have failed. Check your withdrawal history for details.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="history" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="history">Withdrawal History</TabsTrigger>
          <TabsTrigger value="methods">Payout Methods</TabsTrigger>
        </TabsList>
        
        <TabsContent value="history" className="space-y-4">
          <WithdrawalHistory 
            currency={currency}
            onCurrencyChange={setCurrency}
          />
        </TabsContent>
        
        <TabsContent value="methods" className="space-y-4">
          <WithdrawalMethods 
            currency={currency}
            onMethodAdded={loadStats}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}