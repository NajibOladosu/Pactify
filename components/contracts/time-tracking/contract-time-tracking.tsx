'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Clock, Calendar, DollarSign, CheckCircle, AlertCircle, Timer } from 'lucide-react';
import { TimeTracker } from './time-tracker';
import { SimpleTimeEntries } from './simple-time-entries';
import { SimpleApprovalInterface } from './simple-approval-interface';

interface ContractTimeTrackingProps {
  contractId: string;
  contractType: 'fixed' | 'milestone' | 'hourly';
  contractStatus: string;
  hourlyRate?: number;
  currency?: string;
  userRole: 'client' | 'freelancer' | 'creator';
  userId: string;
}

interface TimeTrackingSummary {
  total_hours: number;
  total_amount: number;
  approved_hours: number;
  approved_amount: number;
  pending_approval: number;
  rejected_entries: number;
  active_session: boolean;
}

export function ContractTimeTracking({
  contractId,
  contractType,
  contractStatus,
  hourlyRate,
  currency = 'USD',
  userRole,
  userId
}: ContractTimeTrackingProps) {
  const [summary, setSummary] = useState<TimeTrackingSummary>({
    total_hours: 0,
    total_amount: 0,
    approved_hours: 0,
    approved_amount: 0,
    pending_approval: 0,
    rejected_entries: 0,
    active_session: false
  });
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const isFreelancer = userRole === 'freelancer' || userRole === 'creator';
  const isClient = userRole === 'client';
  const canTrackTime = isFreelancer && ['active', 'in_progress', 'pending_delivery'].includes(contractStatus);

  useEffect(() => {
    // Only fetch if this is an hourly contract
    if (contractType === 'hourly') {
      fetchSummary();
    }
  }, [contractId, refreshTrigger, contractType]);

  // Only show time tracking for hourly contracts
  if (contractType !== 'hourly') {
    return null;
  }

  const fetchSummary = async () => {
    try {
      const response = await fetch(`/api/contracts/${contractId}/time-tracking?contract_id=${contractId}`);
      const data = await response.json();

      if (response.ok) {
        const timeData = data.summary || {};
        
        // Check for active session
        const sessionsResponse = await fetch(`/api/contracts/${contractId}/time-tracking/sessions?active=true`);
        const sessionsData = await sessionsResponse.json();
        const hasActiveSession = sessionsResponse.ok && sessionsData.sessions?.length > 0;

        setSummary({
          total_hours: timeData.total_hours || 0,
          total_amount: timeData.total_amount || 0,
          approved_hours: timeData.approved_hours || 0,
          approved_amount: (timeData.approved_hours || 0) * (hourlyRate || 0),
          pending_approval: timeData.pending_approval || 0,
          rejected_entries: data.time_entries?.filter((e: any) => e.status === 'rejected').length || 0,
          active_session: hasActiveSession
        });
      }
    } catch (error) {
      console.error('Failed to fetch time tracking summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 animate-spin" />
              Loading time tracking data...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">Total Hours</p>
                <p className="text-xl font-bold">{summary.total_hours.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Approved Hours</p>
                <p className="text-xl font-bold">{summary.approved_hours.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-600" />
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-xl font-bold">{summary.pending_approval}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Approved Amount</p>
                <p className="text-xl font-bold">{currency} {summary.approved_amount.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Session Indicator */}
      {summary.active_session && isFreelancer && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <Timer className="w-4 h-4 text-green-600" />
              <span className="font-medium text-green-800">Active time tracking session</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Time Tracking
            {hourlyRate && (
              <Badge variant="outline">{currency} {hourlyRate}/hour</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isFreelancer ? (
            <Tabs defaultValue="tracker" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="tracker">Time Tracker</TabsTrigger>
                <TabsTrigger value="entries">My Time Entries</TabsTrigger>
              </TabsList>
              
              <TabsContent value="tracker" className="mt-6">
                {canTrackTime ? (
                  <TimeTracker
                    contractId={contractId}
                    hourlyRate={hourlyRate}
                    onSessionStart={refreshData}
                    onSessionStop={refreshData}
                  />
                ) : (
                  <Card>
                    <CardContent className="p-6 text-center">
                      <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">Time Tracking Not Available</h3>
                      <p className="text-muted-foreground">
                        Time tracking is only available when the contract is active.
                        <br />
                        Current status: <Badge variant="outline">{contractStatus}</Badge>
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              
              <TabsContent value="entries" className="mt-6">
                <SimpleTimeEntries contractId={contractId} />
              </TabsContent>
            </Tabs>
          ) : isClient ? (
            <Tabs defaultValue="approval" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="approval">
                  Approve Time 
                  {summary.pending_approval > 0 && (
                    <Badge variant="destructive" className="ml-2">
                      {summary.pending_approval}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="history">Time History</TabsTrigger>
              </TabsList>
              
              <TabsContent value="approval" className="mt-6">
                <SimpleApprovalInterface
                  contractId={contractId}
                  onApproval={refreshData}
                />
              </TabsContent>
              
              <TabsContent value="history" className="mt-6">
                <SimpleTimeEntries contractId={contractId} />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="text-center py-6">
              <p className="text-muted-foreground">
                Time tracking data will be available once the contract is active.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}