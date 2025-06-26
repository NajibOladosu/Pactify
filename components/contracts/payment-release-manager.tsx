"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { 
  DollarSignIcon, 
  CreditCardIcon, 
  CheckCircleIcon,
  ClockIcon,
  AlertTriangleIcon,
  TrendingUpIcon,
  LockIcon,
  UnlockIcon,
  Loader2,
  InfoIcon,
  UserIcon,
  CalendarIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Payment {
  id: string;
  contract_id: string;
  milestone_id?: string;
  amount: number;
  fee: number;
  net_amount: number;
  payer_id: string;
  payee_id: string;
  currency: string;
  status: 'pending' | 'funded' | 'released' | 'refunded';
  stripe_payment_intent_id?: string;
  stripe_transfer_id?: string;
  funded_at?: string;
  released_at?: string;
  created_at: string;
  updated_at: string;
}

interface PaymentSummary {
  total_contract_amount: number;
  total_funded: number;
  total_released: number;
  remaining_in_escrow: number;
  can_release_payment: boolean;
  release_eligibility: {
    is_client: boolean;
    is_funded: boolean;
    has_escrow_balance: boolean;
    valid_status: boolean;
  };
}

interface Milestone {
  id: string;
  title: string;
  amount: number;
  status: 'pending' | 'in_progress' | 'submitted' | 'approved' | 'revision_requested' | 'completed';
  due_date?: string;
}

interface PaymentReleaseManagerProps {
  contractId: string;
  userId: string;
  userRole: 'client' | 'freelancer' | 'creator';
  contractType: 'fixed' | 'milestone' | 'hourly';
  contractStatus: string;
  milestones?: Milestone[];
}

const formatCurrency = (amount: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);
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

