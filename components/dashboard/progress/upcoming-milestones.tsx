"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CalendarIcon,
  ClockIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ExternalLinkIcon,
  TrendingUpIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Milestone {
  id: string;
  title: string;
  due_date: string;
  status: string;
  amount: number;
  contracts: {
    id: string;
    title: string;
  };
}

interface UpcomingMilestonesProps {
  milestones: Milestone[];
  className?: string;
}

const formatCurrency = (amount: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const calculateDaysRemaining = (dueDate: string) => {
  const today = new Date();
  const due = new Date(dueDate);
  const diffTime = due.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getUrgencyConfig = (daysRemaining: number) => {
  if (daysRemaining < 0) {
    return {
      color: 'bg-red-100 text-red-700 border-red-200',
      badge: 'destructive',
      icon: 'text-red-500',
      label: `${Math.abs(daysRemaining)} days overdue`,
      priority: 'critical'
    };
  } else if (daysRemaining === 0) {
    return {
      color: 'bg-red-100 text-red-700 border-red-200',
      badge: 'destructive',
      icon: 'text-red-500',
      label: 'Due today',
      priority: 'critical'
    };
  } else if (daysRemaining === 1) {
    return {
      color: 'bg-orange-100 text-orange-700 border-orange-200',
      badge: 'destructive',
      icon: 'text-orange-500',
      label: 'Due tomorrow',
      priority: 'high'
    };
  } else if (daysRemaining <= 3) {
    return {
      color: 'bg-orange-100 text-orange-700 border-orange-200',
      badge: 'secondary',
      icon: 'text-orange-500',
      label: `${daysRemaining} days left`,
      priority: 'high'
    };
  } else if (daysRemaining <= 7) {
    return {
      color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      badge: 'secondary',
      icon: 'text-yellow-500',
      label: `${daysRemaining} days left`,
      priority: 'medium'
    };
  } else {
    return {
      color: 'bg-green-100 text-green-700 border-green-200',
      badge: 'secondary',
      icon: 'text-green-500',
      label: `${daysRemaining} days left`,
      priority: 'low'
    };
  }
};

export function UpcomingMilestones({ milestones, className }: UpcomingMilestonesProps) {
  // Sort milestones by urgency and due date
  const sortedMilestones = [...milestones].sort((a, b) => {
    const aDays = calculateDaysRemaining(a.due_date);
    const bDays = calculateDaysRemaining(b.due_date);
    const aConfig = getUrgencyConfig(aDays);
    const bConfig = getUrgencyConfig(bDays);
    
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const aPriority = priorityOrder[aConfig.priority as keyof typeof priorityOrder];
    const bPriority = priorityOrder[bConfig.priority as keyof typeof priorityOrder];
    
    if (aPriority !== bPriority) return bPriority - aPriority;
    return aDays - bDays; // Earlier dates first within same priority
  });

  // Calculate summary stats
  const overdueCount = milestones.filter(m => calculateDaysRemaining(m.due_date) < 0).length;
  const dueTodayCount = milestones.filter(m => calculateDaysRemaining(m.due_date) === 0).length;
  const dueSoonCount = milestones.filter(m => {
    const days = calculateDaysRemaining(m.due_date);
    return days > 0 && days <= 7;
  }).length;

  const totalValue = milestones.reduce((sum, m) => sum + (m.amount || 0), 0);

  if (milestones.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircleIcon className="h-5 w-5 text-green-600" />
            Upcoming Milestones
          </CardTitle>
          <CardDescription>Milestone deadlines and deliverables</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircleIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No upcoming milestones</p>
            <p className="text-sm">You're all caught up! Great work.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Upcoming Milestones
            </CardTitle>
            <CardDescription>
              {milestones.length} milestone{milestones.length === 1 ? '' : 's'} 
              {totalValue > 0 && ` • ${formatCurrency(totalValue)} total value`}
            </CardDescription>
          </div>
          {(overdueCount > 0 || dueTodayCount > 0) && (
            <AlertTriangleIcon className="h-5 w-5 text-red-500" />
          )}
        </div>
        
        {/* Summary badges */}
        {(overdueCount > 0 || dueTodayCount > 0 || dueSoonCount > 0) && (
          <div className="flex items-center gap-2 pt-2">
            {overdueCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {overdueCount} overdue
              </Badge>
            )}
            {dueTodayCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {dueTodayCount} due today
              </Badge>
            )}
            {dueSoonCount > 0 && (
              <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">
                {dueSoonCount} due soon
              </Badge>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {sortedMilestones.slice(0, 10).map((milestone) => {
            const daysRemaining = calculateDaysRemaining(milestone.due_date);
            const urgencyConfig = getUrgencyConfig(daysRemaining);

            return (
              <div key={milestone.id} className="flex items-center justify-between p-3 border rounded-lg hover:shadow-sm transition-all">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={cn("w-3 h-3 rounded-full", urgencyConfig.icon.replace('text-', 'bg-'))} />
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">
                      {milestone.title}
                    </h4>
                    <p className="text-xs text-muted-foreground truncate">
                      {milestone.contracts.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(milestone.due_date)}
                      </span>
                      {milestone.amount > 0 && (
                        <>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs font-medium">
                            {formatCurrency(milestone.amount)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 ml-3">
                  <Badge 
                    variant={urgencyConfig.badge as any}
                    className="text-xs whitespace-nowrap"
                  >
                    {urgencyConfig.label}
                  </Badge>
                  
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/dashboard/contracts/${milestone.contracts.id}`}>
                      <ExternalLinkIcon className="h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}

          {sortedMilestones.length > 10 && (
            <div className="text-center pt-2">
              <Button variant="ghost" size="sm">
                <TrendingUpIcon className="h-3 w-3 mr-1" />
                View all {milestones.length} milestones
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}