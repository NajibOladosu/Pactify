'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, CreditCard } from 'lucide-react';
import Link from 'next/link';

interface SubscriptionStatusBannerProps {
  status: 'active' | 'expired' | 'cancelled';
  isExpired: boolean;
  inGracePeriod: boolean;
  gracePeriodEnd?: string;
  daysUntilFreeTier: number;
  planName: string;
  currentPlan: string;
}

export default function SubscriptionStatusBanner({
  status,
  isExpired,
  inGracePeriod,
  gracePeriodEnd,
  daysUntilFreeTier,
  planName,
  currentPlan
}: SubscriptionStatusBannerProps) {
  // Don't show banner for free users or active subscriptions
  if (!isExpired && status === 'active') {
    return null;
  }

  // Show grace period warning
  if (isExpired && inGracePeriod) {
    return (
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
        <CardContent className="flex items-start gap-4 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                Subscription Expired - Grace Period Active
              </h3>
              <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-300">
                {daysUntilFreeTier} day{daysUntilFreeTier !== 1 ? 's' : ''} remaining
              </Badge>
            </div>
            <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
              Your {planName} subscription has expired but you still have access to premium features. 
              Your account will revert to the free plan in {daysUntilFreeTier} day{daysUntilFreeTier !== 1 ? 's' : ''}.
            </p>
            <div className="flex items-center gap-3">
              <Button size="sm" asChild>
                <Link href="/dashboard/subscription">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Renew Subscription
                </Link>
              </Button>
              <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                <Clock className="h-3 w-3" />
                Grace period ends: {gracePeriodEnd ? new Date(gracePeriodEnd).toLocaleDateString() : 'Soon'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show reverted to free tier message
  if (isExpired && !inGracePeriod && currentPlan === 'free') {
    return (
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
        <CardContent className="flex items-start gap-4 p-4">
          <AlertTriangle className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                Account Reverted to Free Plan
              </h3>
              <Badge variant="outline" className="border-blue-300 text-blue-700 dark:border-blue-600 dark:text-blue-300">
                Free Tier
              </Badge>
            </div>
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
              Your premium subscription has ended and your account is now on the free plan with limited features.
            </p>
            <Button size="sm" asChild>
              <Link href="/dashboard/subscription">
                <CreditCard className="h-4 w-4 mr-2" />
                Upgrade Now
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}