export default function PaymentReleaseManager({
  contractId,
  userId,
  userRole,
  contractType,
  contractStatus,
  milestones = []
}: PaymentReleaseManagerProps) {
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReleasing, setIsReleasing] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState<string | null>(null);

  useEffect(() => {
    fetchPaymentData();
  }, [contractId]);

  const fetchPaymentData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/contracts/${contractId}/release-payment`);
      const result = await response.json();

      if (response.ok) {
        setPayments(result.payments);
        setPaymentSummary(result.payment_summary);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch payment data",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Failed to fetch payment data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch payment data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentRelease = async (milestoneId?: string) => {
    if (!paymentSummary?.can_release_payment) {
      toast({
        title: "Cannot Release Payment",
        description: "Payment release requirements not met",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsReleasing(true);
      const body: any = {};
      if (milestoneId) {
        body.milestone_id = milestoneId;
      }

      const response = await fetch(`/api/contracts/${contractId}/release-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: "Payment Released!",
          description: result.message,
        });

        // Refresh payment data
        await fetchPaymentData();
        
        // Refresh the page to update contract status
        window.location.reload();
      } else {
        toast({
          title: "Payment Release Failed",
          description: result.message || "Failed to release payment",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Payment release error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsReleasing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-y-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading payment information...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!paymentSummary) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            Failed to load payment information
          </div>
        </CardContent>
      </Card>
    );
  }

  const progressPercentage = paymentSummary.total_contract_amount > 0 
    ? (paymentSummary.total_released / paymentSummary.total_contract_amount) * 100 
    : 0;

  return (
    <div className="space-y-6">
      {/* Payment Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSignIcon className="h-5 w-5" />
            Payment & Escrow Management
          </CardTitle>
          <CardDescription>
            Track and manage contract payments through secure escrow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Total Contract Amount */}
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {formatCurrency(paymentSummary.total_contract_amount)}
              </div>
              <p className="text-sm text-muted-foreground">Contract Value</p>
            </div>

            {/* Amount in Escrow */}
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {formatCurrency(paymentSummary.remaining_in_escrow)}
              </div>
              <p className="text-sm text-muted-foreground">In Escrow</p>
            </div>

            {/* Released Amount */}
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(paymentSummary.total_released)}
              </div>
              <p className="text-sm text-muted-foreground">Released</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Payment Progress</span>
              <span>{progressPercentage.toFixed(1)}% Released</span>
            </div>
            <Progress value={progressPercentage} className="h-3" />
          </div>

          {/* Release Eligibility Status */}
          <div className="mt-4 p-4 rounded-lg bg-muted/30">
            <h4 className="font-medium mb-3">Release Requirements</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                {paymentSummary.release_eligibility.is_client ? (
                  <CheckCircleIcon className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircleIcon className="h-4 w-4 text-red-600" />
                )}
                <span>Client Authorization</span>
              </div>
              <div className="flex items-center gap-2">
                {paymentSummary.release_eligibility.is_funded ? (
                  <CheckCircleIcon className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircleIcon className="h-4 w-4 text-red-600" />
                )}
                <span>Escrow Funded</span>
              </div>
              <div className="flex items-center gap-2">
                {paymentSummary.release_eligibility.has_escrow_balance ? (
                  <CheckCircleIcon className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircleIcon className="h-4 w-4 text-red-600" />
                )}
                <span>Available Balance</span>
              </div>
              <div className="flex items-center gap-2">
                {paymentSummary.release_eligibility.valid_status ? (
                  <CheckCircleIcon className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircleIcon className="h-4 w-4 text-red-600" />
                )}
                <span>Work Completed</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Milestone-specific Release (for milestone contracts) */}
      {contractType === 'milestone' && milestones.length > 0 && userRole === 'client' && (
        <Card>
          <CardHeader>
            <CardTitle>Milestone Payments</CardTitle>
            <CardDescription>
              Release payments for individual milestones as they are completed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {milestones.map((milestone) => {
                const isCompleted = milestone.status === 'completed';
                const isApproved = milestone.status === 'approved';
                const canRelease = isApproved && paymentSummary.can_release_payment;

                return (
                  <div key={milestone.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center text-white",
                        isCompleted ? "bg-green-600" : 
                        isApproved ? "bg-blue-600" : 
                        "bg-gray-400"
                      )}>
                        {isCompleted ? (
                          <CheckCircleIcon className="h-5 w-5" />
                        ) : isApproved ? (
                          <UnlockIcon className="h-5 w-5" />
                        ) : (
                          <LockIcon className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-medium">{milestone.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm font-medium">
                            {formatCurrency(milestone.amount)}
                          </span>
                          <Badge variant={
                            isCompleted ? 'default' : 
                            isApproved ? 'secondary' : 
                            'outline'
                          }>
                            {milestone.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    
                    {canRelease && !isCompleted && (
                      <Button
                        onClick={() => handlePaymentRelease(milestone.id)}
                        disabled={isReleasing}
                        size="sm"
                      >
                        {isReleasing ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <TrendingUpIcon className="h-4 w-4 mr-2" />
                        )}
                        Release Payment
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Payment Release (for fixed contracts or final milestone release) */}
      {userRole === 'client' && paymentSummary.remaining_in_escrow > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {contractType === 'milestone' ? 'Release All Remaining Funds' : 'Release Payment'}
            </CardTitle>
            <CardDescription>
              {contractType === 'milestone' 
                ? 'Release all remaining funds in escrow after all milestones are complete'
                : 'Release the full contract payment to the freelancer'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {paymentSummary.can_release_payment ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircleIcon className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-green-900">Ready to Release</p>
                    <p className="text-green-700 mt-1">
                      All requirements have been met. You can now release the payment to the freelancer.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-4 border-2 border-dashed border-green-300 rounded-lg">
                  <div>
                    <h4 className="font-medium">Amount to Release</h4>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(paymentSummary.remaining_in_escrow)}
                    </p>
                  </div>
                  <Button
                    onClick={() => handlePaymentRelease()}
                    disabled={isReleasing}
                    size="lg"
                  >
                    {isReleasing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Releasing...
                      </>
                    ) : (
                      <>
                        <TrendingUpIcon className="h-4 w-4 mr-2" />
                        Release Payment
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <AlertTriangleIcon className="h-12 w-12 text-orange-500 mx-auto mb-4" />
                <h4 className="font-medium mb-2">Payment Release Not Available</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Requirements for payment release have not been met yet.
                </p>
                <div className="text-left max-w-md mx-auto">
                  <h5 className="text-sm font-medium mb-2">Requirements:</h5>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {!paymentSummary.release_eligibility.is_client && (
                      <li>• Must be the client to release payments</li>
                    )}
                    {!paymentSummary.release_eligibility.is_funded && (
                      <li>• Contract must be funded through escrow</li>
                    )}
                    {!paymentSummary.release_eligibility.has_escrow_balance && (
                      <li>• Must have available balance in escrow</li>
                    )}
                    {!paymentSummary.release_eligibility.valid_status && (
                      <li>• Work must be completed and approved</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payment History */}
      {payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>
              Complete record of all payments for this contract
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      payment.status === 'released' ? "bg-green-100 text-green-600" :
                      payment.status === 'funded' ? "bg-blue-100 text-blue-600" :
                      "bg-gray-100 text-gray-600"
                    )}>
                      {payment.status === 'released' ? (
                        <TrendingUpIcon className="h-4 w-4" />
                      ) : payment.status === 'funded' ? (
                        <LockIcon className="h-4 w-4" />
                      ) : (
                        <ClockIcon className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {formatCurrency(payment.amount)}
                        </span>
                        <Badge variant={
                          payment.status === 'released' ? 'default' : 'secondary'
                        }>
                          {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {payment.status === 'released' && payment.released_at
                          ? `Released on ${formatDate(payment.released_at)}`
                          : payment.status === 'funded' && payment.funded_at
                          ? `Funded on ${formatDate(payment.funded_at)}`
                          : `Created on ${formatDate(payment.created_at)}`
                        }
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatCurrency(payment.net_amount)}</p>
                    <p className="text-xs text-muted-foreground">Net amount</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Information Notice */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <InfoIcon className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900">Payment Security</p>
              <p className="text-blue-700 mt-1">
                All payments are held securely in escrow until work is completed and approved. 
                Funds are released instantly to the freelancer's connected payment account.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="m15 9-6 6"/>
      <path d="m9 9 6 6"/>
    </svg>
  );
}