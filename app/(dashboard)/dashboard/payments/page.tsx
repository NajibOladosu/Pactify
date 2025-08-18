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

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    try {
      const supabase = createClient();
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch payments where user is either payer or payee
      const { data: paymentsData, error } = await supabase
        .from('payments')
        .select(`
          *,
          contract:contracts(title),
          payer:profiles!payer_id(display_name),
          payee:profiles!payee_id(display_name)
        `)
        .or(`payer_id.eq.${user.id},payee_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching payments:', error);
        return;
      }

      setPayments(paymentsData || []);

      // Calculate stats
      const incoming = paymentsData
        ?.filter(p => p.payee_id === user.id && p.status === 'released')
        .reduce((sum, p) => sum + Number(p.net_amount || p.amount), 0) || 0;

      const outgoing = paymentsData
        ?.filter(p => p.payer_id === user.id && p.status === 'released')
        .reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      const pending = paymentsData
        ?.filter(p => (p.payee_id === user.id || p.payer_id === user.id) && p.status === 'pending')
        .reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      setStats({ totalIncoming: incoming, totalOutgoing: outgoing, totalPending: pending });

    } catch (error) {
      console.error('Error loading payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPayments = payments.filter(payment => 
    payment.contractTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
    payment.clientName.toLowerCase().includes(searchTerm.toLowerCase())
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
            <h3 className="text-2xl font-bold">$0.00</h3>
            <p className="text-xs text-muted-foreground mt-1">Available for withdrawal</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-medium text-muted-foreground">Outgoing</p>
              <ArrowUpRightIcon className="h-5 w-5 text-red-500" />
            </div>
            <h3 className="text-2xl font-bold">$0.00</h3>
            <p className="text-xs text-muted-foreground mt-1">Sent to freelancers</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-medium text-muted-foreground">Pending</p>
              <CreditCardIcon className="h-5 w-5 text-amber-500" />
            </div>
            <h3 className="text-2xl font-bold">$0.00</h3>
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
              {/* Payments list would go here */}
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
