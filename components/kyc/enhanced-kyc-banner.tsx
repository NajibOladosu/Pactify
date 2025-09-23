'use client';

import { FileText, Shield, ExternalLink, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface EnhancedKYCBannerProps {
  status: 'not_started' | 'verification_session_created' | 'documents_submitted' | 'under_review' | 'verified' | 'failed';
  amount?: number;
  amountThreshold?: number;
  lastAttempt?: string;
  message?: string;
  onStartVerification?: () => void;
  onRefreshStatus?: () => void;
  isLoading?: boolean;
  className?: string;
}

export function EnhancedKYCBanner({
  status,
  amount,
  amountThreshold = 100,
  lastAttempt,
  message,
  onStartVerification,
  onRefreshStatus,
  isLoading = false,
  className = ''
}: EnhancedKYCBannerProps) {
  // Don't show banner if already verified
  if (status === 'verified') {
    return null;
  }

  const getConfig = () => {
    switch (status) {
      case 'not_started':
        return {
          title: 'Enhanced Identity Verification Required',
          description: amount 
            ? `Enhanced verification is required for payments over $${amountThreshold}. Current amount: $${amount.toFixed(2)}`
            : `Enhanced identity verification is required for high-value transactions over $${amountThreshold}.`,
          variant: 'warning' as const,
          icon: FileText,
          iconColor: 'text-orange-600 dark:text-orange-400',
          primaryAction: {
            label: 'Verify Identity',
            onClick: onStartVerification,
            icon: ExternalLink
          }
        };
      case 'verification_session_created':
        return {
          title: 'Complete Identity Verification',
          description: 'Your verification session has been created. Please complete the document upload process.',
          variant: 'warning' as const,
          icon: AlertTriangle,
          iconColor: 'text-orange-600 dark:text-orange-400',
          primaryAction: {
            label: 'Continue Verification',
            onClick: onStartVerification,
            icon: ExternalLink
          }
        };
      case 'documents_submitted':
        return {
          title: 'Documents Submitted',
          description: 'Your identity documents have been submitted and are being processed.',
          variant: 'info' as const,
          icon: Clock,
          iconColor: 'text-blue-600 dark:text-blue-400',
          primaryAction: null
        };
      case 'under_review':
        return {
          title: 'Documents Under Review',
          description: 'Your identity documents are being reviewed by our verification partner. This usually takes a few minutes.',
          variant: 'info' as const,
          icon: Clock,
          iconColor: 'text-blue-600 dark:text-blue-400',
          primaryAction: null
        };
      case 'failed':
        return {
          title: 'Verification Failed',
          description: 'Identity verification was unsuccessful. Please try again with clear, valid identification documents.',
          variant: 'destructive' as const,
          icon: AlertTriangle,
          iconColor: 'text-destructive',
          primaryAction: {
            label: 'Try Again',
            onClick: onStartVerification,
            icon: FileText
          }
        };
      default:
        return {
          title: 'Enhanced Verification Status Unknown',
          description: 'Unable to determine enhanced verification status.',
          variant: 'info' as const,
          icon: Shield,
          iconColor: 'text-muted-foreground',
          primaryAction: null
        };
    }
  };

  const config = getConfig();

  const getBorderColor = () => {
    switch (config.variant) {
      case 'destructive': return 'border-l-destructive bg-destructive/5';
      case 'warning': return 'border-l-orange-500 bg-orange-500/5';
      case 'info': return 'border-l-blue-500 bg-blue-500/5';
      default: return 'border-l-primary bg-primary/5';
    }
  };

  return (
    <Card className={`border-l-4 ${getBorderColor()} ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <config.icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm text-foreground mb-1">
                {config.title}
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                {config.description}
              </p>
              
              {/* Status badge */}
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-xs">
                  {status === 'not_started' && 'Not Started'}
                  {status === 'verification_session_created' && 'Session Created'}
                  {status === 'documents_submitted' && 'Documents Submitted'}
                  {status === 'under_review' && 'Under Review'}
                  {status === 'verified' && 'Verified'}
                  {status === 'failed' && 'Failed'}
                </Badge>
                
                {lastAttempt && (
                  <span className="text-xs text-muted-foreground">
                    Last attempt: {new Date(lastAttempt).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Requirements info */}
              <div className="text-xs text-muted-foreground">
                <div className="flex flex-wrap gap-2">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Government ID required
                  </span>
                  <span className="flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    Selfie verification
                  </span>
                </div>
              </div>
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