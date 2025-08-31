'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseTimeTrackerOptions {
  contractId: string;
  onSessionUpdate?: (data: any) => void;
  onSessionEnd?: (data: any) => void;
  activityDetection?: boolean;
  autoSaveInterval?: number; // in seconds
}

interface TimeSession {
  id: string;
  start_time: string;
  task_description: string;
  is_active: boolean;
  total_breaks_minutes: number;
}

interface ActivityData {
  lastActivity: Date;
  activityLevel: number;
  idleTime: number;
}

export function useTimeTracker({
  contractId,
  onSessionUpdate,
  onSessionEnd,
  activityDetection = true,
  autoSaveInterval = 30
}: UseTimeTrackerOptions) {
  const [isTracking, setIsTracking] = useState(false);
  const [activeSession, setActiveSession] = useState<TimeSession | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakStartTime, setBreakStartTime] = useState<Date | null>(null);
  const [totalBreakTime, setTotalBreakTime] = useState(0);
  const [activityData, setActivityData] = useState<ActivityData>({
    lastActivity: new Date(),
    activityLevel: 100,
    idleTime: 0
  });

  // Refs for intervals and timeouts
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activityIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Activity detection
  const updateActivity = useCallback(() => {
    if (!isTracking || isOnBreak) return;
    
    const now = new Date();
    setActivityData(prev => ({
      ...prev,
      lastActivity: now,
      activityLevel: Math.min(100, prev.activityLevel + 5),
      idleTime: 0
    }));

    // Clear idle timeout and reset
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }

    // Set new idle timeout (5 minutes)
    idleTimeoutRef.current = setTimeout(() => {
      setActivityData(prev => ({
        ...prev,
        activityLevel: Math.max(0, prev.activityLevel - 10),
        idleTime: prev.idleTime + 1
      }));
    }, 5 * 60 * 1000);
  }, [isTracking, isOnBreak]);

  // Setup activity listeners
  useEffect(() => {
    if (!activityDetection || !isTracking) return;

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
    };
  }, [activityDetection, isTracking, updateActivity]);

  // Main timer effect
  useEffect(() => {
    if (isTracking && activeSession && !isOnBreak) {
      timerIntervalRef.current = setInterval(() => {
        const now = new Date();
        const start = new Date(activeSession.start_time);
        const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000);
        setElapsedTime(elapsed - totalBreakTime * 60);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [isTracking, activeSession, isOnBreak, totalBreakTime]);

  // Auto-save session data
  useEffect(() => {
    if (isTracking && activeSession) {
      autoSaveIntervalRef.current = setInterval(async () => {
        try {
          await fetch(`/api/contracts/${contractId}/time-tracking/sessions/${activeSession.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              last_activity: activityData.lastActivity.toISOString(),
              activity_level: activityData.activityLevel,
              total_breaks_minutes: totalBreakTime
            }),
          });
          onSessionUpdate?.(activityData);
        } catch (error) {
          console.error('Failed to auto-save session:', error);
        }
      }, autoSaveInterval * 1000);
    } else {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
    }

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, [isTracking, activeSession, contractId, activityData, totalBreakTime, autoSaveInterval, onSessionUpdate]);

  // Check for existing session on mount
  useEffect(() => {
    checkExistingSession();
  }, [contractId]);

  // Persistence - save state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const state = {
        isTracking,
        activeSession,
        elapsedTime,
        isOnBreak,
        breakStartTime: breakStartTime?.toISOString(),
        totalBreakTime,
        contractId
      };
      localStorage.setItem(`timeTracker_${contractId}`, JSON.stringify(state));
    }
  }, [isTracking, activeSession, elapsedTime, isOnBreak, breakStartTime, totalBreakTime, contractId]);

  // Restore state from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`timeTracker_${contractId}`);
      if (stored) {
        try {
          const state = JSON.parse(stored);
          if (state.contractId === contractId && state.isTracking && state.activeSession) {
            setActiveSession(state.activeSession);
            setIsTracking(state.isTracking);
            setTotalBreakTime(state.totalBreakTime || 0);
            setIsOnBreak(state.isOnBreak || false);
            if (state.breakStartTime) {
              setBreakStartTime(new Date(state.breakStartTime));
            }
          }
        } catch (error) {
          console.error('Failed to restore timer state:', error);
        }
      }
    }
  }, [contractId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
      if (autoSaveIntervalRef.current) clearInterval(autoSaveIntervalRef.current);
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, []);

  const checkExistingSession = async () => {
    try {
      const response = await fetch(`/api/contracts/${contractId}/time-tracking/sessions?active=true`);
      if (!response.ok) return;

      const data = await response.json();
      if (data.success && data.sessions.length > 0) {
        const session = data.sessions[0];
        setActiveSession(session);
        setIsTracking(true);
        setTotalBreakTime(session.total_breaks_minutes || 0);
        
        // Calculate current elapsed time
        const now = new Date();
        const start = new Date(session.start_time);
        const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000);
        setElapsedTime(elapsed - (session.total_breaks_minutes || 0) * 60);
      }
    } catch (error) {
      console.error('Failed to check existing session:', error);
    }
  };

  const startTracking = async (taskDescription: string, hourlyRate?: number) => {
    try {
      const response = await fetch(`/api/contracts/${contractId}/time-tracking/sessions?contract_id=${contractId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task_description: taskDescription.trim(),
          hourly_rate: hourlyRate
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.existing_session) {
          setActiveSession(data.existing_session);
          setIsTracking(true);
          return { success: true, session: data.existing_session, resumed: true };
        } else {
          throw new Error(data.error || 'Failed to start tracking');
        }
      }

      setActiveSession(data.session);
      setIsTracking(true);
      setElapsedTime(0);
      setTotalBreakTime(0);
      setActivityData({
        lastActivity: new Date(),
        activityLevel: 100,
        idleTime: 0
      });

      return { success: true, session: data.session };
    } catch (error) {
      console.error('Failed to start tracking:', error);
      return { success: false, error };
    }
  };

  const stopTracking = async (createTimeEntry = true) => {
    if (!activeSession) return { success: false, error: 'No active session' };

    try {
      const response = await fetch(`/api/contracts/${contractId}/time-tracking/sessions/${activeSession.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          create_time_entry: createTimeEntry,
          final_notes: `Worked for ${formatTime(elapsedTime)}`
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to stop tracking');
      }

      // Clear state
      setIsTracking(false);
      setActiveSession(null);
      setElapsedTime(0);
      setTotalBreakTime(0);
      setIsOnBreak(false);
      setBreakStartTime(null);
      
      // Clear localStorage
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`timeTracker_${contractId}`);
      }

      onSessionEnd?.(data);
      
      return { success: true, data };
    } catch (error) {
      console.error('Failed to stop tracking:', error);
      return { success: false, error };
    }
  };

  const toggleBreak = async () => {
    if (!activeSession) return;

    if (isOnBreak) {
      // End break
      if (breakStartTime) {
        const breakDuration = Math.floor((new Date().getTime() - breakStartTime.getTime()) / (1000 * 60));
        const newTotalBreakTime = totalBreakTime + breakDuration;
        setTotalBreakTime(newTotalBreakTime);
        
        // Update session with break time
        try {
          await fetch(`/api/contracts/${contractId}/time-tracking/sessions/${activeSession.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ total_breaks_minutes: newTotalBreakTime }),
          });
        } catch (error) {
          console.error('Failed to update break time:', error);
        }
      }
      setIsOnBreak(false);
      setBreakStartTime(null);
    } else {
      // Start break
      setIsOnBreak(true);
      setBreakStartTime(new Date());
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return {
    // State
    isTracking,
    activeSession,
    elapsedTime,
    isOnBreak,
    totalBreakTime,
    activityData,
    
    // Actions
    startTracking,
    stopTracking,
    toggleBreak,
    checkExistingSession,
    
    // Utilities
    formatTime,
    calculateEarnings: (hourlyRate: number) => (elapsedTime / 3600) * hourlyRate
  };
}