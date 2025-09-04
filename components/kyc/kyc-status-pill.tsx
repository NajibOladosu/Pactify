'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, AlertTriangle, XCircle } from 'lucide-react';

interface KYCStatusPillProps {
  status: 'verified' | 'pending' | 'action_required' | 'onboarding_required' | 'not_created';
  className?: string;
}

export function KYCStatusPill({ status, className }: KYCStatusPillProps) {
  const config = {
    verified: {
      label: 'Verified',
      variant: 'default' as const,
      icon: CheckCircle,
      className: 'bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400'
    },
    pending: {
      label: 'Pending',
      variant: 'secondary' as const,
      icon: Clock,
      className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-400'
    },
    action_required: {
      label: 'Action Required',
      variant: 'destructive' as const,
      icon: AlertTriangle,
      className: 'bg-destructive/10 text-destructive border-destructive/20'
    },
    onboarding_required: {
      label: 'Setup Required',
      variant: 'destructive' as const,
      icon: XCircle,
      className: 'bg-destructive/10 text-destructive border-destructive/20'
    },
    not_created: {
      label: 'Not Set Up',
      variant: 'outline' as const,
      icon: XCircle,
      className: 'bg-muted text-muted-foreground border-border'
    }
  };

  const { label, icon: Icon, className: statusClassName } = config[status];

  return (
    <Badge 
      variant="outline" 
      className={`${statusClassName} ${className} flex items-center gap-1.5 font-medium`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}