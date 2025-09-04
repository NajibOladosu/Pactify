'use client';

import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface KYCVerificationBannerProps {
  status: 'verified' | 'pending' | 'action_required' | 'onboarding_required' | 'not_created';
  message?: string;
  missingRequirements?: string[];
  pastDueRequirements?: string[];
  disabledReason?: string;
  onCreateAccount?: () => void;
  onContinueOnboarding?: () => void;
  onRefreshStatus?: () => void;
  isLoading?: boolean;
}

export function KYCVerificationBanner({
  status,
  message,
  missingRequirements = [],
  pastDueRequirements = [],
  disabledReason,
  onCreateAccount,
  onContinueOnboarding,
  onRefreshStatus,
  isLoading = false
}: KYCVerificationBannerProps) {
  if (status === 'verified') {
    return null; // No banner needed for verified accounts
  }

  const getConfig = () => {
    switch (status) {
      case 'not_created':
        return {
          title: 'Set up your payment account',
          description: 'To receive payments, you need to set up and verify your Stripe Connect account.',
          variant: 'default' as const,
          primaryAction: {
            label: 'Set Up Account',
            onClick: onCreateAccount,
            icon: ExternalLink
          }
        };
      case 'onboarding_required':
        return {
          title: 'Complete your account setup',
          description: message || 'Your payment account setup is incomplete. Complete the onboarding process to receive payments.',
          variant: 'destructive' as const,
          primaryAction: {
            label: 'Continue Setup',
            onClick: onContinueOnboarding,
            icon: ExternalLink
          }
        };
      case 'action_required':
        return {
          title: 'Account verification required',
          description: message || 'Your payment account needs additional verification before you can receive payments.',
          variant: 'destructive' as const,
          primaryAction: {
            label: 'Complete Verification',
            onClick: onContinueOnboarding,
            icon: ExternalLink
          }
        };
      case 'pending':
        return {
          title: 'Verification in progress',
          description: message || 'Your account verification is being processed. This usually takes a few minutes.',
          variant: 'default' as const,
          primaryAction: {
            label: 'Refresh Status',
            onClick: onRefreshStatus,
            icon: RefreshCw
          }
        };
      default:
        return {
          title: 'Account status unknown',
          description: 'Unable to determine account status.',
          variant: 'default' as const,
          primaryAction: {
            label: 'Check Status',
            onClick: onRefreshStatus,
            icon: RefreshCw
          }
        };
    }
  };

  const config = getConfig();

  return (
    <Card className={`border-l-4 ${
      config.variant === 'destructive' ? 'border-l-destructive bg-destructive/5' : 
      'border-l-primary bg-primary/5'
    }`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <AlertTriangle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
              config.variant === 'destructive' ? 'text-destructive' : 'text-primary'
            }`} />
            <div className="flex-1 min-w-0">
              <h3 className={`font-semibold text-sm ${
                config.variant === 'destructive' ? 'text-destructive' : 'text-foreground'
              }`}>
                {config.title}
              </h3>
              <p className={`text-sm mt-1 ${
                config.variant === 'destructive' ? 'text-destructive/80' : 'text-muted-foreground'
              }`}>
                {config.description}
              </p>
              
              {/* Show requirements */}
              {(missingRequirements.length > 0 || pastDueRequirements.length > 0) && (
                <div className="mt-3 space-y-2">
                  {pastDueRequirements.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-destructive mb-1">Past due requirements:</p>
                      <div className="flex flex-wrap gap-1">
                        {pastDueRequirements.map((req, index) => (
                          <Badge key={index} variant="destructive" className="text-xs">
                            {formatRequirement(req)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {missingRequirements.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-1">Required information:</p>
                      <div className="flex flex-wrap gap-1">
                        {missingRequirements.map((req, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {formatRequirement(req)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {disabledReason && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-destructive">Issue: {disabledReason}</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex gap-2 flex-shrink-0">
            {onRefreshStatus && (
              <Button
                size="sm"
                variant="outline"
                onClick={onRefreshStatus}
                disabled={isLoading}
                className="text-xs"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            )}
            
            {config.primaryAction && (
              <Button
                size="sm"
                variant={config.variant === 'destructive' ? 'destructive' : 'default'}
                onClick={config.primaryAction.onClick}
                disabled={isLoading}
                className="text-xs"
              >
                <config.primaryAction.icon className="h-3 w-3 mr-1" />
                {config.primaryAction.label}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper function to format requirement names into human-readable text
function formatRequirement(requirement: string): string {
  const requirementMap: Record<string, string> = {
    'individual.first_name': 'First name',
    'individual.last_name': 'Last name',
    'individual.dob.day': 'Date of birth',
    'individual.dob.month': 'Date of birth',
    'individual.dob.year': 'Date of birth',
    'individual.address.line1': 'Address',
    'individual.address.city': 'City',
    'individual.address.state': 'State',
    'individual.address.postal_code': 'Postal code',
    'individual.id_number': 'ID number (SSN)',
    'individual.verification.document': 'ID document',
    'individual.verification.additional_document': 'Additional ID document',
    'business_type': 'Business type',
    'business_profile.mcc': 'Business category',
    'business_profile.url': 'Business website',
    'external_account': 'Bank account',
    'tos_acceptance.date': 'Terms acceptance',
    'tos_acceptance.ip': 'Terms acceptance'
  };

  return requirementMap[requirement] || requirement.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}