// Optimized transaction history with virtual scrolling and infinite loading

'use client';

import React, { memo, useMemo, useCallback, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { FixedSizeList as List } from 'react-window';
import InfiniteLoader from 'react-window-infinite-loader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ArrowUpRight, 
  Clock, 
  CheckCircle, 
  XCircle,
  Search,
  Filter,
  Download
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Transaction {
  id: string;
  amount: number;
  currency: string;
  net_amount: number;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';
  rail: string;
  rail_name: string;
  method: {
    label: string;
    provider_name: string;
    icon: string;
    last_four: string;
  };
  fees: {
    platform_fee: number;
    provider_fee: number;
    total_fees: number;
  };
  created_at: string;
  completed_at?: string;
  failure_reason?: string;
}

// Memoized transaction row component
const TransactionRow = memo(({ 
  transaction, 
  style 
}: { 
  transaction: Transaction;
  style?: React.CSSProperties;
}) => {
  const statusConfig = useMemo(() => {
    const configs = {
      pending: { 
        icon: Clock, 
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        label: 'Pending'
      },
      processing: { 
        icon: Clock, 
        color: 'bg-blue-100 text-blue-800 border-blue-200',
        label: 'Processing'
      },
      paid: { 
        icon: CheckCircle, 
        color: 'bg-green-100 text-green-800 border-green-200',
        label: 'Completed'
      },
      failed: { 
        icon: XCircle, 
        color: 'bg-red-100 text-red-800 border-red-200',
        label: 'Failed'
      },
      cancelled: { 
        icon: XCircle, 
        color: 'bg-gray-100 text-gray-800 border-gray-200',
        label: 'Cancelled'
      }
    };
    return configs[transaction.status] || configs.pending;
  }, [transaction.status]);

  const StatusIcon = statusConfig.icon;

  return (
    <div style={style} className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <ArrowUpRight className="h-5 w-5 text-blue-600" />
          </div>
          
          <div>
            <div className="flex items-center space-x-2">
              <p className="font-medium text-gray-900">
                {formatCurrency(transaction.amount, transaction.currency)}
              </p>
              <Badge variant="outline" className={statusConfig.color}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusConfig.label}
              </Badge>
            </div>
            
            <div className="flex items-center space-x-1 text-sm text-gray-500">
              <span>via {transaction.method.provider_name}</span>
              {transaction.method.last_four && (
                <>
                  <span>•</span>
                  <span>••••{transaction.method.last_four}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="font-medium text-gray-900">
            {formatCurrency(transaction.net_amount, transaction.currency)}
          </div>
          <div className="text-sm text-gray-500">
            {formatDate(transaction.created_at)}
          </div>
          {transaction.fees.total_fees > 0 && (
            <div className="text-xs text-gray-400">
              Fee: {formatCurrency(transaction.fees.total_fees, transaction.currency)}
            </div>
          )}
        </div>
      </div>

      {transaction.failure_reason && (
        <div className="mt-2 text-sm text-red-600">
          {transaction.failure_reason}
        </div>
      )}
    </div>
  );
});

TransactionRow.displayName = 'TransactionRow';

// Loading skeleton row
const LoadingRow = memo(({ style }: { style?: React.CSSProperties }) => (
  <div style={style} className="px-4 py-3 border-b border-gray-100">
    <div className="flex items-center justify-between animate-pulse">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full bg-gray-200" />
        <div>
          <div className="h-4 bg-gray-200 rounded w-24 mb-2" />
          <div className="h-3 bg-gray-200 rounded w-32" />
        </div>
      </div>
      <div className="text-right">
        <div className="h-4 bg-gray-200 rounded w-16 mb-2" />
        <div className="h-3 bg-gray-200 rounded w-20" />
      </div>
    </div>
  </div>
));

LoadingRow.displayName = 'LoadingRow';

// Main optimized transaction history component
const OptimizedTransactionHistory = memo(({ 
  userId 
}: { 
  userId: string;
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currencyFilter, setCurrencyFilter] = useState('USD');

  // Infinite query for transactions
  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['transactions', userId, statusFilter, currencyFilter, searchTerm],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        limit: '50',
        offset: pageParam.toString(),
        currency: currencyFilter
      });
      
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const response = await fetch(`/api/withdrawals/history?${params}`);
      const result = await response.json();
      return result.data;
    },
    getNextPageParam: (lastPage, pages) => {
      const totalLoaded = pages.reduce((sum, page) => sum + page.payouts.length, 0);
      return lastPage.pagination.has_more ? totalLoaded : undefined;
    },
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false
  });

  // Flatten all transactions
  const transactions = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap(page => page.payouts);
  }, [data]);

  // Filter transactions by search term
  const filteredTransactions = useMemo(() => {
    if (!searchTerm) return transactions;
    
    const term = searchTerm.toLowerCase();
    return transactions.filter(transaction => 
      transaction.method.provider_name.toLowerCase().includes(term) ||
      transaction.method.label.toLowerCase().includes(term) ||
      transaction.rail_name.toLowerCase().includes(term) ||
      transaction.status.toLowerCase().includes(term)
    );
  }, [transactions, searchTerm]);

  // Check if item is loaded
  const isItemLoaded = useCallback((index: number) => {
    return index < filteredTransactions.length;
  }, [filteredTransactions]);

  // Load more items
  const loadMoreItems = useCallback(async () => {
    if (hasNextPage && !isFetchingNextPage) {
      await fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Render item function for virtual list
  const renderItem = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    if (index >= filteredTransactions.length) {
      return <LoadingRow style={style} />;
    }

    const transaction = filteredTransactions[index];
    return <TransactionRow key={transaction.id} transaction={transaction} style={style} />;
  }, [filteredTransactions]);

  const itemCount = hasNextPage 
    ? filteredTransactions.length + 1 
    : filteredTransactions.length;

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search transactions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="paid">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USD">USD</SelectItem>
            <SelectItem value="EUR">EUR</SelectItem>
            <SelectItem value="GBP">GBP</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Transaction list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Recent Transactions</span>
            {isFetching && !isFetchingNextPage && (
              <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-4 text-center text-red-600">
              Error loading transactions. Please try again.
            </div>
          ) : filteredTransactions.length === 0 && !isFetching ? (
            <div className="p-8 text-center text-gray-500">
              <div className="mb-4">
                <ArrowUpRight className="h-12 w-12 mx-auto text-gray-300" />
              </div>
              <h3 className="font-medium mb-1">No transactions found</h3>
              <p className="text-sm">Try adjusting your filters or make your first withdrawal.</p>
            </div>
          ) : (
            <div className="h-96"> {/* Fixed height for virtual scrolling */}
              <InfiniteLoader
                isItemLoaded={isItemLoaded}
                itemCount={itemCount}
                loadMoreItems={loadMoreItems}
              >
                {({ onItemsRendered, ref }) => (
                  <List
                    ref={ref}
                    height={384} // 96 * 4 (h-96)
                    itemCount={itemCount}
                    itemSize={80}
                    onItemsRendered={onItemsRendered}
                    width="100%"
                  >
                    {renderItem}
                  </List>
                )}
              </InfiniteLoader>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

OptimizedTransactionHistory.displayName = 'OptimizedTransactionHistory';

export default OptimizedTransactionHistory;