'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CreditCard, Shield, ExternalLink } from 'lucide-react';
import { KYCStatusPill } from './kyc-status-pill';
import { KYCVerificationBanner } from './kyc-verification-banner';
import { IdentityVerificationFlow } from './identity-verification-flow';
import { useToast } from '@/components/ui/use-toast';

interface KYCStatus {
  hasAccount: boolean;
  status: 'verified' | 'pending' | 'action_required' | 'onboarding_required' | 'not_created';
  message: string;
  account?: {
    id: string;
    payouts_enabled: boolean;
    charges_enabled: boolean;
    details_submitted: boolean;
    capabilities: {
      transfers?: string;
      card_payments?: string;
    };
    requirements: {
      currently_due: string[];
      past_due: string[];
      eventually_due: string[];
      disabled_reason?: string;
    };
    verification_status: {
      is_verified: boolean;
      can_receive_payouts: boolean;
      missing_requirements: string[];
      onboarding_completed: boolean;
    };
  };
}

interface KYCDashboardSectionProps {
  userType: string;
  className?: string;
}

export function KYCDashboardSection({ userType, className }: KYCDashboardSectionProps) {
  const [kycStatus, setKycStatus] = useState<KYCStatus | null>(null);
  const [enhancedKYCStatus, setEnhancedKYCStatus] = useState<{
    hasEnhancedKYC: boolean;
    status: string;
    message: string;
    documentsVerified: boolean;
    completedAt?: string;
    lastAttempt?: string;
    canStartEnhancedKYC: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchKYCStatus = async () => {
    setIsLoading(true);
    try {
      // Fetch basic KYC status
      const basicResponse = await fetch('/api/connect/account-status');
      const basicData = await basicResponse.json();
      
      if (basicResponse.ok) {
        setKycStatus(basicData);
      } else {
        throw new Error(basicData.error || 'Failed to fetch basic KYC status');
      }

      // Fetch enhanced KYC status
      const enhancedResponse = await fetch('/api/connect/enhanced-kyc/status');
      const enhancedData = await enhancedResponse.json();
      
      if (enhancedResponse.ok) {
        setEnhancedKYCStatus(enhancedData);
      } else {
        console.error('Failed to fetch enhanced KYC status:', enhancedData.error);
        // Set default enhanced KYC status
        setEnhancedKYCStatus({
          hasEnhancedKYC: false,
          status: 'not_started',
          message: 'Enhanced verification not started',
          documentsVerified: false,
          canStartEnhancedKYC: false
        });
      }
    } catch (error) {
      console.error('Error fetching KYC status:', error);
      toast({
        title: 'Error',
        description: 'Failed to load verification status',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/connect/create-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          country: 'US',
          business_type: 'individual',
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Stripe Connect account created successfully',
        });
        
        // Open onboarding in new tab
        window.open(data.onboardingUrl, '_blank');
        
        // Refresh status after a short delay
        setTimeout(() => {
          fetchKYCStatus();
        }, 2000);
      } else {
        throw new Error(data.error || 'Failed to create account');
      }
    } catch (error) {
      console.error('Error creating account:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create account',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueOnboarding = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/connect/onboarding-link', {
        method: 'POST',
      });

      const data = await response.json();
      
      if (response.ok) {
        // Open onboarding in new tab
        window.open(data.onboardingUrl, '_blank');
        
        toast({
          title: 'Onboarding Link Created',
          description: 'Continue your verification in the new tab',
        });
        
        // Refresh status after a short delay
        setTimeout(() => {
          fetchKYCStatus();
        }, 2000);
      } else {
        throw new Error(data.error || 'Failed to create onboarding link');
      }
    } catch (error) {
      console.error('Error creating onboarding link:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create onboarding link',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load KYC status on first render
  React.useEffect(() => {
    fetchKYCStatus();
  }, []);

  // Only show for freelancers or users with 'both' type
  if (userType !== 'freelancer' && userType !== 'both') {
    return null;
  }

  if (isLoading && !kycStatus) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Payment Account Verification
          </CardTitle>
          <CardDescription>
            Set up your payment account to receive funds from completed contracts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Verification Banner */}
      {kycStatus && (
        <KYCVerificationBanner
          status={kycStatus.status}
          message={kycStatus.message}
          missingRequirements={kycStatus.account?.requirements.currently_due}
          pastDueRequirements={kycStatus.account?.requirements.past_due}
          disabledReason={kycStatus.account?.requirements.disabled_reason}
          onCreateAccount={handleCreateAccount}
          onContinueOnboarding={handleContinueOnboarding}
          onRefreshStatus={fetchKYCStatus}
          isLoading={isLoading}
        />
      )}

      {/* Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <CardTitle>Payment Account Verification</CardTitle>
            </div>
            {kycStatus && (
              <KYCStatusPill status={kycStatus.status} />
            )}
          </div>
          <CardDescription>
            Verify your identity to receive payments from completed contracts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {kycStatus?.hasAccount && kycStatus.account ? (
            <div className="space-y-4">
              {/* Account Details */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Account Status</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <div>Account ID: <code className="text-xs bg-muted px-1 rounded text-foreground">{kycStatus.account.id}</code></div>
                    <div>Transfers: <span className={`font-medium ${
                      kycStatus.account.capabilities.transfers === 'active' ? 'text-green-600 dark:text-green-400' : 'text-destructive'
                    }`}>
                      {kycStatus.account.capabilities.transfers === 'active' ? 'Active' : 'Inactive'}
                    </span></div>
                    <div>Payouts: <span className={`font-medium ${
                      kycStatus.account.payouts_enabled ? 'text-green-600 dark:text-green-400' : 'text-destructive'
                    }`}>
                      {kycStatus.account.payouts_enabled ? 'Enabled' : 'Disabled'}
                    </span></div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Verification</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <div>Details submitted: <span className={`font-medium ${
                      kycStatus.account.details_submitted ? 'text-green-600 dark:text-green-400' : 'text-destructive'
                    }`}>
                      {kycStatus.account.details_submitted ? 'Yes' : 'No'}
                    </span></div>
                    <div>Can receive payouts: <span className={`font-medium ${
                      kycStatus.account.verification_status.can_receive_payouts ? 'text-green-600 dark:text-green-400' : 'text-destructive'
                    }`}>
                      {kycStatus.account.verification_status.can_receive_payouts ? 'Yes' : 'No'}
                    </span></div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  onClick={fetchKYCStatus}
                  variant="outline"
                  size="sm"
                  disabled={isLoading}
                >
                  Refresh Status
                </Button>
                
                {!kycStatus.account.verification_status.is_verified && (
                  <Button
                    onClick={handleContinueOnboarding}
                    size="sm"
                    disabled={isLoading}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Continue Verification
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2 text-foreground">Set up your payment account</h3>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                To receive payments from completed contracts, you need to set up and verify your Stripe Connect account.
              </p>
              <Button
                onClick={handleCreateAccount}
                disabled={isLoading}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Set Up Payment Account
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enhanced KYC Section - Only show if basic KYC is complete */}
      {kycStatus?.hasAccount && kycStatus.account && enhancedKYCStatus && (
        <IdentityVerificationFlow
          enhancedKYCStatus={enhancedKYCStatus}
          onRefresh={fetchKYCStatus}
        />
      )}
    </div>
  );
}