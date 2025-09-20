// Simple dialog for adding withdrawal/payment methods

'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Plus, CreditCard, Building2, Wallet, Globe } from 'lucide-react';
import { toast } from 'sonner';

interface PaymentMethod {
  rail: string;
  name: string;
  icon: React.ElementType;
  description: string;
  processing_time: string;
  fees: string;
  available: boolean;
  comingSoon?: boolean;
}

const availableMethods: PaymentMethod[] = [
  {
    rail: 'stripe',
    name: 'Bank Account',
    icon: Building2,
    description: 'Direct bank transfer via Stripe',
    processing_time: '1-3 business days',
    fees: 'Free',
    available: true
  },
  {
    rail: 'paypal',
    name: 'PayPal',
    icon: Wallet,
    description: 'PayPal account withdrawal',
    processing_time: '30 minutes - 1 day',
    fees: '2.5% fee',
    available: true
  },
  {
    rail: 'wise',
    name: 'Wise',
    icon: Globe,
    description: 'International transfers via Wise',
    processing_time: '1-2 hours',
    fees: '0.5-1% fee',
    available: true
  },
  {
    rail: 'payoneer',
    name: 'Payoneer',
    icon: CreditCard,
    description: 'Global payment solution',
    processing_time: '2 hours - 2 days',
    fees: '1.5% + $3 fee',
    available: false,
    comingSoon: true
  },
  {
    rail: 'local',
    name: 'Local Bank Transfer',
    icon: Building2,
    description: 'Domestic bank transfer',
    processing_time: '1-3 business days',
    fees: 'Low fees',
    available: false,
    comingSoon: true
  }
];

