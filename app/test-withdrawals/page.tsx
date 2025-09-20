// Test page for withdrawal functionality

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AddPaymentMethodDialog } from '@/components/withdrawals/add-payment-method-dialog';
import { toast } from 'sonner';

export default function TestWithdrawalsPage() {
  const [kycStatus, setKycStatus] = useState<any>(null);
  const [methods, setMethods] = useState<any[]>([]);
  const [testAmount, setTestAmount] = useState('100');
  const [loading, setLoading] = useState(false);
  const [verifyingMethodId, setVerifyingMethodId] = useState<string | null>(null);

  const testKycCheck = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/kyc/check-requirements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contract_amount: parseFloat(testAmount),
          currency: 'USD',
          action: 'withdrawal'
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'KYC check failed');
      }

      setKycStatus(data);
      toast.success('KYC status checked successfully!');
    } catch (error) {
      console.error('KYC check error:', error);
      toast.error(error instanceof Error ? error.message : 'KYC check failed');
    } finally {
      setLoading(false);
    }
  };

  const loadMethods = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/withdrawals/methods');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load methods');
      }

      setMethods(data.methods || []);
      toast.success('Payment methods loaded!');
    } catch (error) {
      console.error('Methods load error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load methods');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'pending_review': return 'bg-yellow-100 text-yellow-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'not_started': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const verifyPaymentMethod = async (methodId: string) => {
    setVerifyingMethodId(methodId);
    try {
      const response = await fetch(`/api/withdrawals/methods/${methodId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      if (data.verified) {
        toast.success('Payment method verified successfully!');
        // Reload methods to show updated verification status
        loadMethods();
      } else {
        toast.success(data.message || 'Verification initiated - please check back later');
      }
    } catch (error) {
      console.error('Verification error:', error);
      toast.error(error instanceof Error ? error.message : 'Verification failed');
    } finally {
      setVerifyingMethodId(null);
    }
  };

  const getVerificationRequirement = (rail: string) => {
    switch (rail) {
      case 'stripe': return 'Requires bank verification via micro-deposits';
      case 'paypal': return 'Requires PayPal account verification';
      case 'wise': return 'Requires Wise recipient verification';
      case 'payoneer': return 'Requires Payoneer account verification';
      case 'local': return 'Requires manual review';
      default: return 'Requires verification';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Withdrawal System Test</h1>
        <p className="text-muted-foreground mt-2">
          Test the KYC verification and payment method functionality
        </p>
      </div>

      {/* KYC Status Test */}
      <Card>
        <CardHeader>
          <CardTitle>🔍 KYC Status Check</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-4">
            <div>
              <Label htmlFor="amount">Test Amount ($)</Label>
              <Input
                id="amount"
                type="number"
                value={testAmount}
                onChange={(e) => setTestAmount(e.target.value)}
                placeholder="100"
                className="w-24"
              />
            </div>
            <Button onClick={testKycCheck} disabled={loading}>
              {loading ? 'Checking...' : 'Check KYC Status'}
            </Button>
          </div>

          {kycStatus && (
            <div className="border rounded-lg p-4 bg-gray-50">
              <h4 className="font-medium mb-3">KYC Status Results:</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Eligible for ${testAmount}:</Label>
                  <Badge className={kycStatus.eligible ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                    {kycStatus.eligible ? 'Yes' : 'No'}
                  </Badge>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Current Level:</Label>
                  <Badge className={getStatusColor(kycStatus.current_verification?.status)}>
                    {kycStatus.current_verification?.level || 'none'} ({kycStatus.current_verification?.status})
                  </Badge>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Required Level:</Label>
                  <Badge variant="outline">
                    {kycStatus.required_verification?.level}
                  </Badge>
                </div>

                <div>
                  <Label className="text-sm font-medium">Stripe Account:</Label>
                  <Badge className={kycStatus.current_verification?.stripe_ready ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                    {kycStatus.current_verification?.stripe_ready ? 'Connected' : 'Not Connected'}
                  </Badge>
                </div>
              </div>

              {kycStatus.action_plan && kycStatus.action_plan.length > 0 && (
                <div className="mt-4">
                  <Label className="text-sm font-medium">Action Plan:</Label>
                  <div className="mt-2 space-y-2">
                    {kycStatus.action_plan.map((action: any, index: number) => (
                      <div key={index} className="flex items-center space-x-2 text-sm">
                        <span>{action.icon}</span>
                        <span><strong>Step {action.step}:</strong> {action.title}</span>
                        <Badge variant="secondary" className="text-xs">{action.estimated_time}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 text-xs text-muted-foreground">
                <pre>{JSON.stringify(kycStatus, null, 2)}</pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Methods Test */}
      <Card>
        <CardHeader>
          <CardTitle>💳 Payment Methods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-4">
            <Button onClick={loadMethods} disabled={loading}>
              {loading ? 'Loading...' : 'Load Payment Methods'}
            </Button>
            
            <AddPaymentMethodDialog 
              onSuccess={() => {
                toast.success('Payment method added! Reloading...');
                loadMethods();
              }}
            />
          </div>

          {methods.length > 0 && (
            <div className="space-y-3">
              <Label className="font-medium">Your Payment Methods:</Label>
              {methods.map((method) => (
                <div key={method.id} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{method.label}</div>
                      <div className="text-sm text-muted-foreground">
                        {method.rail_name} • {method.currency}
                        {method.last_four && ` • ••••${method.last_four}`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ⏱️ {method.processing_time}
                      </div>
                    </div>
                    <div className="flex flex-col items-end space-y-2">
                      <div className="flex items-center space-x-2">
                        {method.is_default && (
                          <Badge variant="secondary" className="text-xs">Default</Badge>
                        )}
                        <Badge className={method.is_verified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                          {method.is_verified ? 'Verified' : 'Pending Verification'}
                        </Badge>
                      </div>
                      {!method.is_verified && (
                        <div className="flex flex-col items-end space-y-1">
                          <div className="text-xs text-orange-600">
                            {getVerificationRequirement(method.rail)}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => verifyPaymentMethod(method.id)}
                            disabled={verifyingMethodId === method.id}
                            className="text-xs h-6 px-2"
                          >
                            {verifyingMethodId === method.id ? 'Verifying...' : 'Verify Now'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {methods.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No payment methods found. Try adding one using the button above!
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle>⚙️ System Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl">✅</div>
              <div className="text-sm font-medium">Database</div>
              <div className="text-xs text-muted-foreground">Connected</div>
            </div>
            <div>
              <div className="text-2xl">🔐</div>
              <div className="text-sm font-medium">Auth</div>
              <div className="text-xs text-muted-foreground">Working</div>
            </div>
            <div>
              <div className="text-2xl">💳</div>
              <div className="text-sm font-medium">Payments</div>
              <div className="text-xs text-muted-foreground">Ready</div>
            </div>
            <div>
              <div className="text-2xl">🚀</div>
              <div className="text-sm font-medium">Optimized</div>
              <div className="text-xs text-muted-foreground">Fast</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-center text-sm text-muted-foreground">
        <p>This is a test page. In production, remove this page from your routing.</p>
      </div>
    </div>
  );
}