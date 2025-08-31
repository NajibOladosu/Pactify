'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle } from 'lucide-react';

interface SimpleTimeEntriesProps {
  contractId: string;
}

export function SimpleTimeEntries({ contractId }: SimpleTimeEntriesProps) {
  const [summary, setSummary] = useState({
    total_hours: 0,
    total_amount: 0,
    approved_hours: 0,
    pending_approval: 0,
    entries_count: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSummary();
  }, [contractId]);

  const fetchSummary = async () => {
    try {
      const response = await fetch(`/api/contracts/${contractId}/time-tracking?contract_id=${contractId}`);
      const data = await response.json();

      if (response.ok) {
        setSummary(data.summary || {});
      }
    } catch (error) {
      console.error('Failed to fetch time entries:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Loading time entries...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time Tracking Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {summary.total_hours.toFixed(2)}
            </div>
            <div className="text-sm text-muted-foreground">Total Hours</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {summary.approved_hours.toFixed(2)}
            </div>
            <div className="text-sm text-muted-foreground">Approved Hours</div>
          </div>
        </div>
        
        {summary.pending_approval > 0 && (
          <div className="mt-4 p-2 bg-orange-50 rounded">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-600" />
              <span className="text-sm">
                {summary.pending_approval} entries pending approval
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}