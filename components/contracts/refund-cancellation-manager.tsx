"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  RefreshCcwIcon, 
  XCircleIcon,
  DollarSignIcon,
  AlertTriangleIcon,
  FileTextIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  CreditCardIcon,
  PercentIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RefundCancellationManagerProps {
  contractId: string;
  userId: string;
  userRole: 'client' | 'freelancer' | 'creator';
  contractStatus: string;
  totalAmount: number;
  currency: string;
  escrowStatus?: 'pending' | 'held' | 'released' | 'refunded';
  fundedAmount?: number; // Actual amount that has been funded into escrow
  onStatusChange?: () => void;
}

interface RefundDetails {
  eligibleAmount: number;
  platformFeeRefund: number;
  processingFee: number;
  netRefund: number;
  reason: string;
}

interface CancellationFees {
  cancellationFee: number;
  platformFeeForfeited: number;
  refundableAmount: number;
  processingFee: number;
  netRefund: number;
}

const formatCurrency = (amount: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const calculateRefundDetails = (
  totalAmount: number, 
  fundedAmount: number,
  contractStatus: string, 
  userRole: string
): RefundDetails => {
  // Use the actual funded amount, not the total contract amount
  let eligibleAmount = fundedAmount;
  let platformFeeRefund = 0;
  let processingFee = 2.99; // Fixed processing fee
  
  // Calculate based on contract status and user role
  switch (contractStatus) {
    case 'pending_funding':
    case 'pending_signatures':
      // Full refund if work hasn't started
      eligibleAmount = fundedAmount;
      platformFeeRefund = fundedAmount * 0.05; // Assume 5% platform fee
      break;
    case 'active':
      // Partial refund based on progress
      eligibleAmount = fundedAmount * 0.8; // 80% refund
      platformFeeRefund = eligibleAmount * 0.03; // Reduced platform fee refund
      break;
    case 'pending_delivery':
    case 'in_review':
      // Limited refund as work is mostly complete
      eligibleAmount = fundedAmount * 0.3; // 30% refund
      platformFeeRefund = 0; // No platform fee refund
      break;
    default:
      eligibleAmount = 0;
      platformFeeRefund = 0;
  }

  const netRefund = Math.max(0, eligibleAmount + platformFeeRefund - processingFee);

  return {
    eligibleAmount,
    platformFeeRefund,
    processingFee,
    netRefund,
    reason: getRefundReason(contractStatus)
  };
};

const calculateCancellationFees = (
  totalAmount: number,
  contractStatus: string,
  userRole: string
): CancellationFees => {
  let cancellationFee = 0;
  let platformFeeForfeited = 0;
  let refundableAmount = totalAmount;
  const processingFee = 2.99;

  // Calculate cancellation fees based on status and timing
  switch (contractStatus) {
    case 'pending_signatures':
      cancellationFee = 0; // No fee for early cancellation
      refundableAmount = totalAmount;
      break;
    case 'pending_funding':
      cancellationFee = totalAmount * 0.05; // 5% cancellation fee
      refundableAmount = totalAmount - cancellationFee;
      break;
    case 'active':
      cancellationFee = totalAmount * 0.15; // 15% cancellation fee
      platformFeeForfeited = totalAmount * 0.05; // Forfeit platform fee
      refundableAmount = totalAmount - cancellationFee - platformFeeForfeited;
      break;
    case 'pending_delivery':
    case 'in_review':
      cancellationFee = totalAmount * 0.25; // 25% cancellation fee
      platformFeeForfeited = totalAmount * 0.05;
      refundableAmount = totalAmount - cancellationFee - platformFeeForfeited;
      break;
    default:
      refundableAmount = 0;
  }

  const netRefund = Math.max(0, refundableAmount - processingFee);

  return {
    cancellationFee,
    platformFeeForfeited,
    refundableAmount,
    processingFee,
    netRefund
  };
};

const getRefundReason = (status: string): string => {
  switch (status) {
    case 'pending_signatures':
    case 'pending_funding':
      return 'Contract not yet active - full refund eligible';
    case 'active':
      return 'Work in progress - partial refund based on completion';
    case 'pending_delivery':
      return 'Work substantially complete - limited refund available';
    default:
      return 'Refund eligibility varies by contract status';
  }
};

export default function RefundCancellationManager({ 
  contractId, 
  userId, 
  userRole, 
  contractStatus,
  totalAmount,
  currency,
  escrowStatus = 'pending',
  fundedAmount = 0,
  onStatusChange 
}: RefundCancellationManagerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'refund' | 'cancel'>('overview');
  const [refundReason, setRefundReason] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');

  const refundDetails = calculateRefundDetails(totalAmount, fundedAmount, contractStatus, userRole);
  const cancellationFees = calculateCancellationFees(totalAmount, contractStatus, userRole);

  const canRequestRefund = ['pending_funding', 'active', 'pending_delivery', 'in_review'].includes(contractStatus) && 
                          escrowStatus === 'held' && 
                          fundedAmount > 0 && // Only show refund if there's actually funded money
                          userRole === 'client';

  const canCancelContract = ['pending_signatures', 'pending_funding', 'active'].includes(contractStatus);

  const handleRefundRequest = async () => {
    if (!refundReason.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a reason for the refund request",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`/api/contracts/${contractId}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: refundReason,
          requested_amount: refundDetails.netRefund
        }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Refund request submitted successfully",
        });
        setRefundReason('');
        onStatusChange?.();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to request refund');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to request refund",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancellation = async () => {
    if (!cancellationReason.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a reason for cancellation",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`/api/contracts/${contractId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: cancellationReason,
          cancellation_fee: cancellationFees.cancellationFee,
          refund_amount: cancellationFees.netRefund
        }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Contract cancelled successfully",
        });
        setCancellationReason('');
        onStatusChange?.();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to cancel contract');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to cancel contract",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCcwIcon className="h-5 w-5" />
          Refund & Cancellation
        </CardTitle>
        <CardDescription>
          Manage refunds and contract cancellations
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab as any}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="refund" disabled={!canRequestRefund}>
              Request Refund
            </TabsTrigger>
            <TabsTrigger value="cancel" disabled={!canCancelContract}>
              Cancel Contract
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Refund Eligibility */}
              <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <DollarSignIcon className="h-4 w-4" />
                  Refund Eligibility
                </h3>
                
                <div className="p-4 border rounded-lg space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Contract Amount</span>
                    <span className="font-medium">{formatCurrency(totalAmount, currency)}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Funded Amount</span>
                    <span className="font-medium text-blue-600">
                      {formatCurrency(fundedAmount, currency)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Eligible Refund</span>
                    <span className="font-medium text-green-600">
                      {formatCurrency(refundDetails.eligibleAmount, currency)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Platform Fee Refund</span>
                    <span className="font-medium">
                      {formatCurrency(refundDetails.platformFeeRefund, currency)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Processing Fee</span>
                    <span className="font-medium text-red-600">
                      -{formatCurrency(refundDetails.processingFee, currency)}
                    </span>
                  </div>
                  
                  <div className="pt-2 border-t">
                    <div className="flex justify-between">
                      <span className="font-medium">Net Refund</span>
                      <span className="font-bold text-green-600">
                        {formatCurrency(refundDetails.netRefund, currency)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-700">{refundDetails.reason}</p>
                </div>

                {fundedAmount === 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-700">
                      No funds have been deposited into escrow yet. Refunds are only available after the contract has been funded.
                    </p>
                  </div>
                )}

                {canRequestRefund && (
                  <Button 
                    onClick={() => setActiveTab('refund')} 
                    className="w-full"
                    variant="outline"
                  >
                    <RefreshCcwIcon className="h-4 w-4 mr-2" />
                    Request Refund
                  </Button>
                )}
              </div>

              {/* Cancellation Fees */}
              <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <XCircleIcon className="h-4 w-4" />
                  Cancellation Impact
                </h3>
                
                <div className="p-4 border rounded-lg space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Contract Amount</span>
                    <span className="font-medium">{formatCurrency(totalAmount, currency)}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Cancellation Fee</span>
                    <span className="font-medium text-red-600">
                      -{formatCurrency(cancellationFees.cancellationFee, currency)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Platform Fee Forfeited</span>
                    <span className="font-medium text-red-600">
                      -{formatCurrency(cancellationFees.platformFeeForfeited, currency)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Processing Fee</span>
                    <span className="font-medium text-red-600">
                      -{formatCurrency(cancellationFees.processingFee, currency)}
                    </span>
                  </div>
                  
                  <div className="pt-2 border-t">
                    <div className="flex justify-between">
                      <span className="font-medium">Net Refund</span>
                      <span className="font-bold text-green-600">
                        {formatCurrency(cancellationFees.netRefund, currency)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-700">
                    Cancellation fees increase as work progresses to compensate for invested time and resources.
                  </p>
                </div>

                {canCancelContract && (
                  <Button 
                    onClick={() => setActiveTab('cancel')} 
                    className="w-full"
                    variant="destructive"
                  >
                    <XCircleIcon className="h-4 w-4 mr-2" />
                    Cancel Contract
                  </Button>
                )}
              </div>
            </div>

            {/* Status-based Information */}
            <div className="p-4 bg-muted/30 rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <AlertCircleIcon className="h-4 w-4" />
                Important Information
              </h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>• Refund processing typically takes 5-10 business days</p>
                <p>• Cancellation fees help protect freelancers' invested time</p>
                <p>• Disputes can be raised if refund/cancellation is not handled fairly</p>
                <p>• Some fees may be non-refundable based on contract progress</p>
              </div>
            </div>
          </TabsContent>

          {/* Request Refund Tab */}
          <TabsContent value="refund" className="space-y-6">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircleIcon className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900 mb-1">Refund Request Process</p>
                  <p className="text-blue-700">
                    Your refund request will be reviewed. If approved, funds will be returned to your original payment method within 5-10 business days.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-3">Refund Breakdown</h4>
                <div className="p-4 border rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span>Eligible Amount</span>
                    <span className="font-medium">{formatCurrency(refundDetails.eligibleAmount, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Platform Fee Refund</span>
                    <span className="font-medium">+{formatCurrency(refundDetails.platformFeeRefund, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Processing Fee</span>
                    <span className="font-medium text-red-600">-{formatCurrency(refundDetails.processingFee, currency)}</span>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="flex justify-between">
                      <span className="font-bold">Total Refund</span>
                      <span className="font-bold text-green-600">{formatCurrency(refundDetails.netRefund, currency)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Reason for Refund</h4>
                <Textarea
                  placeholder="Please explain why you are requesting a refund. Be specific about any issues or concerns..."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>

              <Button 
                onClick={handleRefundRequest}
                disabled={loading || !refundReason.trim()}
                className="w-full"
              >
                {loading ? (
                  <ClockIcon className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCcwIcon className="h-4 w-4 mr-2" />
                )}
                Submit Refund Request
              </Button>
            </div>
          </TabsContent>

          {/* Cancel Contract Tab */}
          <TabsContent value="cancel" className="space-y-6">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangleIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-red-900 mb-1">Contract Cancellation</p>
                  <p className="text-red-700">
                    Cancelling this contract will terminate all work immediately. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-3">Cancellation Impact</h4>
                <div className="p-4 border rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span>Original Amount</span>
                    <span className="font-medium">{formatCurrency(totalAmount, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cancellation Fee</span>
                    <span className="font-medium text-red-600">-{formatCurrency(cancellationFees.cancellationFee, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Platform Fee Forfeited</span>
                    <span className="font-medium text-red-600">-{formatCurrency(cancellationFees.platformFeeForfeited, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Processing Fee</span>
                    <span className="font-medium text-red-600">-{formatCurrency(cancellationFees.processingFee, currency)}</span>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="flex justify-between">
                      <span className="font-bold">Net Refund</span>
                      <span className="font-bold text-green-600">{formatCurrency(cancellationFees.netRefund, currency)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Reason for Cancellation</h4>
                <Textarea
                  placeholder="Please explain why you are cancelling this contract. This helps us improve our service..."
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>

              <Button 
                onClick={handleCancellation}
                disabled={loading || !cancellationReason.trim()}
                variant="destructive"
                className="w-full"
              >
                {loading ? (
                  <ClockIcon className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <XCircleIcon className="h-4 w-4 mr-2" />
                )}
                Cancel Contract
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}