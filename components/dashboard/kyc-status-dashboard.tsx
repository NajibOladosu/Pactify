"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { 
  ShieldCheckIcon, 
  ShieldIcon, 
  BuildingIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  FileTextIcon,
  ExternalLinkIcon,
  InfoIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface KycVerification {
  id: string;
  verification_level: 'basic' | 'enhanced' | 'business';
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  stripe_account_id?: string;
  approved_at?: string;
  rejected_at?: string;
  rejection_reason?: string;
  documents_uploaded?: any[];
  created_at: string;
  updated_at: string;
}

interface Profile {
  id: string;
  kyc_status?: 'pending' | 'under_review' | 'approved' | 'rejected';
  verification_level?: 'basic' | 'enhanced' | 'business';
  stripe_connect_account_id?: string;
}

interface KycStatusDashboardProps {
  kycVerification?: KycVerification | null;
  profile?: Profile | null;
}

const VERIFICATION_LEVELS = {
  basic: {
    name: 'Basic Verification',
    description: 'Email verification and basic profile information',
    icon: ShieldIcon,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    features: [
      'Email verification',
      'Basic profile setup',
      'Limited contract creation'
    ]
  },
  enhanced: {
    name: 'Enhanced Verification',
    description: 'Identity verification with government-issued ID',
    icon: ShieldCheckIcon,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    features: [
      'Government ID verification',
      'Address verification',
      'Unlimited contracts',
      'Lower escrow fees',
      'Stripe Connect access'
    ]
  },
  business: {
    name: 'Business Verification',
    description: 'Full business verification with documentation',
    icon: BuildingIcon,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    features: [
      'Business registration documents',
      'Tax ID verification',
      'Enhanced payment limits',
      'Priority support',
      'Team collaboration features'
    ]
  }
};

const STATUS_CONFIG = {
  pending: {
    icon: ClockIcon,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    label: 'Pending'
  },
  under_review: {
    icon: ClockIcon,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Under Review'
  },
  approved: {
    icon: CheckCircleIcon,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    label: 'Approved'
  },
  rejected: {
    icon: XCircleIcon,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    label: 'Rejected'
  }
};

