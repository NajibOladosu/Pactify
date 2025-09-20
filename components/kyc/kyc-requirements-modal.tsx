'use client';

import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Shield, FileText, ExternalLink } from 'lucide-react';

interface KYCRequirementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  requirementType: 'basic' | 'enhanced';
  amount?: number;
  amountThreshold?: number;
  currentStatus?: {
    basicKYC?: boolean;
    enhancedKYC?: boolean;
  };
  onStartVerification?: () => void;
}

export function KYCRequirementsModal({
  isOpen,
  onClose,
  requirementType,
  amount,
  amountThreshold = 100,
  onStartVerification
}: KYCRequirementsModalProps) {
  const handleStartVerification = () => {
    onStartVerification?.();
    onClose();
  };

  const getModalContent = () => {
    if (requirementType === 'enhanced') {
      return {
        title: 'Enhanced Verification Required',
        icon: FileText,
        iconColor: 'text-orange-600 dark:text-orange-400',
        description: `Enhanced identity verification is required for transactions over $${amountThreshold}.`,
        details: [
          'Government-issued photo ID verification',
          'Selfie verification for identity matching',
          'Secure document processing by Stripe Identity',
          'Usually completed within minutes'
        ]
      };
    } else {
      return {
        title: 'Payment Account Setup Required',
        icon: Shield,
        iconColor: 'text-blue-600 dark:text-blue-400',
        description: 'You need to set up and verify your payment account before processing transactions.',
        details: [
          'Create Stripe Connect account',
          'Provide basic business information',
          'Verify bank account details',
          'Complete standard KYC verification'
        ]
      };
    }
  };

  const content = getModalContent();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
            requirementType === 'enhanced' 
              ? 'bg-orange-500/10' 
              : 'bg-blue-500/10'
          }`}>
            <content.icon className={`w-6 h-6 ${content.iconColor}`} />
          </div>
          <DialogTitle className="text-xl">{content.title}</DialogTitle>
          <DialogDescription className="text-base">
            {content.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Amount Info */}
          {amount && (
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Transaction Amount:</span>
                <span className="font-medium text-foreground">${amount.toFixed(2)}</span>
              </div>
              {requirementType === 'enhanced' && (
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Verification Threshold:</span>
                  <span className="text-muted-foreground">${amountThreshold}</span>
                </div>
              )}
            </div>
          )}

          {/* Requirements List */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-foreground">What&apos;s Required:</h4>
            <ul className="space-y-1">
              {content.details.map((detail, index) => (
                <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  {detail}
                </li>
              ))}
            </ul>
          </div>

          {/* Status Info */}
          <div className={`rounded-lg p-4 border ${
            requirementType === 'enhanced' 
              ? 'border-orange-500/20 bg-orange-500/5' 
              : 'border-blue-500/20 bg-blue-500/5'
          }`}>
            <div className="flex items-start gap-2">
              <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                requirementType === 'enhanced' 
                  ? 'text-orange-600 dark:text-orange-400' 
                  : 'text-blue-600 dark:text-blue-400'
              }`} />
              <div>
                <p className={`text-sm font-medium ${
                  requirementType === 'enhanced' 
                    ? 'text-orange-700 dark:text-orange-300' 
                    : 'text-blue-700 dark:text-blue-300'
                }`}>
                  {requirementType === 'enhanced' 
                    ? 'Enhanced verification protects high-value transactions'
                    : 'Account verification is required for all payments'
                  }
                </p>
                <p className={`text-xs mt-1 ${
                  requirementType === 'enhanced' 
                    ? 'text-orange-600 dark:text-orange-400' 
                    : 'text-blue-600 dark:text-blue-400'
                }`}>
                  This process is secure, encrypted, and typically takes just a few minutes.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={handleStartVerification} 
              className="flex-1"
              disabled={!onStartVerification}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              {requirementType === 'enhanced' ? 'Verify Identity' : 'Set Up Account'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}