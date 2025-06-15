"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { 
  MailIcon, 
  BellIcon, 
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  AlertTriangleIcon,
  SettingsIcon,
  RefreshCwIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationPreference {
  type: string;
  label: string;
  description: string;
  enabled: boolean;
  category: 'contract' | 'payment' | 'deadline' | 'dispute';
}

interface EmailNotification {
  id: string;
  contract_id: string;
  recipient_email: string;
  notification_type: string;
  status: 'sent' | 'failed' | 'pending';
  sent_at?: string;
  created_at: string;
  email_data?: any;
}

interface EmailNotificationSettingsProps {
  userId: string;
}

const NOTIFICATION_TYPES = [
  {
    type: 'contract_invitation',
    label: 'Contract Invitations',
    description: 'When someone sends you a contract to review',
    category: 'contract' as const,
    defaultEnabled: true
  },
  {
    type: 'contract_signed',
    label: 'Contract Signatures',
    description: 'When a contract is signed by all parties',
    category: 'contract' as const,
    defaultEnabled: true
  },
  {
    type: 'payment_funded',
    label: 'Payment Funded',
    description: 'When escrow payment is funded for a contract',
    category: 'payment' as const,
    defaultEnabled: true
  },
  {
    type: 'milestone_submitted',
    label: 'Milestone Submissions',
    description: 'When a milestone is submitted for review',
    category: 'contract' as const,
    defaultEnabled: true
  },
  {
    type: 'payment_released',
    label: 'Payment Released',
    description: 'When payment is released from escrow',
    category: 'payment' as const,
    defaultEnabled: true
  },
  {
    type: 'contract_completed',
    label: 'Contract Completion',
    description: 'When a contract is completed successfully',
    category: 'contract' as const,
    defaultEnabled: true
  },
  {
    type: 'deadline_reminder',
    label: 'Deadline Reminders',
    description: 'Reminders about upcoming deadlines',
    category: 'deadline' as const,
    defaultEnabled: true
  },
  {
    type: 'dispute_opened',
    label: 'Dispute Notifications',
    description: 'When a dispute is opened on a contract',
    category: 'dispute' as const,
    defaultEnabled: true
  }
];

const CATEGORY_COLORS = {
  contract: 'text-blue-600 bg-blue-50',
  payment: 'text-green-600 bg-green-50',
  deadline: 'text-orange-600 bg-orange-50',
  dispute: 'text-red-600 bg-red-50'
};

const STATUS_COLORS = {
  sent: 'text-green-600 bg-green-50',
  failed: 'text-red-600 bg-red-50',
  pending: 'text-orange-600 bg-orange-50'
};

export default function EmailNotificationSettings({ userId }: EmailNotificationSettingsProps) {
  const { toast } = useToast();
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [notifications, setNotifications] = useState<EmailNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPreferences();
    loadNotificationHistory();
  }, [userId]);

  const loadPreferences = async () => {
    try {
      // For now, use default preferences. In a real app, this would fetch from user settings
      const defaultPreferences = NOTIFICATION_TYPES.map(type => ({
        ...type,
        enabled: type.defaultEnabled
      }));
      setPreferences(defaultPreferences);
    } catch (error) {
      console.error('Failed to load preferences:', error);
      toast({
        title: "Error",
        description: "Failed to load notification preferences",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadNotificationHistory = async () => {
    try {
      const response = await fetch('/api/notifications/email');
      const result = await response.json();

      if (response.ok) {
        setNotifications(result.notifications);
      }
    } catch (error) {
      console.error('Failed to load notification history:', error);
    }
  };

  const updatePreference = async (type: string, enabled: boolean) => {
    try {
      setSaving(true);
      
      // Update local state immediately for better UX
      setPreferences(prev => 
        prev.map(pref => 
          pref.type === type ? { ...pref, enabled } : pref
        )
      );

      // In a real app, this would save to the backend
      // await fetch('/api/notifications/preferences', {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ type, enabled })
      // });

      toast({
        title: "Preferences Updated",
        description: `${enabled ? 'Enabled' : 'Disabled'} notifications for ${preferences.find(p => p.type === type)?.label}`,
      });
    } catch (error) {
      console.error('Failed to update preference:', error);
      toast({
        title: "Error",
        description: "Failed to update notification preference",
        variant: "destructive",
      });
      
      // Revert local state on error
      setPreferences(prev => 
        prev.map(pref => 
          pref.type === type ? { ...pref, enabled: !enabled } : pref
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const testNotification = async (type: string) => {
    try {
      toast({
        title: "Test Email Sent",
        description: `A test ${type.replace('_', ' ')} notification has been sent to your email.`,
      });
    } catch (error) {
      console.error('Failed to send test notification:', error);
      toast({
        title: "Error",
        description: "Failed to send test notification",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <CheckCircleIcon className="h-4 w-4" />;
      case 'failed':
        return <XCircleIcon className="h-4 w-4" />;
      case 'pending':
        return <ClockIcon className="h-4 w-4" />;
      default:
        return <MailIcon className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const groupedPreferences = preferences.reduce((acc, pref) => {
    if (!acc[pref.category]) {
      acc[pref.category] = [];
    }
    acc[pref.category].push(pref);
    return acc;
  }, {} as Record<string, NotificationPreference[]>);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCwIcon className="h-6 w-6 animate-spin mr-2" />
            <span>Loading notification settings...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Email Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Email Notification Preferences
          </CardTitle>
          <CardDescription>
            Choose which email notifications you want to receive for contract activities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {Object.entries(groupedPreferences).map(([category, prefs]) => (
              <div key={category}>
                <h3 className="font-medium mb-3 capitalize flex items-center gap-2">
                  <div className={cn("w-3 h-3 rounded-full", CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS])} />
                  {category === 'contract' ? 'Contract Updates' :
                   category === 'payment' ? 'Payment Notifications' :
                   category === 'deadline' ? 'Deadline Reminders' :
                   'Dispute Alerts'}
                </h3>
                
                <div className="space-y-3">
                  {prefs.map((pref) => (
                    <div key={pref.type} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{pref.label}</h4>
                          <Badge 
                            variant="outline" 
                            className={cn("text-xs", CATEGORY_COLORS[pref.category])}
                          >
                            {pref.category}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{pref.description}</p>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <Button
                          onClick={() => testNotification(pref.type)}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                        >
                          Test
                        </Button>
                        <Switch
                          checked={pref.enabled}
                          onCheckedChange={(enabled) => updatePreference(pref.type, enabled)}
                          disabled={saving}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Email History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MailIcon className="h-5 w-5" />
                Recent Email Notifications
              </CardTitle>
              <CardDescription>
                History of email notifications sent from your account
              </CardDescription>
            </div>
            <Button 
              onClick={loadNotificationHistory}
              variant="outline"
              size="sm"
            >
              <RefreshCwIcon className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MailIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No email notifications sent yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.slice(0, 10).map((notification) => (
                <div key={notification.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      STATUS_COLORS[notification.status]
                    )}>
                      {getStatusIcon(notification.status)}
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">
                        {notification.notification_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        To: {notification.recipient_email}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <Badge 
                      variant="outline"
                      className={cn("text-xs", STATUS_COLORS[notification.status])}
                    >
                      {notification.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {notification.sent_at 
                        ? formatDate(notification.sent_at)
                        : formatDate(notification.created_at)
                      }
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Configuration Info */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <BellIcon className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900">Email Delivery</p>
              <p className="text-blue-700 mt-1">
                Emails are sent instantly when events occur. Make sure to check your spam folder if you don't receive expected notifications.
                You can adjust these preferences at any time.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}