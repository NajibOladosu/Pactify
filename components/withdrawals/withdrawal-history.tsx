'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ArrowUpRight, 
  Search, 
  Filter, 
  MoreHorizontal,
  Copy,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';

interface PayoutItem {
  id: string;
  amount: number;
  currency: string;
  net_amount: number;
  status: string;
  rail: string;
  rail_name: string;
  method: {
    id: string;
    label: string;
    provider_name?: string;
    icon?: string;
    last_four?: string;
  };
  fees: {
    platform_fee: number;
    provider_fee: number;
    total_fees: number;
  };
  trace_id: string;
  provider_reference?: string;
  failure_reason?: string;
  requested_at: string;
  completed_at?: string;
  expected_arrival_date?: string;
  description?: string;
}

interface WithdrawalHistoryProps {
  currency: string;
  onCurrencyChange: (currency: string) => void;
  className?: string;
}

export function WithdrawalHistory({ 
  currency, 
  onCurrencyChange, 
  className 
}: WithdrawalHistoryProps) {
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const { toast } = useToast();

  const limit = 20;

  useEffect(() => {
    loadPayouts(true);
  }, [currency, statusFilter]);

  useEffect(() => {
    if (searchTerm) {
      const debounce = setTimeout(() => {
        loadPayouts(true);
      }, 500);
      return () => clearTimeout(debounce);
    }
  }, [searchTerm]);

  const loadPayouts = async (reset = false) => {
    const currentOffset = reset ? 0 : offset;
    setLoading(true);

    try {
      const params = new URLSearchParams({
        currency,
        limit: limit.toString(),
        offset: currentOffset.toString(),
      });

      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      const response = await fetch(`/api/withdrawals/history?${params}`);
      const data = await response.json();

      if (response.ok) {
        if (reset) {
          setPayouts(data.payouts);
          setOffset(data.payouts.length);
        } else {
          setPayouts(prev => [...prev, ...data.payouts]);
          setOffset(prev => prev + data.payouts.length);
        }
        setHasMore(data.pagination.has_more);
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to load withdrawal history',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error loading payouts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load withdrawal history',
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
    }).format(amount / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'requested': { variant: 'secondary' as const, label: 'Requested', color: 'bg-gray-100 text-gray-800' },
      'queued': { variant: 'secondary' as const, label: 'Queued', color: 'bg-blue-100 text-blue-800' },
      'processing': { variant: 'default' as const, label: 'Processing', color: 'bg-yellow-100 text-yellow-800' },
      'paid': { variant: 'default' as const, label: 'Paid', color: 'bg-green-100 text-green-800' },
      'failed': { variant: 'destructive' as const, label: 'Failed', color: 'bg-red-100 text-red-800' },
      'returned': { variant: 'destructive' as const, label: 'Returned', color: 'bg-orange-100 text-orange-800' },
      'cancelled': { variant: 'outline' as const, label: 'Cancelled', color: 'bg-gray-100 text-gray-600' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig['requested'];
    
    return (
      <Badge className={config.color}>
        {config.label}
      </Badge>
    );
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Copied',
        description: `${label} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  const filteredPayouts = payouts.filter(payout => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      payout.method.label.toLowerCase().includes(searchLower) ||
      payout.rail_name.toLowerCase().includes(searchLower) ||
      payout.trace_id.toLowerCase().includes(searchLower) ||
      payout.provider_reference?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header & Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                Withdrawal History
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => loadPayouts(true)}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </CardTitle>
              <CardDescription>Track all your withdrawal requests and their status.</CardDescription>
            </div>
            
            <div className="flex items-center gap-3">
              <Select value={currency} onValueChange={onCurrencyChange}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by method, rail, or reference..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        
        <CardContent>
          {loading && payouts.length === 0 ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="h-10 w-10 bg-gray-200 rounded-full animate-pulse" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                      <div className="h-3 w-48 bg-gray-200 rounded animate-pulse" />
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                    <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredPayouts.length > 0 ? (
            <div className="space-y-4">
              {filteredPayouts.map((payout) => (
                <div key={payout.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="p-2 rounded-full bg-muted">
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{payout.method.label}</span>
                        <span className="text-sm text-muted-foreground">
                          via {payout.rail_name}
                        </span>
                        {payout.method.icon && (
                          <span className="text-lg">{payout.method.icon}</span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <div className="flex items-center gap-4">
                          <span>
                            Requested {formatDate(payout.requested_at)}
                          </span>
                          {payout.completed_at && (
                            <span>
                              Completed {formatDate(payout.completed_at)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            ID: {payout.trace_id}
                          </span>
                          {payout.provider_reference && (
                            <span className="text-xs text-muted-foreground">
                              Ref: {payout.provider_reference}
                            </span>
                          )}
                        </div>
                      </div>
                      {payout.failure_reason && (
                        <div className="text-xs text-red-600 mt-1">
                          Failed: {payout.failure_reason}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right space-y-2">
                    <div className="space-y-1">
                      <div className="font-semibold text-red-600">
                        -{formatAmount(payout.amount)}
                      </div>
                      {payout.fees.total_fees > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Fee: {formatAmount(payout.fees.total_fees)}
                        </div>
                      )}
                      <div className="text-xs text-green-600">
                        Net: {formatAmount(payout.net_amount)}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {getStatusBadge(payout.status)}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => copyToClipboard(payout.trace_id, 'Transaction ID')}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy ID
                          </DropdownMenuItem>
                          {payout.provider_reference && (
                            <DropdownMenuItem
                              onClick={() => copyToClipboard(payout.provider_reference!, 'Provider Reference')}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Reference
                            </DropdownMenuItem>
                          )}
                          {payout.expected_arrival_date && (
                            <DropdownMenuItem disabled>
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Expected: {new Date(payout.expected_arrival_date).toLocaleDateString()}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Load More Button */}
              {hasMore && (
                <div className="text-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => loadPayouts(false)}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Load More'
                    )}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="bg-muted/30 p-4 rounded-full mb-4">
                <ArrowUpRight className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No withdrawals yet</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                {searchTerm || statusFilter !== 'all' 
                  ? 'No withdrawals match your current filters. Try adjusting your search or filter criteria.'
                  : 'You haven\'t made any withdrawals yet. Your withdrawal history will appear here once you start withdrawing funds.'
                }
              </p>
              {(searchTerm || statusFilter !== 'all') && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}