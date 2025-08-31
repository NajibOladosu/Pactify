'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, Pause, Square, Clock, Activity, Wifi, WifiOff } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useTimeTracker } from '@/hooks/use-time-tracker';

interface TimeTrackerProps {
  contractId: string;
  hourlyRate?: number;
  onSessionStart?: (session: any) => void;
  onSessionStop?: (result: any) => void;
}

export function TimeTracker({ contractId, hourlyRate, onSessionStart, onSessionStop }: TimeTrackerProps) {
  const [taskDescription, setTaskDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const {
    isTracking,
    activeSession,
    elapsedTime,
    isOnBreak,
    totalBreakTime,
    activityData,
    startTracking: startTrackingHook,
    stopTracking: stopTrackingHook,
    toggleBreak,
    formatTime,
    calculateEarnings
  } = useTimeTracker({
    contractId,
    onSessionUpdate: (data) => {
      // Optional: Handle real-time session updates
    },
    onSessionEnd: (data) => {
      onSessionStop?.(data);
    },
    activityDetection: true,
    autoSaveInterval: 30
  });

  const handleStartTracking = async () => {
    if (!taskDescription.trim()) {
      toast({
        title: "Error",
        description: "Please enter a task description",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const result = await startTrackingHook(taskDescription, hourlyRate);
      if (result.success) {
        onSessionStart?.(result.session);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStopTracking = async () => {
    setLoading(true);
    try {
      await stopTrackingHook(true);
      setTaskDescription('');
    } finally {
      setLoading(false);
    }
  };

  // Set task description from active session
  if (activeSession && !taskDescription) {
    setTaskDescription(activeSession.task_description);
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Time Tracker
        </CardTitle>
        <CardDescription>
          Track time spent working on this contract
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Task Description Input */}
        {!isTracking && (
          <div>
            <label className="text-sm font-medium mb-2 block">
              What are you working on?
            </label>
            <Textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Describe the task you're working on..."
              disabled={loading}
              rows={2}
            />
          </div>
        )}

        {/* Active Session Display */}
        {isTracking && activeSession && (
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div>
              <h4 className="font-medium text-sm text-muted-foreground">Current Task</h4>
              <p className="text-sm mt-1">{activeSession.task_description}</p>
            </div>

            {/* Timer Display */}
            <div className="text-center py-4">
              <div className="text-4xl font-mono font-bold text-primary">
                {formatTime(elapsedTime)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {isOnBreak ? (
                  <Badge variant="secondary" className="animate-pulse">
                    <Pause className="w-3 h-3 mr-1" />
                    On Break
                  </Badge>
                ) : (
                  <Badge variant="default">
                    <Activity className="w-3 h-3 mr-1" />
                    Active
                  </Badge>
                )}
              </div>
            </div>

            {/* Earnings Display */}
            {hourlyRate && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Estimated earnings:</span>
                <span className="font-medium">${calculateEarnings(hourlyRate).toFixed(2)}</span>
              </div>
            )}

            {/* Activity Level */}
            <div className="flex justify-between text-sm items-center">
              <div className="flex items-center gap-1">
                {activityData.activityLevel > 50 ? (
                  <Wifi className="w-3 h-3 text-green-600" />
                ) : (
                  <WifiOff className="w-3 h-3 text-orange-600" />
                )}
                <span className="text-muted-foreground">Activity level:</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 transition-all duration-500"
                    style={{ width: `${activityData.activityLevel}%` }}
                  />
                </div>
                <span className="text-xs font-mono">{Math.round(activityData.activityLevel)}%</span>
              </div>
            </div>

            {/* Break Time */}
            {totalBreakTime > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Break time:</span>
                <span>{Math.floor(totalBreakTime)} minutes</span>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        {!isTracking ? (
          <Button 
            onClick={handleStartTracking} 
            disabled={loading || !taskDescription.trim()}
            className="flex-1"
          >
            <Play className="w-4 h-4 mr-2" />
            {loading ? 'Starting...' : 'Start Tracking'}
          </Button>
        ) : (
          <>
            <Button
              variant={isOnBreak ? "default" : "outline"}
              onClick={toggleBreak}
              disabled={loading}
            >
              {isOnBreak ? (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  End Break
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Take Break
                </>
              )}
            </Button>
            <Button
              variant="destructive"
              onClick={handleStopTracking}
              disabled={loading}
              className="flex-1"
            >
              <Square className="w-4 h-4 mr-2" />
              {loading ? 'Stopping...' : 'Stop & Submit'}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}