interface AddPaymentMethodDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddPaymentMethodDialog({ 
  open, 
  onOpenChange, 
  onSuccess 
}: AddPaymentMethodDialogProps) {
  const [step, setStep] = useState<'select' | 'details'>('select');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [formData, setFormData] = useState({
    label: '',
    currency: 'USD',
    country: 'US',
    account_name: '',
    // Rail-specific fields
    stripe_external_account_id: '',
    paypal_receiver: '',
    wise_recipient_id: '',
    payoneer_payee_id: '',
    local_provider: '',
    local_account_ref: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleMethodSelect = (method: PaymentMethod) => {
    if (!method.available) {
      toast.info(`${method.name} is coming soon!`);
      return;
    }
    setSelectedMethod(method);
    setStep('details');
    setFormData(prev => ({
      ...prev,
      label: method.name + ' Account'
    }));
  };

  const handleSubmit = async () => {
    if (!selectedMethod) return;

    setIsSubmitting(true);
    try {
      // Prepare payload based on selected rail
      const payload = {
        rail: selectedMethod.rail,
        label: formData.label,
        currency: formData.currency,
        country: formData.country,
        account_name: formData.account_name,
        ...(selectedMethod.rail === 'stripe' && {
          stripe_external_account_id: formData.stripe_external_account_id || `mock_account_${Date.now()}`
        }),
        ...(selectedMethod.rail === 'paypal' && {
          paypal_receiver: formData.paypal_receiver
        }),
        ...(selectedMethod.rail === 'wise' && {
          wise_recipient_id: formData.wise_recipient_id || `mock_wise_${Date.now()}`
        }),
        ...(selectedMethod.rail === 'payoneer' && {
          payoneer_payee_id: formData.payoneer_payee_id
        }),
        ...(selectedMethod.rail === 'local' && {
          local_provider: formData.local_provider,
          local_account_ref: formData.local_account_ref
        })
      };

      const response = await fetch('/api/withdrawals/methods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add payment method');
      }

      toast.success(`${selectedMethod.name} account added successfully!`);
      
      // Reset form
      setStep('select');
      setSelectedMethod(null);
      setFormData({
        label: '',
        currency: 'USD',
        country: 'US',
        account_name: '',
        stripe_external_account_id: '',
        paypal_receiver: '',
        wise_recipient_id: '',
        payoneer_payee_id: '',
        local_provider: '',
        local_account_ref: ''
      });

      // Close dialog and refresh
      onOpenChange?.(false);
      onSuccess?.();

    } catch (error) {
      console.error('Error adding payment method:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add payment method');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderMethodSelection = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-2">Choose Payment Method</h3>
        <p className="text-sm text-muted-foreground">
          Select how you'd like to receive your payments
        </p>
      </div>

      <div className="grid gap-3">
        {availableMethods.map((method) => {
          const IconComponent = method.icon;
          return (
            <Card 
              key={method.rail} 
              className={`cursor-pointer transition-colors ${
                method.available 
                  ? 'hover:bg-accent' 
                  : 'opacity-50 cursor-not-allowed'
              }`}
              onClick={() => handleMethodSelect(method)}
            >
              <CardContent className="flex items-center p-4">
                <div className="flex items-center space-x-3 flex-1">
                  <div className="flex-shrink-0">
                    <IconComponent className="h-6 w-6" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-medium">{method.name}</h4>
                      {method.comingSoon && (
                        <Badge variant="secondary" className="text-xs">
                          Coming Soon
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {method.description}
                    </p>
                    <div className="flex items-center space-x-4 mt-1 text-xs text-muted-foreground">
                      <span>⏱️ {method.processing_time}</span>
                      <span>💰 {method.fees}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="text-center text-sm text-muted-foreground">
        More payment methods coming soon!
      </div>
    </div>
  );

  const renderDetailsForm = () => {
    if (!selectedMethod) return null;

    return (
      <div className="space-y-4">
        <div className="flex items-center space-x-2 mb-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setStep('select')}
            className="px-2"
          >
            ← Back
          </Button>
          <div className="flex items-center space-x-2">
            <selectedMethod.icon className="h-5 w-5" />
            <h3 className="font-medium">Add {selectedMethod.name}</h3>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="label">Account Label</Label>
              <Input
                id="label"
                value={formData.label}
                onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
                placeholder="My Bank Account"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="currency">Currency</Label>
              <select 
                value={formData.currency} 
                onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="account_name">Account Holder Name</Label>
            <Input
              id="account_name"
              value={formData.account_name}
              onChange={(e) => setFormData(prev => ({ ...prev, account_name: e.target.value }))}
              placeholder="John Doe"
              required
            />
          </div>

          {/* Rail-specific fields */}
          {selectedMethod.rail === 'paypal' && (
            <div>
              <Label htmlFor="paypal_receiver">PayPal Email</Label>
              <Input
                id="paypal_receiver"
                type="email"
                value={formData.paypal_receiver}
                onChange={(e) => setFormData(prev => ({ ...prev, paypal_receiver: e.target.value }))}
                placeholder="your-paypal@email.com"
                required
              />
            </div>
          )}

          {selectedMethod.rail === 'stripe' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Bank Account Setup</h4>
              <p className="text-sm text-blue-800">
                You'll be redirected to Stripe to securely connect your bank account.
                This ensures your banking information is protected.
              </p>
            </div>
          )}

          {selectedMethod.rail === 'wise' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-900 mb-2">Wise Account</h4>
              <p className="text-sm text-green-800">
                You'll need an existing Wise account to receive international transfers.
                If you don't have one, you can create it at wise.com.
              </p>
            </div>
          )}

          <Separator />

          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium mb-2">Processing Details</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>Processing Time:</span>
                <span>{selectedMethod.processing_time}</span>
              </div>
              <div className="flex justify-between">
                <span>Fees:</span>
                <span>{selectedMethod.fees}</span>
              </div>
            </div>
          </div>

          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={() => setStep('select')}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !formData.label || !formData.account_name}
              className="flex-1"
            >
              {isSubmitting ? 'Adding...' : `Add ${selectedMethod.name}`}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Payment Method
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Payment Method</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {step === 'select' ? renderMethodSelection() : renderDetailsForm()}
        </div>
      </DialogContent>
    </Dialog>
  );
}