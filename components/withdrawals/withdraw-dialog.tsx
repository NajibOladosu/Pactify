'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DollarSign, 
  ArrowUpRight, 
  Clock, 
  Zap, 
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface WithdrawalMethod {
  id: string;
  rail: string;
  rail_name: string;
  label: string;
  currency: string;
  provider_name?: string;
  icon?: string;
  last_four?: string;
  supports_instant: boolean;
  processing_time: string;
  fee_structure: any;
  is_default: boolean;
}

interface PayoutQuote {
  rail: string;
  rail_name: string;
  amount: number;
  currency: string;
  fees: {
    platform_fee: number;
    provider_fee: number;
    total_fees: number;
  };
  net_amount: number;
  processing_time: string;
  estimated_arrival: string;
  supports_instant: boolean;
  recommended: boolean;
}

interface WithdrawDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  availableBalance: number;
  currency: string;
  onSuccess: () => void;
  trigger: React.ReactNode;
}

export function WithdrawDialog({
  isOpen,
  onOpenChange,
  availableBalance,
  currency,
  onSuccess,
  trigger
}: WithdrawDialogProps) {
  const [step, setStep] = useState<'amount' | 'method' | 'review' | 'processing'>('amount');
  const [amount, setAmount] = useState('');
  const [selectedMethodId, setSelectedMethodId] = useState('');
  const [methods, setMethods] = useState<WithdrawalMethod[]>([]);
  const [quotes, setQuotes] = useState<PayoutQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [urgency, setUrgency] = useState<'standard' | 'instant'>('standard');
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && step === 'amount') {
      loadMethods();
    }
  }, [isOpen, step]);

  useEffect(() => {
    if (amount && selectedMethodId && parseFloat(amount) > 0) {
      loadQuotes();
    }
  }, [amount, selectedMethodId, urgency]);

  const loadMethods = async () => {
    try {
      const response = await fetch(`/api/withdrawals/methods?currency=${currency}`);
      const data = await response.json();
      
      if (response.ok) {
        setMethods(data.methods);
        // Auto-select default method
        const defaultMethod = data.methods.find((m: WithdrawalMethod) => m.is_default);
        if (defaultMethod) {
          setSelectedMethodId(defaultMethod.id);
        }
      }
    } catch (error) {
      console.error('Error loading methods:', error);
    }
  };

  const loadQuotes = async () => {
    if (!amount || !selectedMethodId || parseFloat(amount) <= 0) return;

    setLoading(true);
    try {
      const response = await fetch('/api/withdrawals/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method_id: selectedMethodId,
          amount: Math.round(parseFloat(amount) * 100), // Convert to minor units
          currency,
          urgency
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        setQuotes(data.quotes || []);
      } else {
        toast({
          title: 'Quote Error',
          description: data.error || 'Failed to get withdrawal quote',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error loading quotes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAmountNext = () => {
    const amountNum = parseFloat(amount);
    const maxAmount = availableBalance / 100; // Convert from minor units
    
    if (!amountNum || amountNum <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid amount',
        variant: 'destructive',
      });
      return;
    }

    if (amountNum > maxAmount) {
      toast({
        title: 'Insufficient Balance',
        description: `Maximum withdrawal amount is ${formatAmount(availableBalance)}`,
        variant: 'destructive',
      });
      return;
    }

    setStep('method');
  };

  const handleSubmit = async () => {
    if (!selectedMethodId || !amount) return;

    setStep('processing');
    
    try {
      const response = await fetch('/api/withdrawals/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method_id: selectedMethodId,
          amount: Math.round(parseFloat(amount) * 100), // Convert to minor units
          currency,
          urgency,
          description: `Withdrawal via ${getSelectedMethod()?.rail_name}`
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: 'Withdrawal Initiated',
          description: data.message || 'Your withdrawal has been processed successfully.',
        });
        
        onSuccess();
        onOpenChange(false);
        resetDialog();
      } else {
        toast({
          title: 'Withdrawal Failed',
          description: data.error || 'Failed to process withdrawal',
          variant: 'destructive',
        });
        setStep('review');
      }
    } catch (error) {
      console.error('Error submitting withdrawal:', error);
      toast({
        title: 'Withdrawal Failed',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
      setStep('review');
    }
  };

  const resetDialog = () => {
    setStep('amount');
    setAmount('');
    setSelectedMethodId('');
    setQuotes([]);
    setUrgency('standard');
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount / 100);
  };

  const getSelectedMethod = () => {
    return methods.find(m => m.id === selectedMethodId);
  };

  const getSelectedQuote = () => {
    const method = getSelectedMethod();
    return quotes.find(q => q.rail === method?.rail);
  };

  const renderAmountStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">How much would you like to withdraw?</h3>
        <p className="text-sm text-muted-foreground">
          Available balance: {formatAmount(availableBalance)}
        </p>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="pl-10 text-lg"
            min="0"
            max={availableBalance / 100}
            step="0.01"
          />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[25, 50, 75, 100].map(percent => (
            <Button
              key={percent}
              variant="outline"
              size="sm"
              onClick={() => setAmount(((availableBalance * percent) / 100 / 100).toFixed(2))}
            >
              {percent}%
            </Button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
          Cancel
        </Button>
        <Button onClick={handleAmountNext} className="flex-1">
          Next
        </Button>
      </div>
    </div>
  );

  const renderMethodStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Choose withdrawal method</h3>
        <p className="text-sm text-muted-foreground">
          Withdrawing {formatAmount(Math.round(parseFloat(amount) * 100))}
        </p>
      </div>

      {methods.length > 0 ? (
        <RadioGroup value={selectedMethodId} onValueChange={setSelectedMethodId}>
          <div className="space-y-3">
            {methods.map((method) => (
              <div key={method.id} className="relative">
                <div className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  selectedMethodId === method.id 
                    ? 'border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30' 
                    : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                }`}>
                  <div className="flex items-start space-x-3">
                    <RadioGroupItem value={method.id} id={method.id} className="mt-1" />
                    <Label htmlFor={method.id} className="flex-1 cursor-pointer">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{method.icon}</span>
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                              {method.provider_name || method.rail_name}
                            </span>
                            {method.supports_instant && (
                              <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                                <Zap className="h-3 w-3 mr-1" />
                                Instant
                              </Badge>
                            )}
                            {method.is_default && (
                              <Badge variant="outline" className="text-xs">
                                Default
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            {method.label}
                            {method.last_four && ` ••••${method.last_four}`}
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {method.processing_time}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </RadioGroup>
      ) : (
        <div className="text-center py-8">
          <div className="text-gray-400 text-4xl mb-3">💳</div>
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">No payout methods</h3>
          <p className="text-sm text-muted-foreground mb-3">Add a withdrawal method to continue</p>
        </div>
      )}

      {/* Urgency Selection */}
      {getSelectedMethod()?.supports_instant && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Processing Speed</Label>
          <Tabs value={urgency} onValueChange={(value) => setUrgency(value as 'standard' | 'instant')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="standard">Standard</TabsTrigger>
              <TabsTrigger value="instant">Instant</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setStep('amount')} className="flex-1">
          Back
        </Button>
        <Button 
          onClick={() => setStep('review')} 
          className="flex-1"
          disabled={!selectedMethodId}
        >
          Review
        </Button>
      </div>
    </div>
  );

  const renderReviewStep = () => {
    const quote = getSelectedQuote();
    const method = getSelectedMethod();

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Review withdrawal</h3>
          <p className="text-sm text-muted-foreground">
            Please confirm the details below
          </p>
        </div>

        {quote && method && (
          <div className="space-y-4">
            {/* Summary Card */}
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <span className="font-medium">Withdrawal Summary</span>
                <Badge variant={quote.recommended ? "default" : "outline"}>
                  {quote.recommended ? "Recommended" : quote.rail_name}
                </Badge>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span className="font-medium">{formatAmount(quote.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Platform fee:</span>
                  <span>-{formatAmount(quote.fees.platform_fee)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Provider fee:</span>
                  <span>-{formatAmount(quote.fees.provider_fee)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-medium">
                  <span>You'll receive:</span>
                  <span className="text-green-600">{formatAmount(quote.net_amount)}</span>
                </div>
              </div>
            </div>

            {/* Method Details */}
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="text-blue-600 dark:text-blue-400 text-lg">
                  {method.icon}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 text-sm mb-1">
                    {method.provider_name || method.rail_name}
                  </h4>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                    <strong>Processing Time:</strong> {quote.processing_time}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    <strong>Estimated Arrival:</strong> {new Date(quote.estimated_arrival).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setStep('method')} className="flex-1">
            Back
          </Button>
          <Button onClick={handleSubmit} className="flex-1">
            <ArrowUpRight className="h-4 w-4 mr-2" />
            Confirm Withdrawal
          </Button>
        </div>
      </div>
    );
  };

  const renderProcessingStep = () => (
    <div className="text-center py-8 space-y-4">
      <Loader2 className="h-12 w-12 mx-auto text-blue-600 animate-spin" />
      <div>
        <h3 className="text-lg font-semibold mb-2">Processing withdrawal...</h3>
        <p className="text-sm text-muted-foreground">
          Please wait while we process your withdrawal request.
        </p>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>Withdraw Funds</DialogTitle>
          <DialogDescription>
            Withdraw your available balance to your preferred payout method.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {step === 'amount' && renderAmountStep()}
          {step === 'method' && renderMethodStep()}
          {step === 'review' && renderReviewStep()}
          {step === 'processing' && renderProcessingStep()}
        </div>
      </DialogContent>
    </Dialog>
  );
}