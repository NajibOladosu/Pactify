'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface SimpleApprovalInterfaceProps {
  contractId: string;
  onApproval?: () => void;
}

export function SimpleApprovalInterface({ contractId, onApproval }: SimpleApprovalInterfaceProps) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchPendingEntries();
  }, [contractId]);

  const fetchPendingEntries = async () => {
    try {
      const response = await fetch(`/api/contracts/${contractId}/time-tracking?contract_id=${contractId}&status=submitted`);
      const data = await response.json();

      if (response.ok) {
        setEntries(data.time_entries || []);
      } else {
        toast({
          title: "Error",
          description: data.error || 'Failed to fetch time entries',
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to fetch time entries:', error);
      toast({
        title: "Error",
        description: 'Failed to fetch time entries',
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const approveEntry = async (entryId: string, status: 'approved' | 'rejected') => {
    try {
      const response = await fetch(`/api/contracts/${contractId}/time-tracking/${entryId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `Time entry ${status}`
        });
        fetchPendingEntries();
        onApproval?.();
      } else {
        const data = await response.json();
        toast({
          title: "Error",
          description: data.error || 'Failed to process approval',
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to approve entry:', error);
      toast({
        title: "Error",
        description: 'Failed to process approval',
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return <div>Loading entries for approval...</div>;
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <CheckCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">All caught up!</h3>
          <p className="text-muted-foreground">No time entries pending approval.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <Card key={entry.id}>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold">{entry.task_description}</h4>
                <p className="text-sm text-muted-foreground">
                  {entry.duration_minutes ? `${(entry.duration_minutes / 60).toFixed(2)} hours` : 'No duration'}
                  {entry.hourly_rate && ` • $${entry.hourly_rate}/hour`}
                </p>
              </div>
              
              {entry.freelancer_notes && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-sm">{entry.freelancer_notes}</p>
                </div>
              )}
              
              <div className="flex gap-2">
                <Button
                  onClick={() => approveEntry(entry.id, 'approved')}
                  className="flex-1"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => approveEntry(entry.id, 'rejected')}
                  className="flex-1"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}