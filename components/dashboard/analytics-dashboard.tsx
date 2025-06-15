"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUpIcon, 
  TrendingDownIcon,
  DollarSignIcon,
  FileTextIcon,
  ClockIcon,
  UsersIcon,
  CalendarIcon,
  PieChartIcon,
  BarChart3Icon,
  ActivityIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  XCircleIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalyticsData {
  overview: {
    totalContracts: number;
    activeContracts: number;
    completedContracts: number;
    totalRevenue: number;
    pendingPayments: number;
    averageContractValue: number;
    conversionRate: number;
    clientRetention: number;
  };
  trends: {
    contractsThisMonth: number;
    contractsLastMonth: number;
    revenueThisMonth: number;
    revenueLastMonth: number;
    averageCompletionTime: number;
    clientSatisfactionScore: number;
  };
  contractsByStatus: Array<{
    status: string;
    count: number;
    percentage: number;
    color: string;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: string;
    contract_number?: string;
    client_name?: string;
  }>;
  upcomingDeadlines: Array<{
    id: string;
    contract_number: string;
    title: string;
    client_name?: string;
    due_date: string;
    days_remaining: number;
    status: string;
  }>;
}

interface AnalyticsDashboardProps {
  userId: string;
  userType?: string;
}

const STATUS_COLORS = {
  draft: '#94a3b8',
  pending_signatures: '#f59e0b',
  pending_funding: '#8b5cf6',
  active: '#10b981',
  pending_delivery: '#3b82f6',
  in_review: '#f97316',
  revision_requested: '#ef4444',
  pending_completion: '#06b6d4',
  completed: '#22c55e',
  cancelled: '#6b7280',
  disputed: '#dc2626'
};

const ACTIVITY_ICONS = {
  contract_created: FileTextIcon,
  contract_signed: CheckCircleIcon,
  payment_funded: DollarSignIcon,
  milestone_submitted: ActivityIcon,
  review_requested: ClockIcon,
  payment_released: TrendingUpIcon,
  dispute_opened: AlertCircleIcon,
  contract_completed: CheckCircleIcon,
  contract_cancelled: XCircleIcon
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatPercentage = (value: number) => {
  return `${value.toFixed(1)}%`;
};

const calculateChange = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

export default function AnalyticsDashboard({ userId, userType = "both" }: AnalyticsDashboardProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/analytics?timeRange=${timeRange}`);
        if (response.ok) {
          const analyticsData = await response.json();
          setData(analyticsData);
        }
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [timeRange, userId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-8 bg-muted rounded w-1/2"></div>
                  <div className="h-3 bg-muted rounded w-1/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Unable to load analytics data.</p>
        <Button 
          onClick={() => window.location.reload()} 
          variant="outline" 
          className="mt-4"
        >
          Retry
        </Button>
      </div>
    );
  }

  const contractsChange = calculateChange(data.trends.contractsThisMonth, data.trends.contractsLastMonth);
  const revenueChange = calculateChange(data.trends.revenueThisMonth, data.trends.revenueLastMonth);

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Analytics Dashboard</h2>
        <div className="flex gap-2">
          {(['7d', '30d', '90d', '1y'] as const).map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange(range)}
            >
              {range === '7d' ? '7 Days' : 
               range === '30d' ? '30 Days' : 
               range === '90d' ? '90 Days' : 
               '1 Year'}
            </Button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">{formatCurrency(data.overview.totalRevenue)}</p>
                <div className="flex items-center gap-1 mt-1">
                  {revenueChange >= 0 ? (
                    <TrendingUpIcon className="h-3 w-3 text-green-600" />
                  ) : (
                    <TrendingDownIcon className="h-3 w-3 text-red-600" />
                  )}
                  <span className={cn("text-xs", revenueChange >= 0 ? "text-green-600" : "text-red-600")}>
                    {formatPercentage(Math.abs(revenueChange))} vs last period
                  </span>
                </div>
              </div>
              <DollarSignIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Contracts</p>
                <p className="text-2xl font-bold">{data.overview.activeContracts}</p>
                <div className="flex items-center gap-1 mt-1">
                  {contractsChange >= 0 ? (
                    <TrendingUpIcon className="h-3 w-3 text-green-600" />
                  ) : (
                    <TrendingDownIcon className="h-3 w-3 text-red-600" />
                  )}
                  <span className={cn("text-xs", contractsChange >= 0 ? "text-green-600" : "text-red-600")}>
                    {formatPercentage(Math.abs(contractsChange))} vs last period
                  </span>
                </div>
              </div>
              <FileTextIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Contract Value</p>
                <p className="text-2xl font-bold">{formatCurrency(data.overview.averageContractValue)}</p>
                <p className="text-xs text-muted-foreground mt-1">Per contract</p>
              </div>
              <BarChart3Icon className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Client Satisfaction</p>
                <p className="text-2xl font-bold">{formatPercentage(data.trends.clientSatisfactionScore)}</p>
                <p className="text-xs text-muted-foreground mt-1">Average rating</p>
              </div>
              <UsersIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contract Status Distribution */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5" />
              Contract Status Overview
            </CardTitle>
            <CardDescription>Distribution of contracts by current status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.contractsByStatus.map((status) => (
                <div key={status.status} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: status.color }}
                    />
                    <span className="text-sm font-medium capitalize">
                      {status.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24">
                      <Progress 
                        value={status.percentage} 
                        className="h-2"
                        style={{ 
                          '--progress-foreground': status.color 
                        } as React.CSSProperties}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-12 text-right">
                      {status.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Deadlines */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Upcoming Deadlines
            </CardTitle>
            <CardDescription>Contracts requiring attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.upcomingDeadlines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No upcoming deadlines
                </p>
              ) : (
                data.upcomingDeadlines.slice(0, 5).map((deadline) => (
                  <div key={deadline.id} className="flex items-start gap-3 p-3 border rounded-lg">
                    <div className={cn(
                      "w-2 h-2 rounded-full mt-2",
                      deadline.days_remaining <= 3 ? "bg-red-500" :
                      deadline.days_remaining <= 7 ? "bg-orange-500" :
                      "bg-green-500"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{deadline.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {deadline.client_name} • {deadline.contract_number}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge 
                          variant={deadline.days_remaining <= 3 ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {deadline.days_remaining} days left
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ActivityIcon className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>Latest updates across your contracts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No recent activity
              </p>
            ) : (
              data.recentActivity.slice(0, 10).map((activity) => {
                const IconComponent = ACTIVITY_ICONS[activity.type as keyof typeof ACTIVITY_ICONS] || ActivityIcon;
                return (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-muted">
                      <IconComponent className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">{activity.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {activity.contract_number && (
                          <span className="text-xs text-muted-foreground">
                            {activity.contract_number}
                          </span>
                        )}
                        {activity.client_name && (
                          <span className="text-xs text-muted-foreground">
                            • {activity.client_name}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          • {new Date(activity.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Performance Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercentage(data.overview.conversionRate)}</div>
            <p className="text-xs text-muted-foreground mt-1">Proposals to contracts</p>
            <Progress value={data.overview.conversionRate} className="mt-3" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Client Retention</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercentage(data.overview.clientRetention)}</div>
            <p className="text-xs text-muted-foreground mt-1">Repeat clients</p>
            <Progress value={data.overview.clientRetention} className="mt-3" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Avg Completion Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.trends.averageCompletionTime} days</div>
            <p className="text-xs text-muted-foreground mt-1">Project delivery</p>
            <div className="mt-3 flex items-center gap-1">
              <ClockIcon className="h-3 w-3 text-green-600" />
              <span className="text-xs text-green-600">On track</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}