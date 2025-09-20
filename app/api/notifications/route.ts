import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { notificationService } from "@/lib/services/notification-service";
import { withAuth } from "@/utils/api/with-auth";
import type { User } from "@supabase/supabase-js";

// GET - Retrieve user's notifications
async function handleGetNotifications(request: NextRequest, user: User) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const unread_only = url.searchParams.get('unread_only') === 'true';
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const result = await notificationService.getUserNotifications(user.id, {
      type: type || undefined,
      unread_only,
      limit,
      offset
    });

    if (!result.success) {
      return NextResponse.json({ 
        error: "Failed to fetch notifications",
        details: result.error 
      }, { status: 500 });
    }

    // Get unread count
    const unreadResult = await notificationService.getUnreadCount(user.id);
    const unreadCount = unreadResult.success ? unreadResult.count : 0;

    return NextResponse.json({
      success: true,
      notifications: result.notifications,
      unread_count: unreadCount,
      total: result.notifications?.length || 0,
      pagination: {
        limit,
        offset,
        has_more: (result.notifications?.length || 0) === limit
      }
    });

  } catch (error) {
    console.error("Get notifications error:", error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}

// POST - Send a manual notification (admin only) or mark notifications as read
async function handlePostNotifications(request: NextRequest, user: User) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'mark_read') {
      // Mark notifications as read
      const { notification_ids } = body;
      
      if (!Array.isArray(notification_ids) || notification_ids.length === 0) {
        return NextResponse.json({ 
          error: "notification_ids array is required" 
        }, { status: 400 });
      }

      const result = await notificationService.markAsRead(notification_ids, user.id);

      if (!result.success) {
        return NextResponse.json({ 
          error: "Failed to mark notifications as read",
          details: result.error 
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `${notification_ids.length} notifications marked as read`
      });

    } else if (action === 'send_notification') {
      // Send manual notification (admin only)
      // TODO: Check if user has admin permissions
      const { template_name, user_id, variables, types, related_resource_type, related_resource_id } = body;

      if (!template_name || !user_id) {
        return NextResponse.json({ 
          error: "template_name and user_id are required" 
        }, { status: 400 });
      }

      const result = await notificationService.sendNotification(
        template_name,
        user_id,
        variables || {},
        {
          types,
          related_resource_type,
          related_resource_id
        }
      );

      if (!result.success) {
        return NextResponse.json({ 
          error: "Failed to send notification",
          details: result.error 
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: "Notification sent successfully",
        results: result.results
      });

    } else {
      return NextResponse.json({ 
        error: "Invalid action. Supported actions: mark_read, send_notification" 
      }, { status: 400 });
    }

  } catch (error) {
    console.error("Post notifications error:", error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}

// DELETE - Delete notifications
async function handleDeleteNotifications(request: NextRequest, user: User) {
  try {
    const url = new URL(request.url);
    const notificationIds = url.searchParams.get('ids')?.split(',') || [];

    if (notificationIds.length === 0) {
      return NextResponse.json({ 
        error: "notification IDs are required" 
      }, { status: 400 });
    }

    const supabase = await createClient();

    // Delete notifications (only user's own notifications)
    const { error } = await supabase
      .from('notifications')
      .delete()
      .in('id', notificationIds)
      .eq('user_id', user.id);

    if (error) {
      console.error("Error deleting notifications:", error);
      return NextResponse.json({ 
        error: "Failed to delete notifications",
        details: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `${notificationIds.length} notifications deleted`
    });

  } catch (error) {
    console.error("Delete notifications error:", error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}

export const GET = withAuth(handleGetNotifications);
export const POST = withAuth(handlePostNotifications);
export const DELETE = withAuth(handleDeleteNotifications);