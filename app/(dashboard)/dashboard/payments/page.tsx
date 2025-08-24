"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCardIcon, ArrowUpRightIcon, ArrowDownLeftIcon, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { createClient } from "@/utils/supabase/client";

interface Payment {
  id: string;
  amount: number;
  net_amount: number;
  fee: number;
  currency: string;
  status: string;
  payment_type: string;
  completed_at: string;
  created_at: string;
  payer_id: string;
  payee_id: string;
  contract: {
    title: string;
  } | null;
  payer: {
    display_name: string;
  } | null;
  payee: {
    display_name: string;
  } | null;
}

interface PaymentStats {
  totalIncoming: number;
  totalOutgoing: number;
  totalPending: number;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<PaymentStats>({ totalIncoming: 0, totalOutgoing: 0, totalPending: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    try {
      const response = await fetch('/api/payments');
      const result = await response.json();

      if (!response.ok) {
        console.error('Error fetching payments:', result.error);
        return;
      }

      const paymentsData = result.payments || [];
      setCurrentUserId(result.user_id);
      setPayments(paymentsData);

      // Calculate stats
      const incoming = paymentsData
        .filter((p: any) => p.payee_id === result.user_id && p.status === 'released')
        .reduce((sum: number, p: any) => sum + Number(p.net_amount || p.amount), 0);

      const outgoing = paymentsData
        .filter((p: any) => p.payer_id === result.user_id && p.status === 'released')
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

      const pending = paymentsData
        .filter((p: any) => (p.payee_id === result.user_id || p.payer_id === result.user_id) && p.status === 'pending')
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

      setStats({ totalIncoming: incoming, totalOutgoing: outgoing, totalPending: pending });

    } catch (error) {
      console.error('Error loading payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPayments = payments.filter(payment => 
    payment.contract?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    payment.payer?.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    payment.payee?.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold">Payments</h1>
          <p className="text-muted-foreground mt-1">Track and manage contract payments.</p>
        </div>
        <Button>
          <CreditCardIcon className="mr-2 h-4 w-4" />
          Withdraw Funds
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-medium text-muted-foreground">Incoming</p>
              <ArrowDownLeftIcon className="h-5 w-5 text-green-500" />
            </div>
            <h3 className="text-2xl font-bold">${stats.totalIncoming.toFixed(2)}</h3>
            <p className="text-xs text-muted-foreground mt-1">Available for withdrawal</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-medium text-muted-foreground">Outgoing</p>
              <ArrowUpRightIcon className="h-5 w-5 text-red-500" />
            </div>
            <h3 className="text-2xl font-bold">${stats.totalOutgoing.toFixed(2)}</h3>
            <p className="text-xs text-muted-foreground mt-1">Sent to freelancers</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-medium text-muted-foreground">Pending</p>
              <CreditCardIcon className="h-5 w-5 text-amber-500" />
            </div>
            <h3 className="text-2xl font-bold">${stats.totalPending.toFixed(2)}</h3>
            <p className="text-xs text-muted-foreground mt-1">Awaiting release or payment</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>Transaction History</CardTitle>
            <div className="relative w-64">
              <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transactions..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <CardDescription>Track all your contract payments in one place.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            </div>
          ) : filteredPayments.length > 0 ? (
            <div className="space-y-4">
              {filteredPayments.map((payment) => {
                const isIncoming = currentUserId && payment.payee_id === currentUserId;
                const otherParty = isIncoming ? payment.payer : payment.payee;
                
                return (
                  <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className={`p-2 rounded-full ${
                        isIncoming ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                      }`}>
                        {isIncoming ? (
                          <ArrowDownLeftIcon className="h-4 w-4" />
                        ) : (
                          <ArrowUpRightIcon className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium">
                          {payment.contract?.title || 'Contract Payment'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {isIncoming ? 'From' : 'To'}: {otherParty?.display_name || 'Unknown User'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Type: {payment.payment_type === 'contract_release' ? 'Contract Payment' : payment.payment_type}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(payment.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold ${
                        isIncoming ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {isIncoming ? '+' : '-'}${(
                          isIncoming ? payment.net_amount || payment.amount : payment.amount
                        ).toFixed(2)}
                      </div>
                      <Badge variant={payment.status === 'released' ? 'default' : 'secondary'}>
                        {payment.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="bg-muted/30 p-4 rounded-full mb-4">
                <CreditCardIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No transactions yet</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                You haven't made any payments or received any funds yet. 
                Payments will appear here once you start sending or receiving money.
              </p>
              <Button variant="outline">
                View Payment Methods
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
