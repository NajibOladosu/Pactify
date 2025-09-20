import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/utils/send-email';

export interface NotificationData {
  user_id: string;
  type: 'email' | 'in_app' | 'sms' | 'push';
  title: string;
  message: string;
  template_name?: string;
  template_variables?: Record<string, any>;
  related_resource_type?: string;
  related_resource_id?: string;
  data?: Record<string, any>;
}

export class NotificationService {
  private serviceSupabase;

  constructor() {
    this.serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );
  }

  /**
   * Send a notification using a template
   */
  async sendNotification(
    templateName: string,
    userId: string,
    variables: Record<string, any> = {},
    options: {
      types?: ('email' | 'in_app' | 'sms' | 'push')[];
      related_resource_type?: string;
      related_resource_id?: string;
      data?: Record<string, any>;
    } = {}
  ) {
    try {
      // Get notification template
      const { data: template, error: templateError } = await this.serviceSupabase
        .from('notification_templates')
        .select('*')
        .eq('name', templateName)
        .eq('is_active', true)
        .single();

      if (templateError || !template) {
        console.error(`Notification template '${templateName}' not found:`, templateError);
        return { success: false, error: 'Template not found' };
      }

      // Get user notification settings
      const { data: settings } = await this.serviceSupabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      // Determine which notification types to send
      const typesToSend = options.types || [template.type];
      const enabledTypes = typesToSend.filter(type => {
        if (!settings) return true; // Default to enabled if no settings
        
        switch (type) {
          case 'email':
            return settings.email_enabled;
          case 'push':
            return settings.push_enabled;
          case 'sms':
            return settings.sms_enabled;
          case 'in_app':
            return true; // In-app notifications are always enabled
          default:
            return false;
        }
      });

      if (enabledTypes.length === 0) {
        return { success: true, message: 'User has disabled all notification types' };
      }

      // Replace template variables
      const subject = this.replaceVariables(template.subject || '', variables);
      const message = this.replaceVariables(template.template, variables);

      const results = [];

      // Send each enabled notification type
      for (const type of enabledTypes) {
        const result = await this.sendSingleNotification({
          user_id: userId,
          type,
          title: subject,
          message,
          template_name: templateName,
          template_variables: variables,
          related_resource_type: options.related_resource_type,
          related_resource_id: options.related_resource_id,
          data: options.data
        });
        results.push({ type, result });
      }

      return { success: true, results };
    } catch (error) {
      console.error('Error sending notification:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Send a single notification
   */
  async sendSingleNotification(notificationData: NotificationData) {
    try {
      // Create notification record
      const { data: notification, error: insertError } = await this.serviceSupabase
        .from('notifications')
        .insert({
          user_id: notificationData.user_id,
          type: notificationData.type,
          title: notificationData.title,
          message: notificationData.message,
          data: notificationData.data,
          related_resource_type: notificationData.related_resource_type,
          related_resource_id: notificationData.related_resource_id,
          delivery_status: 'pending'
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating notification record:', insertError);
        return { success: false, error: insertError.message };
      }

      // Send the actual notification based on type
      let deliveryResult;
      switch (notificationData.type) {
        case 'email':
          deliveryResult = await this.sendEmailNotification(notificationData);
          break;
        case 'in_app':
          deliveryResult = { success: true }; // In-app notifications are just database records
          break;
        case 'push':
          deliveryResult = await this.sendPushNotification(notificationData);
          break;
        case 'sms':
          deliveryResult = await this.sendSMSNotification(notificationData);
          break;
        default:
          deliveryResult = { success: false, error: 'Unsupported notification type' };
      }

      // Update notification status
      const deliveryStatus = deliveryResult.success ? 'sent' : 'failed';
      const errorMessage = deliveryResult.success ? null : (typeof deliveryResult === 'object' ? deliveryResult.error : 'Unknown error');

      await this.serviceSupabase
        .from('notifications')
        .update({
          delivery_status: deliveryStatus,
          sent_at: deliveryResult.success ? new Date().toISOString() : null,
          error_message: errorMessage
        })
        .eq('id', notification.id);

      return deliveryResult;
    } catch (error) {
      console.error('Error sending single notification:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(notificationData: NotificationData) {
    try {
      // Get user email
      const { data: profile } = await this.serviceSupabase
        .from('profiles')
        .select('email, display_name')
        .eq('id', notificationData.user_id)
        .single();

      if (!profile?.email) {
        return { success: false, error: 'User email not found' };
      }

      // Send email using the email service
      const emailResult = await sendEmail({
        to: profile.email,
        subject: notificationData.title,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">${notificationData.title}</h2>
            <div style="color: #666; line-height: 1.6;">
              ${notificationData.message.replace(/\n/g, '<br>')}
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">
              This is an automated message from Pactify. If you have questions, please contact support.
            </p>
          </div>
        `,
        text: notificationData.message
      });

      return emailResult;
    } catch (error) {
      console.error('Error sending email notification:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Send push notification (placeholder for future implementation)
   */
  private async sendPushNotification(notificationData: NotificationData) {
    // TODO: Implement push notification service (Firebase, OneSignal, etc.)
    console.log('Push notification would be sent:', notificationData.title);
    return { success: true };
  }

  /**
   * Send SMS notification (placeholder for future implementation)
   */
  private async sendSMSNotification(notificationData: NotificationData) {
    // TODO: Implement SMS service (Twilio, AWS SNS, etc.)
    console.log('SMS notification would be sent:', notificationData.title);
    return { success: true };
  }

  /**
   * Replace template variables in a string
   */
  private replaceVariables(template: string, variables: Record<string, any>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, String(value));
    }
    return result;
  }

  /**
   * Mark in-app notifications as read
   */
  async markAsRead(notificationIds: string[], userId: string) {
    try {
      const { error } = await this.serviceSupabase
        .from('notifications')
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .in('id', notificationIds)
        .eq('user_id', userId);

      if (error) {
        console.error('Error marking notifications as read:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get user's unread notification count
   */
  async getUnreadCount(userId: string) {
    try {
      const { data, error } = await this.serviceSupabase
        .from('notifications')
        .select('id', { count: 'exact' })
        .eq('user_id', userId)
        .eq('type', 'in_app')
        .is('read_at', null);

      if (error) {
        console.error('Error getting unread count:', error);
        return { success: false, error: error.message };
      }

      return { success: true, count: data?.length || 0 };
    } catch (error) {
      console.error('Error getting unread count:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get user's notifications with pagination
   */
  async getUserNotifications(
    userId: string, 
    options: {
      limit?: number;
      offset?: number;
      type?: string;
      unread_only?: boolean;
    } = {}
  ) {
    try {
      let query = this.serviceSupabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId);

      if (options.type) {
        query = query.eq('type', options.type);
      }

      if (options.unread_only) {
        query = query.is('read_at', null);
      }

      query = query
        .order('created_at', { ascending: false })
        .range(options.offset || 0, (options.offset || 0) + (options.limit || 50) - 1);

      const { data, error } = await query;

      if (error) {
        console.error('Error getting user notifications:', error);
        return { success: false, error: error.message };
      }

      return { success: true, notifications: data || [] };
    } catch (error) {
      console.error('Error getting user notifications:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();