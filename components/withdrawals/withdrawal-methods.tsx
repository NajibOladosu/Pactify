'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, 
  CreditCard, 
  MoreHorizontal,
  Check,
  Zap,
  Clock,
  Trash2,
  Edit,
  Star
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';

interface WithdrawalMethod {
  id: string;
  rail: string;
  rail_name: string;
  label: string;
  currency: string;
  country: string;
  account_name?: string;
  last_four?: string;
  provider_name?: string;
  icon?: string;
  supports_instant: boolean;
  processing_time: string;
  fee_structure: any;
  is_default: boolean;
  is_verified: boolean;
  created_at: string;
}

interface WithdrawalMethodsProps {
  currency: string;
  onMethodAdded: () => void;
  className?: string;
}

const railOptions = [
  { value: 'stripe', label: 'Bank Transfer (Stripe)', icon: '🏦' },
  { value: 'wise', label: 'International Transfer (Wise)', icon: '🌍' },
  { value: 'paypal', label: 'PayPal', icon: '🅿️' },
  { value: 'payoneer', label: 'Payoneer', icon: '💼' },
];

export function WithdrawalMethods({ 
  currency, 
  onMethodAdded,
  className 
}: WithdrawalMethodsProps) {
  const [methods, setMethods] = useState<WithdrawalMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedRail, setSelectedRail] = useState('');
  const [formData, setFormData] = useState({
    label: '',
    account_name: '',
    stripe_external_account_id: '',
    wise_recipient_id: '',
    paypal_receiver: '',
    payoneer_payee_id: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadMethods();
  }, [currency]);

  const loadMethods = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/withdrawals/methods?currency=${currency}`);
      const data = await response.json();
      
      if (response.ok) {
        setMethods(data.methods);
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to load withdrawal methods',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error loading methods:', error);
      toast({
        title: 'Error',
        description: 'Failed to load withdrawal methods',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddMethod = async () => {
    if (!selectedRail || !formData.label) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    // Validate rail-specific fields
    const validationError = validateRailFields(selectedRail, formData);
    if (validationError) {
      toast({
        title: 'Validation Error',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/withdrawals/methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rail: selectedRail,
          label: formData.label,
          currency,
          account_name: formData.account_name,
          stripe_external_account_id: formData.stripe_external_account_id,
          wise_recipient_id: formData.wise_recipient_id,
          paypal_receiver: formData.paypal_receiver,
          payoneer_payee_id: formData.payoneer_payee_id,
          is_default: methods.length === 0 // First method is default
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Withdrawal method added successfully',
        });
        
        setIsAddDialogOpen(false);
        resetForm();
        loadMethods();
        onMethodAdded();
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to add withdrawal method',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error adding method:', error);
      toast({
        title: 'Error',
        description: 'Failed to add withdrawal method',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetDefault = async (methodId: string) => {
    try {
      // This would require an update endpoint
      toast({
        title: 'Info',
        description: 'Set as default functionality coming soon',
      });
    } catch (error) {
      console.error('Error setting default:', error);
    }
  };

  const handleDeleteMethod = async (methodId: string) => {
    try {
      // This would require a delete endpoint
      toast({
        title: 'Info',
        description: 'Delete method functionality coming soon',
      });
    } catch (error) {
      console.error('Error deleting method:', error);
    }
  };

  const resetForm = () => {
    setSelectedRail('');
    setFormData({
      label: '',
      account_name: '',
      stripe_external_account_id: '',
      wise_recipient_id: '',
      paypal_receiver: '',
      payoneer_payee_id: '',
    });
  };

  const validateRailFields = (rail: string, data: any): string | null => {
    switch (rail) {
      case 'stripe':
        if (!data.stripe_external_account_id) {
          return 'External account ID is required for Stripe';
        }
        break;
      case 'wise':
        if (!data.wise_recipient_id) {
          return 'Recipient ID is required for Wise';
        }
        break;
      case 'paypal':
        if (!data.paypal_receiver) {
          return 'PayPal email is required';
        }
        if (!isValidEmail(data.paypal_receiver)) {
          return 'Please enter a valid email address';
        }
        break;
      case 'payoneer':
        if (!data.payoneer_payee_id) {
          return 'Payee ID is required for Payoneer';
        }
        break;
    }
    return null;
  };

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const renderRailForm = () => {
    switch (selectedRail) {
      case 'stripe':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="stripe_external_account_id">External Account ID</Label>
              <Input
                id="stripe_external_account_id"
                value={formData.stripe_external_account_id}
                onChange={(e) => setFormData(prev => ({ ...prev, stripe_external_account_id: e.target.value }))}
                placeholder="ba_1234567890"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Your Stripe external account ID from Connect onboarding
              </p>
            </div>
          </div>
        );
      
      case 'wise':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="wise_recipient_id">Wise Recipient ID</Label>
              <Input
                id="wise_recipient_id"
                value={formData.wise_recipient_id}
                onChange={(e) => setFormData(prev => ({ ...prev, wise_recipient_id: e.target.value }))}
                placeholder="12345678"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Your Wise recipient ID for this account
              </p>
            </div>
          </div>
        );
      
      case 'paypal':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="paypal_receiver">PayPal Email</Label>
              <Input
                id="paypal_receiver"
                type="email"
                value={formData.paypal_receiver}
                onChange={(e) => setFormData(prev => ({ ...prev, paypal_receiver: e.target.value }))}
                placeholder="your@email.com"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The email address associated with your PayPal account
              </p>
            </div>
          </div>
        );
      
      case 'payoneer':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="payoneer_payee_id">Payoneer Payee ID</Label>
              <Input
                id="payoneer_payee_id"
                value={formData.payoneer_payee_id}
                onChange={(e) => setFormData(prev => ({ ...prev, payoneer_payee_id: e.target.value }))}
                placeholder="12345678"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Your Payoneer payee ID from your account
              </p>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Withdrawal Methods</CardTitle>
              <CardDescription>
                Manage your payout methods for receiving withdrawals.
              </CardDescription>
            </div>
            
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Method
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Withdrawal Method</DialogTitle>
                  <DialogDescription>
                    Add a new method for receiving your withdrawals.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="rail">Payment Method</Label>
                    <Select value={selectedRail} onValueChange={setSelectedRail}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a payment method" />
                      </SelectTrigger>
                      <SelectContent>
                        {railOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <span>{option.icon}</span>
                              <span>{option.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="label">Label</Label>
                    <Input
                      id="label"
                      value={formData.label}
                      onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
                      placeholder="My Bank Account"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Give this method a name you'll recognize
                    </p>
                  </div>
                  
                  <div>
                    <Label htmlFor="account_name">Account Name (Optional)</Label>
                    <Input
                      id="account_name"
                      value={formData.account_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, account_name: e.target.value }))}
                      placeholder="John Doe"
                    />
                  </div>
                  
                  {renderRailForm()}
                  
                  <div className="flex gap-3 pt-4">
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setIsAddDialogOpen(false);
                        resetForm();
                      }}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleAddMethod}
                      disabled={isSubmitting || !selectedRail || !formData.label}
                      className="flex-1"
                    >
                      {isSubmitting ? 'Adding...' : 'Add Method'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="h-10 w-10 bg-gray-200 rounded-lg animate-pulse" />
                      <div className="space-y-2">
                        <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                        <div className="h-3 w-48 bg-gray-200 rounded animate-pulse" />
                      </div>
                    </div>
                    <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : methods.length > 0 ? (
            <div className="space-y-4">
              {methods.map((method) => (
                <div key={method.id} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="p-2 rounded-lg bg-muted">
                        <span className="text-lg">{method.icon || '💳'}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{method.label}</span>
                          {method.is_default && (
                            <Badge variant="outline" className="text-xs">
                              <Star className="h-3 w-3 mr-1 fill-current" />
                              Default
                            </Badge>
                          )}
                          {method.supports_instant && (
                            <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                              <Zap className="h-3 w-3 mr-1" />
                              Instant
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <div>{method.rail_name}</div>
                          <div className="flex items-center gap-4 mt-1">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {method.processing_time}
                            </span>
                            {method.account_name && (
                              <span>{method.account_name}</span>
                            )}
                            {method.last_four && (
                              <span>••••{method.last_four}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {method.is_verified && (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <Check className="h-3 w-3 mr-1" />
                          Verified
                        </Badge>
                      )}
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!method.is_default && (
                            <DropdownMenuItem onClick={() => handleSetDefault(method.id)}>
                              <Star className="h-4 w-4 mr-2" />
                              Set as Default
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Method
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDeleteMethod(method.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Method
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="bg-muted/30 p-4 rounded-full mb-4">
                <CreditCard className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No withdrawal methods</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                Add a withdrawal method to start receiving your earnings. You can add bank accounts, PayPal, and other payment methods.
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Method
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}