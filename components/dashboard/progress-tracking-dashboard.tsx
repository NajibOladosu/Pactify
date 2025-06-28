"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { 
  TrendingUpIcon, 
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  BarChart3Icon,
  CalendarIcon,
  FileTextIcon,
  DollarSignIcon,
  UsersIcon,
  TargetIcon,
  RefreshCwIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  TrendingDownIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Contract {
  id: string;
  title: string;
  status: string;
  total_amount: number;
  currency: string;
  progress_percentage: number;
  client_name?: string;
  created_at: string;
  end_date?: string;
  milestones_completed: number;
  milestones_total: number;
}

interface Milestone {
  id: string;
  title: string;
  status: string;
  due_date?: string;
  amount: number;
  contract_title: string;
  days_remaining?: number;
}

interface ProgressMetrics {
  total_contracts: number;
  active_contracts: number;
  completed_contracts: number;
  total_revenue: number;
  pending_revenue: number;
  average_completion_time: number;
  on_time_delivery_rate: number;
  client_satisfaction_score: number;
}

interface ProgressTrackingDashboardProps {
  userId: string;
  userType?: string;
}

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  pending_signatures: 'bg-yellow-100 text-yellow-600',
  pending_funding: 'bg-blue-100 text-blue-600',
  active: 'bg-green-100 text-green-600',
  pending_delivery: 'bg-orange-100 text-orange-600',
  in_review: 'bg-purple-100 text-purple-600',
  revision_requested: 'bg-red-100 text-red-600',
  pending_completion: 'bg-indigo-100 text-indigo-600',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
  disputed: 'bg-red-100 text-red-600'
};

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

