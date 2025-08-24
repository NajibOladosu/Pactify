"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUpIcon, 
  TrendingDownIcon,
  FileTextIcon,
  DollarSignIcon,
  ClockIcon,
  TargetIcon,
  UsersIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  MinusIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProgressMetrics {
  overview: {
    totalContracts: number;
    activeContracts: number;
    completedContracts: number;
    cancelledContracts: number;
    completionRate: number;
  };
  financial: {
    totalRevenue: number;
    completedRevenue: number;
    pendingRevenue: number;
    avgContractValue: number;
    revenueGrowth: number;
  };
  performance: {
    avgCompletionTime: number;
    onTimeDeliveryRate: number;
    satisfactionScore: number;
    milestonesCompletionRate: number;
  };
  trends: {
    contractsThisMonth: number;
    contractsLastMonth: number;
    contractGrowth: number;
  };
}

interface ProgressMetricsCardsProps {
  metrics: ProgressMetrics;
  userType: string;
  loading?: boolean;
}

const formatCurrency = (amount: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatTrend = (value: number, suffix: string = '') => {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const Icon = isPositive ? TrendingUpIcon : isNegative ? TrendingDownIcon : MinusIcon;
  
  return (
    <div className={cn(
      "flex items-center gap-1 text-xs",
      isPositive && "text-green-600",
      isNegative && "text-red-600",
      !isPositive && !isNegative && "text-gray-500"
    )}>
      <Icon className="h-3 w-3" />
      <span>
        {isPositive ? '+' : ''}{Math.abs(value).toFixed(1)}%{suffix}
      </span>
    </div>
  );
};

export function ProgressMetricsCards({ metrics, userType, loading = false }: ProgressMetricsCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Active Contracts",
      value: metrics.overview.activeContracts.toString(),
      subtitle: `${metrics.overview.totalContracts} total`,
      trend: formatTrend(metrics.trends.contractGrowth, ' this month'),
      icon: FileTextIcon,
      color: "blue"
    },
    {
      title: userType === 'client' ? 'Total Spent' : 'Total Revenue',
      value: formatCurrency(metrics.financial.completedRevenue),
      subtitle: `${formatCurrency(metrics.financial.pendingRevenue)} pending`,
      trend: formatTrend(metrics.financial.revenueGrowth, ' vs last month'),
      icon: DollarSignIcon,
      color: "green"
    },
    {
      title: "On-Time Delivery",
      value: `${metrics.performance.onTimeDeliveryRate}%`,
      subtitle: `${metrics.performance.avgCompletionTime} days avg`,
      trend: metrics.performance.onTimeDeliveryRate >= 80 ? 
        <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">Excellent</Badge> :
        metrics.performance.onTimeDeliveryRate >= 60 ?
        <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-700">Good</Badge> :
        <Badge variant="secondary" className="text-xs bg-red-100 text-red-700">Needs Work</Badge>,
      icon: ClockIcon,
      color: "orange"
    },
    {
      title: userType === 'client' ? 'Project Success' : 'Client Satisfaction',
      value: metrics.performance.satisfactionScore > 0 ? 
        `${metrics.performance.satisfactionScore}/5` : 
        `${metrics.overview.completionRate.toFixed(0)}%`,
      subtitle: userType === 'client' ? 
        `${metrics.overview.completedContracts} completed` :
        `${metrics.overview.completedContracts} projects done`,
      trend: metrics.performance.satisfactionScore >= 4.0 || metrics.overview.completionRate >= 80 ?
        <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">Excellent</Badge> :
        <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-700">Good</Badge>,
      icon: userType === 'client' ? TargetIcon : UsersIcon,
      color: "purple"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
      {cards.map((card, index) => {
        const IconComponent = card.icon;
        
        return (
          <Card key={index} className="transition-all hover:shadow-md">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1 flex-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </p>
                  <p className="text-xl sm:text-2xl font-bold">
                    {card.value}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {card.subtitle}
                  </p>
                  <div className="mt-2">
                    {card.trend}
                  </div>
                </div>
                <div className="ml-4 flex-shrink-0">
                  <IconComponent className={cn(
                    "h-6 w-6 sm:h-8 sm:w-8 opacity-75",
                    card.color === "blue" && "text-blue-600",
                    card.color === "green" && "text-green-600", 
                    card.color === "orange" && "text-orange-600",
                    card.color === "purple" && "text-purple-600"
                  )} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// Additional metrics cards for detailed views
export function DetailedMetricsCards({ metrics, userType }: { metrics: ProgressMetrics; userType: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-2">
            <CheckCircleIcon className="h-8 w-8 text-green-600 mx-auto" />
            <div className="text-2xl font-bold text-green-600">
              {metrics.overview.completedContracts}
            </div>
            <p className="text-sm text-muted-foreground">Completed Projects</p>
            <p className="text-xs text-green-600">
              {metrics.overview.completionRate.toFixed(1)}% success rate
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-2">
            <DollarSignIcon className="h-8 w-8 text-blue-600 mx-auto" />
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(metrics.financial.avgContractValue)}
            </div>
            <p className="text-sm text-muted-foreground">Avg Contract Value</p>
            <p className="text-xs text-blue-600">
              Based on {metrics.overview.totalContracts} contracts
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-2">
            <AlertTriangleIcon className="h-8 w-8 text-orange-600 mx-auto" />
            <div className="text-2xl font-bold text-orange-600">
              {metrics.performance.milestonesCompletionRate.toFixed(0)}%
            </div>
            <p className="text-sm text-muted-foreground">Milestone Success</p>
            <p className="text-xs text-orange-600">
              Timely milestone completion
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}