import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { EmailNotificationService, NotificationContext } from "@/lib/utils/email-notifications";
import { auditLog } from "@/utils/security/audit-logger";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { 
      type, 
      contractId, 
      recipientEmail, 
      context 
    } = body;

    if (!type || !contractId || !recipientEmail) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Missing required fields: type, contractId, recipientEmail" },
        { status: 400 }
      );
    }

    // Fetch contract details
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select(`
        *,
        profiles!contracts_creator_id_fkey(display_name, email),
        client_profile:profiles!contracts_client_id_fkey(display_name, email),
        freelancer_profile:profiles!contracts_freelancer_id_fkey(display_name, email)
      `)
      .eq("id", contractId)
      .single();

    if (contractError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Contract not found" },
        { status: 404 }
      );
    }

    // Check if user has access to this contract
    const hasAccess = 
      contract.creator_id === user.id ||
      contract.client_id === user.id ||
      contract.freelancer_id === user.id;

    if (!hasAccess) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Access denied to contract" },
        { status: 403 }
      );
    }

    // Get sender profile
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", user.id)
      .single();

    // Build notification context
    const notificationContext: NotificationContext = {
      contractId: contract.id,
      contractTitle: contract.title,
      contractNumber: contract.contract_number,
      clientName: contract.client_profile?.display_name || contract.client_profile?.email?.split('@')[0],
      freelancerName: contract.freelancer_profile?.display_name || contract.freelancer_profile?.email?.split('@')[0],
      amount: context?.amount || contract.total_amount,
      currency: contract.currency,
      milestoneTitle: context?.milestoneTitle,
      dueDate: context?.dueDate,
      recipientName: recipientEmail.split('@')[0],
      recipientEmail: recipientEmail,
      senderName: senderProfile?.display_name || senderProfile?.email?.split('@')[0] || 'Pactify User',
      additionalInfo: context?.additionalInfo || {}
    };

    // Send email based on type
    let emailSent = false;
    
    switch (type) {
      case 'contract_invitation':
        emailSent = await EmailNotificationService.sendContractInvitation(notificationContext);
        break;
      case 'contract_signed':
        emailSent = await EmailNotificationService.sendContractSigned(notificationContext);
        break;
      case 'payment_funded':
        emailSent = await EmailNotificationService.sendPaymentFunded(notificationContext);
        break;
      case 'milestone_submitted':
        emailSent = await EmailNotificationService.sendMilestoneSubmitted(notificationContext);
        break;
      case 'payment_released':
        emailSent = await EmailNotificationService.sendPaymentReleased(notificationContext);
        break;
      case 'contract_completed':
        emailSent = await EmailNotificationService.sendContractCompleted(notificationContext);
        break;
      case 'deadline_reminder':
        emailSent = await EmailNotificationService.sendDeadlineReminder(notificationContext);
        break;
      case 'dispute_opened':
        emailSent = await EmailNotificationService.sendDisputeOpened(notificationContext);
        break;
      default:
        return NextResponse.json(
          { error: "INVALID_TYPE", message: `Unsupported notification type: ${type}` },
          { status: 400 }
        );
    }

    // Log the email notification attempt
    await auditLog({
      action: 'email_notification_sent',
      resource: 'notification',
      resourceId: `${contractId}_${type}`,
      userId: user.id,
      metadata: {
        notification_type: type,
        recipient_email: recipientEmail,
        contract_id: contractId,
        email_sent: emailSent,
        context: notificationContext
      }
    });

    // Store notification record in database
    const { error: notificationError } = await supabase
      .from("contract_notifications")
      .insert({
        contract_id: contractId,
        user_id: user.id,
        recipient_email: recipientEmail,
        notification_type: type,
        status: emailSent ? 'sent' : 'failed',
        email_data: notificationContext,
        sent_at: emailSent ? new Date().toISOString() : null
      });

    if (notificationError) {
      console.error("Failed to store notification record:", notificationError);
      // Continue execution - don't fail the API call for this
    }

    if (emailSent) {
      return NextResponse.json({
        success: true,
        message: "Email notification sent successfully",
        notification_type: type,
        recipient: recipientEmail
      });
    } else {
      return NextResponse.json(
        { error: "EMAIL_FAILED", message: "Failed to send email notification" },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error("Email notification error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contractId');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabase
      .from('contract_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (contractId) {
      query = query.eq('contract_id', contractId);
    }

    const { data: notifications, error } = await query;

    if (error) {
      console.error("Failed to fetch notifications:", error);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch notifications" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      notifications: notifications || [],
      total: notifications?.length || 0
    });

  } catch (error) {
    console.error("Notifications fetch error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}