const calculateDaysRemaining = (endDate: string) => {
  const today = new Date();
  const end = new Date(endDate);
  const diffTime = end.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export default function ProgressTrackingDashboard({ userId, userType = "both" }: ProgressTrackingDashboardProps) {
  const { toast } = useToast();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [upcomingMilestones, setUpcomingMilestones] = useState<Milestone[]>([]);
  const [metrics, setMetrics] = useState<ProgressMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchProgressData();
  }, [userId]);

  const fetchProgressData = async () => {
    try {
      setLoading(true);

      // Fetch contracts with progress data
      const contractsResponse = await fetch('/api/contracts?include_progress=true');
      const contractsResult = await contractsResponse.json();

      if (contractsResponse.ok) {
        const contractsWithProgress = contractsResult.contracts.map((contract: any) => ({
          ...contract,
          progress_percentage: calculateContractProgress(contract),
          client_name: contract.client_email?.split('@')[0] || 'Unknown Client',
          milestones_completed: contract.contract_milestones?.filter((m: any) => m.status === 'completed').length || 0,
          milestones_total: contract.contract_milestones?.length || 0
        }));
        setContracts(contractsWithProgress);

        // Calculate metrics
        const calculatedMetrics = calculateMetrics(contractsWithProgress);
        setMetrics(calculatedMetrics);

        // Extract upcoming milestones
        const allMilestones = contractsWithProgress.flatMap((contract: any) => 
          contract.contract_milestones?.filter((m: any) => 
            m.status !== 'completed' && m.due_date
          ).map((m: any) => ({
            ...m,
            contract_title: contract.title,
            days_remaining: m.due_date ? calculateDaysRemaining(m.due_date) : null
          })) || []
        );

        // Sort by due date and take upcoming ones
        const upcoming = allMilestones
          .filter((m: any) => m.days_remaining !== null && m.days_remaining >= 0)
          .sort((a: any, b: any) => (a.days_remaining || 0) - (b.days_remaining || 0))
          .slice(0, 10);
        
        setUpcomingMilestones(upcoming);
      }
    } catch (error) {
      console.error('Failed to fetch progress data:', error);
      toast({
        title: "Error",
        description: "Failed to load progress data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateContractProgress = (contract: any) => {
    if (contract.status === 'completed') return 100;
    if (contract.status === 'cancelled') return 0;
    
    const statusProgress = {
      draft: 10,
      pending_signatures: 20,
      pending_funding: 30,
      active: 40,
      pending_delivery: 60,
      in_review: 80,
      revision_requested: 70,
      pending_completion: 90
    };

    let baseProgress = statusProgress[contract.status as keyof typeof statusProgress] || 0;

    // Add milestone progress if applicable
    if (contract.contract_milestones?.length > 0) {
      const completedMilestones = contract.contract_milestones.filter((m: any) => m.status === 'completed').length;
      const milestoneProgress = (completedMilestones / contract.contract_milestones.length) * 40;
      baseProgress = Math.max(baseProgress, 40 + milestoneProgress);
    }

    return Math.min(baseProgress, 100);
  };

  const calculateMetrics = (contracts: Contract[]): ProgressMetrics => {
    const total = contracts.length;
    const active = contracts.filter(c => ['active', 'pending_delivery', 'in_review', 'pending_completion'].includes(c.status)).length;
    const completed = contracts.filter(c => c.status === 'completed').length;
    
    const totalRevenue = contracts
      .filter(c => c.status === 'completed')
      .reduce((sum, c) => sum + c.total_amount, 0);
    
    const pendingRevenue = contracts
      .filter(c => ['active', 'pending_delivery', 'in_review', 'pending_completion'].includes(c.status))
      .reduce((sum, c) => sum + c.total_amount, 0);

    // Mock additional metrics (in a real app, these would come from the backend)
    const averageCompletionTime = 21; // days
    const onTimeDeliveryRate = 87; // percentage
    const clientSatisfactionScore = 4.6; // out of 5

    return {
      total_contracts: total,
      active_contracts: active,
      completed_contracts: completed,
      total_revenue: totalRevenue,
      pending_revenue: pendingRevenue,
      average_completion_time: averageCompletionTime,
      on_time_delivery_rate: onTimeDeliveryRate,
      client_satisfaction_score: clientSatisfactionScore
    };
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCwIcon className="h-6 w-6 animate-spin mr-2" />
            <span>Loading progress data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            Failed to load progress data
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold">Progress Tracking</h2>
          <p className="text-muted-foreground">Monitor your contract progress and performance metrics</p>
        </div>
        <Button onClick={fetchProgressData} variant="outline" size="sm">
          <RefreshCwIcon className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Contracts</p>
                <p className="text-2xl font-bold">{metrics.active_contracts}</p>
                <div className="flex items-center gap-1 mt-1">
                  <TrendingUpIcon className="h-3 w-3 text-green-600" />
                  <span className="text-xs text-green-600">+12% this month</span>
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
                <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">{formatCurrency(metrics.total_revenue)}</p>
                <div className="flex items-center gap-1 mt-1">
                  <ArrowUpIcon className="h-3 w-3 text-green-600" />
                  <span className="text-xs text-green-600">+8% vs last month</span>
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
                <p className="text-sm font-medium text-muted-foreground">On-Time Delivery</p>
                <p className="text-2xl font-bold">{metrics.on_time_delivery_rate}%</p>
                <div className="flex items-center gap-1 mt-1">
                  <TargetIcon className="h-3 w-3 text-blue-600" />
                  <span className="text-xs text-blue-600">Above average</span>
                </div>
              </div>
              <ClockIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Client Satisfaction</p>
                <p className="text-2xl font-bold">{metrics.client_satisfaction_score}/5</p>
                <div className="flex items-center gap-1 mt-1">
                  <CheckCircleIcon className="h-3 w-3 text-green-600" />
                  <span className="text-xs text-green-600">Excellent</span>
                </div>
              </div>
              <UsersIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contracts">Active Contracts</TabsTrigger>
          <TabsTrigger value="milestones">Upcoming Milestones</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Contract Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Contract Status Distribution</CardTitle>
                <CardDescription>Current status of all your contracts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(
                    contracts.reduce((acc, contract) => {
                      acc[contract.status] = (acc[contract.status] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([status, count]) => {
                    const percentage = (count / contracts.length) * 100;
                    return (
                      <div key={status} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-3 h-3 rounded-full", STATUS_COLORS[status as keyof typeof STATUS_COLORS]?.replace('text-', 'bg-').split(' ')[0])} />
                          <span className="text-sm capitalize">{status.replace('_', ' ')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-20">
                            <Progress value={percentage} className="h-2" />
                          </div>
                          <span className="text-sm font-medium w-8">{count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Progress Updates</CardTitle>
                <CardDescription>Latest milestones and contract updates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {contracts
                    .filter(c => c.status !== 'completed' && c.status !== 'cancelled')
                    .slice(0, 5)
                    .map((contract) => (
                      <div key={contract.id} className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{contract.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Progress value={contract.progress_percentage} className="flex-1 h-2" />
                            <span className="text-xs text-muted-foreground">{contract.progress_percentage.toFixed(0)}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Progress Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Progress Summary</CardTitle>
              <CardDescription>Overall performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">{metrics.completed_contracts}</div>
                  <p className="text-sm text-muted-foreground">Completed Contracts</p>
                  <p className="text-xs text-green-600 mt-1">+{Math.round((metrics.completed_contracts / metrics.total_contracts) * 100)}% success rate</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">{formatCurrency(metrics.pending_revenue)}</div>
                  <p className="text-sm text-muted-foreground">Pending Revenue</p>
                  <p className="text-xs text-blue-600 mt-1">From {metrics.active_contracts} active contracts</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">{metrics.average_completion_time}d</div>
                  <p className="text-sm text-muted-foreground">Avg. Completion Time</p>
                  <p className="text-xs text-orange-600 mt-1">2 days faster than average</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Active Contracts Tab */}
        <TabsContent value="contracts">
          <Card>
            <CardHeader>
              <CardTitle>Active Contracts Progress</CardTitle>
              <CardDescription>Track progress on your active contracts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {contracts
                  .filter(c => ['active', 'pending_delivery', 'in_review', 'pending_completion'].includes(c.status))
                  .map((contract) => (
                    <div key={contract.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-medium">{contract.title}</h4>
                          <p className="text-sm text-muted-foreground">Client: {contract.client_name}</p>
                        </div>
                        <div className="text-right">
                          <Badge className={cn("text-xs", STATUS_COLORS[contract.status as keyof typeof STATUS_COLORS])}>
                            {contract.status.replace('_', ' ')}
                          </Badge>
                          <p className="text-sm font-medium mt-1">{formatCurrency(contract.total_amount, contract.currency)}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Progress</span>
                          <span>{contract.progress_percentage.toFixed(0)}%</span>
                        </div>
                        <Progress value={contract.progress_percentage} className="h-2" />
                        
                        {contract.milestones_total > 0 && (
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Milestones: {contract.milestones_completed}/{contract.milestones_total}</span>
                            {contract.end_date && (
                              <span>Due: {formatDate(contract.end_date)}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Upcoming Milestones Tab */}
        <TabsContent value="milestones">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Milestones</CardTitle>
              <CardDescription>Deadlines and milestones requiring attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {upcomingMilestones.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircleIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No upcoming milestones</p>
                    <p className="text-sm">You're all caught up!</p>
                  </div>
                ) : (
                  upcomingMilestones.map((milestone) => (
                    <div key={milestone.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-3 h-3 rounded-full",
                          (milestone.days_remaining || 0) <= 3 ? "bg-red-500" :
                          (milestone.days_remaining || 0) <= 7 ? "bg-orange-500" :
                          "bg-green-500"
                        )} />
                        <div>
                          <h4 className="font-medium">{milestone.title}</h4>
                          <p className="text-sm text-muted-foreground">{milestone.contract_title}</p>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <Badge variant={
                          (milestone.days_remaining || 0) <= 3 ? "destructive" : "secondary"
                        }>
                          {milestone.days_remaining === 0 ? 'Due today' :
                           milestone.days_remaining === 1 ? 'Due tomorrow' :
                           `${milestone.days_remaining} days left`}
                        </Badge>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatCurrency(milestone.amount)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
                <CardDescription>Your key performance indicators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>On-Time Delivery Rate</span>
                    <span>{metrics.on_time_delivery_rate}%</span>
                  </div>
                  <Progress value={metrics.on_time_delivery_rate} className="h-3" />
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Client Satisfaction</span>
                    <span>{metrics.client_satisfaction_score}/5.0</span>
                  </div>
                  <Progress value={(metrics.client_satisfaction_score / 5) * 100} className="h-3" />
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Contract Completion Rate</span>
                    <span>{Math.round((metrics.completed_contracts / metrics.total_contracts) * 100)}%</span>
                  </div>
                  <Progress value={(metrics.completed_contracts / metrics.total_contracts) * 100} className="h-3" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue Insights</CardTitle>
                <CardDescription>Financial performance overview</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-green-900">Completed Revenue</p>
                      <p className="text-2xl font-bold text-green-600">{formatCurrency(metrics.total_revenue)}</p>
                    </div>
                    <TrendingUpIcon className="h-8 w-8 text-green-600" />
                  </div>
                  
                  <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-blue-900">Pending Revenue</p>
                      <p className="text-2xl font-bold text-blue-600">{formatCurrency(metrics.pending_revenue)}</p>
                    </div>
                    <ClockIcon className="h-8 w-8 text-blue-600" />
                  </div>
                  
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Avg. Contract Value</p>
                      <p className="text-2xl font-bold text-gray-600">
                        {formatCurrency(metrics.total_revenue / (metrics.completed_contracts || 1))}
                      </p>
                    </div>
                    <BarChart3Icon className="h-8 w-8 text-gray-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}