export default function KycStatusDashboard({ kycVerification, profile }: KycStatusDashboardProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showStripeOnboarding, setShowStripeOnboarding] = useState(false);

  const currentLevel = kycVerification?.verification_level || 'basic';
  const currentStatus = kycVerification?.status || (profile?.kyc_status as keyof typeof STATUS_CONFIG) || 'pending';
  const hasStripeAccount = !!kycVerification?.stripe_account_id || !!profile?.stripe_connect_account_id;

  // Calculate progress percentage
  const getProgressPercentage = () => {
    if (currentStatus === 'approved') {
      switch (currentLevel) {
        case 'basic': return 33;
        case 'enhanced': return 66;
        case 'business': return 100;
        default: return 0;
      }
    } else if (currentStatus === 'under_review') {
      switch (currentLevel) {
        case 'basic': return 25;
        case 'enhanced': return 50;
        case 'business': return 75;
        default: return 0;
      }
    } else if (currentStatus === 'pending') {
      return 10;
    }
    return 0;
  };

  const handleStartVerification = (level: 'enhanced' | 'business') => {
    startTransition(async () => {
      try {
        const response = await fetch('/api/kyc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verification_level: level })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Failed to start verification');
        }

        toast({
          title: "Verification Started",
          description: `Your ${level} verification has been initiated. Please upload the required documents.`,
        });

        // Refresh the page to show updated status
        window.location.reload();
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to start verification",
          variant: "destructive",
        });
      }
    });
  };

  const handleStripeOnboarding = () => {
    startTransition(async () => {
      try {
        const response = await fetch('/api/kyc/stripe-onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ country: 'US', business_type: 'individual' })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Failed to start Stripe onboarding');
        }

        // Redirect to Stripe onboarding
        window.open(result.onboarding_link.url, '_blank');

        toast({
          title: "Stripe Onboarding Started",
          description: "Please complete the Stripe Connect onboarding process in the new tab.",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to start Stripe onboarding",
          variant: "destructive",
        });
      }
    });
  };

  const currentLevelConfig = VERIFICATION_LEVELS[currentLevel];
  const statusConfig = STATUS_CONFIG[currentStatus];
  const StatusIcon = statusConfig.icon;
  const LevelIcon = currentLevelConfig.icon;

  return (
    <div className="space-y-6">
      {/* Current Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LevelIcon className={cn("h-5 w-5", currentLevelConfig.color)} />
            Verification Status
          </CardTitle>
          <CardDescription>
            Your current verification level and progress
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Badge and Progress */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-full", statusConfig.bgColor)}>
                <StatusIcon className={cn("h-4 w-4", statusConfig.color)} />
              </div>
              <div>
                <h3 className="font-medium">{currentLevelConfig.name}</h3>
                <div className="flex items-center gap-2">
                  <Badge variant={currentStatus === 'approved' ? 'default' : 'secondary'}>
                    {statusConfig.label}
                  </Badge>
                  {currentStatus === 'rejected' && kycVerification?.rejection_reason && (
                    <span className="text-sm text-red-600">
                      - {kycVerification.rejection_reason}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Verification Progress</span>
              <span>{getProgressPercentage()}%</span>
            </div>
            <Progress value={getProgressPercentage()} className="h-2" />
          </div>

          {/* Current Level Features */}
          <div className={cn("p-4 rounded-lg border", currentLevelConfig.borderColor, currentLevelConfig.bgColor)}>
            <h4 className="font-medium mb-2">Current Features</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {currentLevelConfig.features.map((feature, index) => (
                <div key={index} className="flex items-center gap-2">
                  <CheckCircleIcon className={cn("h-4 w-4", currentLevelConfig.color)} />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stripe Connect Status */}
          {(currentLevel === 'enhanced' || currentLevel === 'business') && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Stripe Connect Account</h4>
                  <p className="text-sm text-muted-foreground">
                    Required for receiving payments
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {hasStripeAccount ? (
                    <>
                      <CheckCircleIcon className="h-4 w-4 text-green-600" />
                      <Badge variant="default">Connected</Badge>
                    </>
                  ) : (
                    <>
                      <AlertTriangleIcon className="h-4 w-4 text-orange-600" />
                      <Badge variant="secondary">Not Connected</Badge>
                    </>
                  )}
                </div>
              </div>
              
              {!hasStripeAccount && currentStatus === 'approved' && (
                <div className="mt-3">
                  <Button
                    onClick={handleStripeOnboarding}
                    disabled={isPending}
                    size="sm"
                  >
                    <ExternalLinkIcon className="h-4 w-4 mr-2" />
                    Connect Stripe Account
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upgrade Options */}
      {currentLevel !== 'business' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {currentLevel === 'basic' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheckIcon className="h-5 w-5 text-green-600" />
                  Enhanced Verification
                </CardTitle>
                <CardDescription>
                  Unlock full platform features with identity verification
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  {VERIFICATION_LEVELS.enhanced.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <CheckCircleIcon className="h-4 w-4 text-green-600" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <InfoIcon className="h-4 w-4 text-blue-600 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-900">Required Documents:</p>
                      <ul className="text-blue-700 mt-1 list-disc list-inside">
                        <li>Government-issued photo ID</li>
                        <li>Proof of address (utility bill or bank statement)</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => handleStartVerification('enhanced')}
                  disabled={isPending || (kycVerification != null && ['under_review', 'approved'].includes(currentStatus))}
                  className="w-full"
                >
                  {currentStatus === 'under_review' ? 'Under Review' : 
                   currentStatus === 'approved' ? 'Already Verified' : 
                   'Start Enhanced Verification'}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BuildingIcon className="h-5 w-5 text-purple-600" />
                Business Verification
              </CardTitle>
              <CardDescription>
                Maximum features for business accounts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                {VERIFICATION_LEVELS.business.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <CheckCircleIcon className="h-4 w-4 text-purple-600" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
              
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <InfoIcon className="h-4 w-4 text-purple-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-purple-900">Required Documents:</p>
                    <ul className="text-purple-700 mt-1 list-disc list-inside">
                      <li>Business registration certificate</li>
                      <li>Tax ID documentation</li>
                      <li>Bank account verification</li>
                      <li>Authorized signatory ID</li>
                    </ul>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => handleStartVerification('business')}
                disabled={isPending || currentLevel === 'basic' || (kycVerification != null && ['under_review', 'approved'].includes(currentStatus) && currentLevel === 'business')}
                variant="outline"
                className="w-full"
              >
                {currentLevel === 'basic' ? 'Complete Enhanced First' :
                 (currentStatus === 'under_review' && currentLevel === 'business') ? 'Under Review' :
                 (currentStatus === 'approved' && currentLevel === 'business') ? 'Already Verified' :
                 'Start Business Verification'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileTextIcon className="h-5 w-5" />
            Need Help?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium mb-2">Verification Process</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Documents are reviewed within 1-2 business days</li>
                <li>• Ensure all documents are clear and legible</li>
                <li>• Personal information must match exactly</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Accepted Documents</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Passport, driver's license, or national ID</li>
                <li>• Utility bills dated within 90 days</li>
                <li>• Bank statements (recent)</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t">
            <Button variant="outline" size="sm">
              <ExternalLinkIcon className="h-4 w-4 mr-2" />
              View Verification Guide
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}