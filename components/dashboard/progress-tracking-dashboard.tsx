"use client";

import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { RefreshCwIcon } from "lucide-react";
import Link from "next/link";

// Import our new components
import { ProgressMetricsCards, DetailedMetricsCards } from "@/components/dashboard/progress/progress-metrics-cards";
import { ContractProgressList } from "@/components/dashboard/progress/contract-progress-list";
import { UpcomingMilestones } from "@/components/dashboard/progress/upcoming-milestones";

interface ProgressData {
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
  milestones: {
    total: number;
    completed: number;
    pending: number;
    inProgress: number;
    overdue: number;
  };
  trends: {
    contractsThisMonth: number;
    contractsLastMonth: number;
    contractGrowth: number;
  };
  contracts: any[];
  statusDistribution: Record<string, number>;
  recentActivities: any[];
  upcomingDeadlines: any[];
  userType: string;
}

interface ProgressTrackingDashboardProps {
  userId: string;
  userType?: string;
}



const ProgressTrackingDashboard = memo(function ProgressTrackingDashboard({ userId, userType = "both" }: ProgressTrackingDashboardProps) {
  const { toast } = useToast();
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  console.log("CLIENT - Component render with userId:", userId, "userType:", userType);

  const fetchProgressData = useCallback(async () => {
    try {
      setLoading(true);
      
      const response = await fetch('/api/analytics/progress');
      const result = await response.json();
      
      if (response.ok && result.success) {
        setProgressData(result.data);
        setLastUpdated(new Date());
        console.log(`[PROGRESS CLIENT] Loaded ${result.data?.overview?.totalContracts || 0} contracts`);
      } else {
        throw new Error(result.error || 'Failed to fetch progress data');
      }
    } catch (error) {
      console.error('[PROGRESS CLIENT] Error:', error);
      toast({
        title: "Error",
        description: "Failed to load progress data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    console.log("CLIENT - useEffect triggered with userId:", userId);
    // Always try to fetch data, even if userId is not passed from props
    // The API will handle authentication
    fetchProgressData();
  }, [fetchProgressData]);

  // Memoize expensive calculations (moved before early returns to comply with React hooks rules)
  const hasNoContracts = useMemo(() => 
    progressData?.overview?.totalContracts === 0, 
    [progressData?.overview?.totalContracts]
  );

  const memoizedProgressData = useMemo(() => progressData, [progressData]);

  if (loading) {
    return <ProgressMetricsCards metrics={{} as any} userType={userType} loading={true} />;
  }

  if (!progressData) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <p className="font-medium">Failed to load progress data</p>
            <Button onClick={fetchProgressData} variant="outline" size="sm" className="mt-4">
              <RefreshCwIcon className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (hasNoContracts) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Progress Tracking</h2>
            <p className="text-muted-foreground">
              Monitor your contract progress and performance metrics
            </p>
          </div>
          <Button onClick={fetchProgressData} variant="outline" size="sm">
            <RefreshCwIcon className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Empty State */}
        <Card>
          <CardContent className="p-12">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                <RefreshCwIcon className="h-8 w-8 text-gray-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">No Contracts Yet</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  You haven't created or been invited to any contracts yet. Once you have contracts, 
                  your progress metrics and performance data will appear here.
                </p>
              </div>
              <div className="flex gap-2 justify-center pt-4">
                <Button asChild>
                  <Link href="/dashboard/contracts/create">Create Your First Contract</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/dashboard/contracts">View All Contracts</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Progress Tracking</h2>
          <p className="text-muted-foreground">
            Monitor your contract progress and performance metrics
          </p>
          {lastUpdated && (
            <p className="text-xs text-muted-foreground mt-1">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <Button onClick={fetchProgressData} variant="outline" size="sm">
          <RefreshCwIcon className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Key Metrics Cards */}
      <ProgressMetricsCards 
        metrics={memoizedProgressData || {} as any} 
        userType={memoizedProgressData?.userType || 'both'} 
        loading={loading} 
      />

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contracts">Active Contracts</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <ContractProgressList
                contracts={progressData.contracts}
                userType={progressData.userType}
                title="Recent Contract Progress"
                filter="active"
                limit={5}
              />
            </div>
            <div>
              <UpcomingMilestones 
                milestones={progressData.upcomingDeadlines} 
              />
            </div>
          </div>
          
          <DetailedMetricsCards 
            metrics={progressData} 
            userType={progressData.userType} 
          />
        </TabsContent>

        {/* Active Contracts Tab */}
        <TabsContent value="contracts">
          <ContractProgressList
            contracts={progressData.contracts}
            userType={progressData.userType}
            title="All Active Contracts"
            filter="active"
          />
        </TabsContent>

        {/* Milestones Tab */}
        <TabsContent value="milestones" className="space-y-6">
          <UpcomingMilestones 
            milestones={progressData.upcomingDeadlines}
          />
          
          {progressData.milestones.overdue > 0 && (
            <ContractProgressList
              contracts={progressData.contracts}
              userType={progressData.userType}
              title="Contracts with Overdue Items"
              filter="overdue"
            />
          )}
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <DetailedMetricsCards 
            metrics={progressData} 
            userType={progressData.userType} 
          />
          
          <ContractProgressList
            contracts={progressData.contracts}
            userType={progressData.userType}
            title="Completed Contracts"
            filter="completed"
            limit={10}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
});

export default ProgressTrackingDashboard;