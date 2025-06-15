"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Switch } from "@/components/ui/switch";
import { 
  ClockIcon, 
  BellIcon,
  CalendarIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  PlusIcon,
  XIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Deadline {
  id: string;
  title: string;
  description?: string;
  due_date: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'completed' | 'overdue';
  milestone_id?: string;
  created_by: string;
}

interface Reminder {
  id: string;
  deadline_id: string;
  reminder_type: 'email' | 'in_app' | 'both';
  trigger_hours_before: number;
  is_active: boolean;
  sent_at?: string;
}

interface DeadlineReminderSystemProps {
  contractId: string;
  userId: string;
  milestones: Array<{
    id: string;
    title: string;
    due_date?: string;
    status: string;
  }>;
}

const PRIORITY_COLORS = {
  low: 'bg-blue-100 text-blue-600 border-blue-200',
  medium: 'bg-yellow-100 text-yellow-600 border-yellow-200',
  high: 'bg-orange-100 text-orange-600 border-orange-200',
  urgent: 'bg-red-100 text-red-600 border-red-200'
};

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-600 border-gray-200',
  completed: 'bg-green-100 text-green-600 border-green-200',
  overdue: 'bg-red-100 text-red-600 border-red-200'
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getDaysUntilDeadline = (dateString: string) => {
  const deadline = new Date(dateString);
  const now = new Date();
  const diffTime = deadline.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export default function DeadlineReminderSystem({ 
  contractId, 
  userId, 
  milestones 
}: DeadlineReminderSystemProps) {
  const { toast } = useToast();
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  
  const [newDeadline, setNewDeadline] = useState({
    title: '',
    description: '',
    due_date: '',
    priority: 'medium' as any,
    milestone_id: ''
  });

  const [reminderSettings, setReminderSettings] = useState({
    email_reminders: true,
    in_app_reminders: true,
    reminder_hours: [24, 72, 168] // 1 day, 3 days, 1 week
  });

  useEffect(() => {
    fetchDeadlinesAndReminders();
  }, [contractId]);

  const fetchDeadlinesAndReminders = async () => {
    try {
      setLoading(true);
      
      // Fetch deadlines
      const deadlinesResponse = await fetch(`/api/contracts/${contractId}/deadlines`);
      if (deadlinesResponse.ok) {
        const deadlinesData = await deadlinesResponse.json();
        setDeadlines(deadlinesData.deadlines || []);
      }

      // Fetch reminders
      const remindersResponse = await fetch(`/api/contracts/${contractId}/reminders`);
      if (remindersResponse.ok) {
        const remindersData = await remindersResponse.json();
        setReminders(remindersData.reminders || []);
      }
    } catch (error) {
      console.error('Failed to fetch deadlines and reminders:', error);
      toast({
        title: "Error",
        description: "Failed to load deadline information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDeadline = async () => {
    if (!newDeadline.title.trim() || !newDeadline.due_date) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`/api/contracts/${contractId}/deadlines`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newDeadline),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Deadline created successfully",
        });
        
        setNewDeadline({
          title: '',
          description: '',
          due_date: '',
          priority: 'medium',
          milestone_id: ''
        });
        setShowAddForm(false);
        fetchDeadlinesAndReminders();
      } else {
        throw new Error('Failed to create deadline');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create deadline",
        variant: "destructive",
      });
    }
  };

  const handleToggleDeadlineStatus = async (deadlineId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    
    try {
      const response = await fetch(`/api/contracts/${contractId}/deadlines/${deadlineId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `Deadline marked as ${newStatus}`,
        });
        fetchDeadlinesAndReminders();
      } else {
        throw new Error('Failed to update deadline');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update deadline",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <ClockIcon className="h-6 w-6 animate-spin mr-2" />
            <span>Loading deadlines...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const upcomingDeadlines = deadlines.filter(d => d.status === 'pending');
  const overdueDeadlines = deadlines.filter(d => {
    if (d.status !== 'pending') return false;
    return getDaysUntilDeadline(d.due_date) < 0;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Deadlines & Reminders
            </CardTitle>
            <CardDescription>
              Manage contract deadlines and automated reminders
            </CardDescription>
          </div>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Deadline
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Alert for overdue deadlines */}
          {overdueDeadlines.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangleIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-red-900 mb-1">
                    {overdueDeadlines.length} Overdue Deadline{overdueDeadlines.length > 1 ? 's' : ''}
                  </p>
                  <p className="text-red-700">
                    Some deadlines have passed. Please review and update the status.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Add Deadline Form */}
          {showAddForm && (
            <Card className="border-primary-200">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg">Add New Deadline</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddForm(false)}
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="deadline-title">Title</Label>
                  <Input
                    id="deadline-title"
                    placeholder="e.g., Submit first draft"
                    value={newDeadline.title}
                    onChange={(e) => setNewDeadline(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="deadline-description">Description (Optional)</Label>
                  <Input
                    id="deadline-description"
                    placeholder="Additional details about this deadline"
                    value={newDeadline.description}
                    onChange={(e) => setNewDeadline(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="deadline-date">Due Date</Label>
                    <Input
                      id="deadline-date"
                      type="datetime-local"
                      value={newDeadline.due_date}
                      onChange={(e) => setNewDeadline(prev => ({ ...prev, due_date: e.target.value }))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="deadline-priority">Priority</Label>
                    <select
                      id="deadline-priority"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={newDeadline.priority}
                      onChange={(e) => setNewDeadline(prev => ({ ...prev, priority: e.target.value as any }))}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="deadline-milestone">Link to Milestone (Optional)</Label>
                  <select
                    id="deadline-milestone"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={newDeadline.milestone_id}
                    onChange={(e) => setNewDeadline(prev => ({ ...prev, milestone_id: e.target.value }))}
                  >
                    <option value="">No milestone</option>
                    {milestones.map(milestone => (
                      <option key={milestone.id} value={milestone.id}>
                        {milestone.title}
                      </option>
                    ))}
                  </select>
                </div>

                <Button onClick={handleCreateDeadline} className="w-full">
                  Create Deadline
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Deadlines List */}
          <div className="space-y-4">
            <h3 className="font-medium">Current Deadlines</h3>
            
            {deadlines.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No deadlines set</p>
                <p className="text-sm">Add deadlines to track important dates</p>
              </div>
            ) : (
              <div className="space-y-3">
                {deadlines.map((deadline) => {
                  const daysUntil = getDaysUntilDeadline(deadline.due_date);
                  const isOverdue = daysUntil < 0 && deadline.status === 'pending';
                  const isUrgent = daysUntil <= 2 && deadline.status === 'pending';

                  return (
                    <div
                      key={deadline.id}
                      className={cn(
                        "p-4 border rounded-lg",
                        isOverdue ? "border-red-200 bg-red-50" : 
                        isUrgent ? "border-orange-200 bg-orange-50" : 
                        "border-border"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className={cn(
                              "font-medium",
                              deadline.status === 'completed' && "line-through text-muted-foreground"
                            )}>
                              {deadline.title}
                            </h4>
                            <Badge className={cn(PRIORITY_COLORS[deadline.priority])}>
                              {deadline.priority}
                            </Badge>
                            <Badge className={cn(STATUS_COLORS[deadline.status])}>
                              {deadline.status}
                            </Badge>
                          </div>
                          
                          {deadline.description && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {deadline.description}
                            </p>
                          )}
                          
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <CalendarIcon className="h-3 w-3" />
                              <span>{formatDate(deadline.due_date)}</span>
                            </div>
                            
                            <div className={cn(
                              "flex items-center gap-1",
                              isOverdue ? "text-red-600" : 
                              isUrgent ? "text-orange-600" : ""
                            )}>
                              <ClockIcon className="h-3 w-3" />
                              <span>
                                {isOverdue 
                                  ? `${Math.abs(daysUntil)} days overdue`
                                  : daysUntil === 0 
                                    ? "Due today"
                                    : daysUntil === 1
                                      ? "Due tomorrow"
                                      : `${daysUntil} days remaining`
                                }
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleDeadlineStatus(deadline.id, deadline.status)}
                        >
                          {deadline.status === 'completed' ? (
                            <XIcon className="h-4 w-4" />
                          ) : (
                            <CheckCircleIcon className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reminder Settings */}
          <div className="pt-6 border-t">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <BellIcon className="h-4 w-4" />
              Reminder Settings
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="email-reminders">Email Reminders</Label>
                <Switch
                  id="email-reminders"
                  checked={reminderSettings.email_reminders}
                  onCheckedChange={(checked) => 
                    setReminderSettings(prev => ({ ...prev, email_reminders: checked }))
                  }
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="in-app-reminders">In-App Reminders</Label>
                <Switch
                  id="in-app-reminders"
                  checked={reminderSettings.in_app_reminders}
                  onCheckedChange={(checked) => 
                    setReminderSettings(prev => ({ ...prev, in_app_reminders: checked }))
                  }
                />
              </div>
              
              <div className="text-sm text-muted-foreground">
                <p>Automatic reminders will be sent:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>1 week before deadline</li>
                  <li>3 days before deadline</li>
                  <li>1 day before deadline</li>
                  <li>On the deadline day</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}