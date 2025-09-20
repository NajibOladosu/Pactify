"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCardIcon, ArrowUpRightIcon, ArrowDownLeftIcon, SearchIcon, Shield, DollarSign } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/components/ui/use-toast";
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

interface ExternalAccount {
  id: string;
  type: 'bank_account' | 'card';
  display_name: string;
  description: string;
  supports_standard_payouts: boolean;
  supports_instant_payouts: boolean;
  currency: string;
  country: string;
  last4: string;
  default_for_currency: boolean;
  provider?: string; // e.g., "Visa", "Mastercard", "Chase Bank"
  processing_time: string;
  fee: string;
  icon?: string;
}

interface KYCStatus {
  hasAccount: boolean;
  status: 'verified' | 'pending' | 'action_required' | 'onboarding_required' | 'not_created';
  account?: {
    payouts_enabled: boolean;
    verification_status: {
      is_verified: boolean;
      can_receive_payouts: boolean;
    };
  };
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<PaymentStats>({ totalIncoming: 0, totalOutgoing: 0, totalPending: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<KYCStatus | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState<string>('');
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [externalAccounts, setExternalAccounts] = useState<ExternalAccount[]>([]);
  const [selectedPayoutMethod, setSelectedPayoutMethod] = useState<string>('');
  const [payoutType, setPayoutType] = useState<'standard' | 'instant'>('standard');
  
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    loadPayments();
    loadKYCStatus();
    loadExternalAccounts();
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

  const loadKYCStatus = async () => {
    try {
      const response = await fetch('/api/connect/account-status');
      const result = await response.json();

      if (response.ok) {
        setKycStatus(result);
      }
    } catch (error) {
      console.error('Error loading KYC status:', error);
    }
  };

  const loadExternalAccounts = async () => {
    try {
      const response = await fetch('/api/connect/external-accounts');
      const result = await response.json();

      if (response.ok) {
        setExternalAccounts(result.external_accounts);
        // Set default selected account to the first available account
        if (result.external_accounts.length > 0) {
          const defaultAccount = result.external_accounts.find((acc: ExternalAccount) => acc.default_for_currency) || result.external_accounts[0];
          setSelectedPayoutMethod(defaultAccount.id);
          // Set default payout type based on account capabilities
          setPayoutType(defaultAccount.supports_instant_payouts ? 'instant' : 'standard');
        }
      }
    } catch (error) {
      console.error('Error loading external accounts:', error);
    }
  };

  const handleWithdrawClick = () => {
    if (!kycStatus) {
      toast({
        title: 'Error',
        description: 'Unable to check account verification status',
        variant: 'destructive',
      });
      return;
    }

    // Check if KYC is verified
    if (!kycStatus.hasAccount || !kycStatus.account?.verification_status?.is_verified) {
      toast({
        title: 'Verification Required',
        description: 'You need to complete account verification before withdrawing funds',
        variant: 'destructive',
      });
      
      // Redirect to verification tab
      router.push('/dashboard/settings?tab=verification');
      return;
    }

    if (!kycStatus.account?.payouts_enabled || !kycStatus.account?.verification_status?.can_receive_payouts) {
      toast({
        title: 'Withdrawals Not Available',
        description: 'Your account is not yet enabled for payouts. Please contact support.',
        variant: 'destructive',
      });
      return;
    }

    if (stats.totalIncoming <= 0) {
      toast({
        title: 'No Funds Available',
        description: 'You have no available balance to withdraw',
        variant: 'destructive',
      });
      return;
    }

    // Load external accounts and open withdrawal modal
    loadExternalAccounts();
    setWithdrawalAmount(stats.totalIncoming.toString());
    setIsWithdrawalModalOpen(true);
  };

  const handleWithdrawConfirm = async () => {
    const amount = parseFloat(withdrawalAmount);
    
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid withdrawal amount',
        variant: 'destructive',
      });
      return;
    }

    if (amount > stats.totalIncoming) {
      toast({
        title: 'Insufficient Balance',
        description: `Maximum withdrawal amount is $${stats.totalIncoming.toFixed(2)}`,
        variant: 'destructive',
      });
      return;
    }

    if (!selectedPayoutMethod) {
      toast({
        title: 'Error',
        description: 'Please select a payout method',
        variant: 'destructive',
      });
      return;
    }

    // Proceed with withdrawal
    setIsWithdrawing(true);
    
