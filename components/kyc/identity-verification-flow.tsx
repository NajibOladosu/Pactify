'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Shield, AlertCircle, ExternalLink, Camera, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { EnhancedKYCBanner } from './enhanced-kyc-banner';

interface EnhancedKYCStatus {
  hasEnhancedKYC: boolean;
  status: string;
  message: string;
  documentsVerified: boolean;
  completedAt?: string;
  lastAttempt?: string;
  canStartEnhancedKYC: boolean;
}

interface IdentityVerificationFlowProps {
  enhancedKYCStatus: EnhancedKYCStatus;
  onRefresh: () => void;
  className?: string;
}

export function IdentityVerificationFlow({ 
  enhancedKYCStatus, 
  onRefresh, 
  className 
}: IdentityVerificationFlowProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleStartVerification = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/connect/enhanced-kyc/create-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          return_url: `${window.location.origin}/dashboard/settings?tab=verification&enhanced_kyc=complete`
        })
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        // Open verification in new tab
        window.open(data.verification_url, '_blank');
        
        toast({
          title: 'Verification Started',
          description: 'Identity verification opened in new tab. Complete the process and return here.',
        });
        
        // Refresh status after a short delay
        setTimeout(() => {
          onRefresh();
        }, 3000);
      } else {
        throw new Error(data.error || 'Failed to start verification');
      }
    } catch (error) {
      console.error('Error starting verification:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start verification',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getVerificationSteps = () => {
    const steps = [
      {
        icon: FileText,
        title: 'Prepare Documents',
        description: 'Have a government-issued ID ready (driver&apos;s license, passport, or ID card)',
        completed: enhancedKYCStatus.status !== 'not_started'
      },
      {
        icon: Camera,
        title: 'Upload Documents',
        description: 'Take clear photos of your ID and a selfie for verification',
        completed: ['documents_submitted', 'under_review', 'verified'].includes(enhancedKYCStatus.status)
      },
      {
        icon: Shield,
        title: 'Identity Review',
        description: 'Our partner reviews your documents (usually takes a few minutes)',
        completed: enhancedKYCStatus.status === 'verified'
      },
      {
        icon: CheckCircle,
        title: 'Verification Complete',
        description: 'You can now process high-value transactions',
        completed: enhancedKYCStatus.status === 'verified'
      }
    ];
    return steps;
  };

  const steps = getVerificationSteps();

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Status Banner */}
      {enhancedKYCStatus.status !== 'verified' && (
        <EnhancedKYCBanner
          status={enhancedKYCStatus.status as any}
          message={enhancedKYCStatus.message}
          lastAttempt={enhancedKYCStatus.lastAttempt}
          onStartVerification={handleStartVerification}
          onRefreshStatus={onRefresh}
          isLoading={isLoading}
        />
      )}

      {/* Main Verification Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <CardTitle>Enhanced Identity Verification</CardTitle>
            </div>
            {enhancedKYCStatus.hasEnhancedKYC && (
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            )}
          </div>
          <CardDescription>
            Enhanced verification is required for transactions over $100. This process typically takes just a few minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {enhancedKYCStatus.hasEnhancedKYC ? (
            // Verified State
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 mx-auto text-green-600 dark:text-green-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2 text-foreground">Identity Verified!</h3>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                Your identity has been successfully verified. You can now process transactions of any amount.
              </p>
              {enhancedKYCStatus.completedAt && (
                <p className="text-sm text-muted-foreground">
                  Verified on {new Date(enhancedKYCStatus.completedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          ) : (
            // Unverified State - Show Process Steps
            <div className="space-y-6">
              {/* Verification Steps */}
              <div className="space-y-4">
                <h4 className="font-medium text-foreground">Verification Process</h4>
                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg flex-shrink-0 ${
                        step.completed 
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        <step.icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <h5 className={`font-medium text-sm ${
                          step.completed ? 'text-green-600 dark:text-green-400' : 'text-foreground'
                        }`}>
                          {step.title}
                        </h5>
                        <p className="text-sm text-muted-foreground">
                          {step.description}
                        </p>
                      </div>
                      {step.completed && (
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Requirements Info */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h5 className="font-medium text-sm text-blue-700 dark:text-blue-300">
                      What You&apos;ll Need
                    </h5>
                    <ul className="text-sm text-blue-600 dark:text-blue-400 mt-1 space-y-1">
                      <li>• A valid government-issued photo ID (driver&apos;s license, passport, or state ID)</li>
                      <li>• A clear, well-lit area for taking photos</li>
                      <li>• About 2-3 minutes to complete the process</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={onRefresh}
                  variant="outline"
                  size="sm"
                  disabled={isLoading}
                >
                  Refresh Status
                </Button>
                
                {enhancedKYCStatus.canStartEnhancedKYC && (
                  <Button
                    onClick={handleStartVerification}
                    disabled={isLoading}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {enhancedKYCStatus.status === 'not_started' ? 'Start Verification' : 'Continue Verification'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}