    try {
      const response = await fetch('/api/payments/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amount,
          destination: selectedPayoutMethod,
          method: externalAccounts.find(acc => acc.id === selectedPayoutMethod)?.supports_instant_payouts ? 'instant' : 'standard'
        })
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: 'Withdrawal Initiated',
          description: `Withdrawal of $${amount.toFixed(2)} has been initiated. Funds will be transferred to your account within 2-7 business days.`,
        });
        
        // Close modal and refresh payments
        setIsWithdrawalModalOpen(false);
        setWithdrawalAmount('');
        await loadPayments();
      } else {
        throw new Error(result.error || 'Failed to process withdrawal');
      }
    } catch (error) {
      console.error('Error processing withdrawal:', error);
      toast({
        title: 'Withdrawal Failed',
        description: error instanceof Error ? error.message : 'Failed to process withdrawal',
        variant: 'destructive',
      });
    } finally {
      setIsWithdrawing(false);
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
        <Dialog open={isWithdrawalModalOpen} onOpenChange={setIsWithdrawalModalOpen}>
          <DialogTrigger asChild>
            <Button 
              onClick={handleWithdrawClick}
              disabled={stats.totalIncoming <= 0}
            >
              <CreditCardIcon className="mr-2 h-4 w-4" />
              Withdraw Funds
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Withdraw Funds
              </DialogTitle>
              <DialogDescription>
                Specify the amount you want to withdraw to your bank account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Available Balance:</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    ${stats.totalIncoming.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Deel-Inspired Payout Method Selection */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Choose withdrawal method</Label>
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
                    + Add Method
                  </Button>
                </div>
                {externalAccounts.length > 0 ? (
                  <RadioGroup value={selectedPayoutMethod} onValueChange={setSelectedPayoutMethod} className="space-y-3">
                    {externalAccounts.map((account) => (
                      <div key={account.id} className="relative">
                        <div className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          selectedPayoutMethod === account.id 
                            ? 'border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30' 
                            : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                        }`}>
                          <div className="flex items-start space-x-3">
                            <RadioGroupItem value={account.id} id={account.id} className="mt-1" />
                            <Label htmlFor={account.id} className="flex-1 cursor-pointer">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-lg">{account.icon}</span>
                                    <span className="font-semibold text-gray-900 dark:text-gray-100">{account.provider}</span>
                                    {account.supports_instant_payouts && (
                                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                                        Instant
                                      </Badge>
                                    )}
                                    {account.default_for_currency && (
                                      <Badge variant="outline" className="text-xs">
                                        Preferred
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                    {account.display_name}
                                  </div>
                                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      ⏱️ {account.processing_time}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      💰 {account.fee}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs font-medium text-gray-500 uppercase">
                                    {account.currency}
                                  </div>
                                </div>
                              </div>
                            </Label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </RadioGroup>
                ) : (
                  <div className="p-6 text-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl">
                    <div className="text-gray-400 text-4xl mb-3">💳</div>
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">No payout methods</h3>
                    <p className="text-sm text-muted-foreground mb-3">Add a bank account or debit card to withdraw funds</p>
                    <Button variant="outline" size="sm">
                      Add Payout Method
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="withdrawal-amount">Withdrawal Amount</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="withdrawal-amount"
                    type="number"
                    min="0"
                    max={stats.totalIncoming}
                    step="0.01"
                    placeholder="0.00"
                    value={withdrawalAmount}
                    onChange={(e) => setWithdrawalAmount(e.target.value)}
                    className="pl-10"
                    disabled={isWithdrawing}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWithdrawalAmount((stats.totalIncoming / 4).toFixed(2))}
                    disabled={isWithdrawing}
                  >
                    25%
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWithdrawalAmount((stats.totalIncoming / 2).toFixed(2))}
                    disabled={isWithdrawing}
                  >
                    50%
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWithdrawalAmount((stats.totalIncoming * 0.75).toFixed(2))}
                    disabled={isWithdrawing}
                  >
                    75%
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWithdrawalAmount(stats.totalIncoming.toFixed(2))}
                    disabled={isWithdrawing}
                  >
                    100%
                  </Button>
                </div>
              </div>

              {/* Dynamic processing information based on selected method */}
              {selectedPayoutMethod && (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="text-blue-600 dark:text-blue-400 text-lg">
                      {externalAccounts.find(acc => acc.id === selectedPayoutMethod)?.supports_instant_payouts ? '⚡' : '🏦'}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-blue-900 dark:text-blue-100 text-sm mb-1">
                        {externalAccounts.find(acc => acc.id === selectedPayoutMethod)?.provider} Transfer
                      </h4>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                        <strong>Processing Time:</strong> {externalAccounts.find(acc => acc.id === selectedPayoutMethod)?.processing_time}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        <strong>Fee:</strong> {externalAccounts.find(acc => acc.id === selectedPayoutMethod)?.fee}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setIsWithdrawalModalOpen(false)}
                  disabled={isWithdrawing}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleWithdrawConfirm}
                  disabled={isWithdrawing || !withdrawalAmount || parseFloat(withdrawalAmount) <= 0}
                  className="flex-1"
                >
                  {isWithdrawing ? 'Processing...' : 'Confirm Withdrawal'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
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
