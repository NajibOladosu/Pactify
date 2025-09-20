import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLogger } from "@/utils/security/audit-logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params; const contractId = resolvedParams.id;

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create service client for database operations
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );

    // Verify user has access to this contract
    const { data: contract } = await serviceSupabase
      .from("contracts")
      .select("client_id, freelancer_id")
      .eq("id", contractId)
      .single();

    if (!contract || (contract.client_id !== user.id && contract.freelancer_id !== user.id)) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Fetch disputes for this contract
    const { data: disputes, error } = await serviceSupabase
      .from("contract_disputes")
      .select(`
        *,
        profiles!initiated_by(display_name)
      `)
      .eq("contract_id", contractId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching disputes:", error);
      return NextResponse.json({ error: "Failed to fetch disputes" }, { status: 500 });
    }

    // Format disputes with initiator display name
    const formattedDisputes = disputes?.map(dispute => ({
      ...dispute,
      initiated_by_email: dispute.profiles?.display_name || 'Unknown User',
    })) || [];

    return NextResponse.json({ disputes: formattedDisputes });
  } catch (error) {
    console.error("Disputes fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params; const contractId = resolvedParams.id;
    const body = await request.json();
    

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create service client for database operations
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );

    // Verify user has access to this contract
    const { data: contract } = await serviceSupabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (!contract || (contract.client_id !== user.id && contract.freelancer_id !== user.id)) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Validate dispute data
    const validTypes = ['quality', 'timeline', 'payment', 'scope', 'other'];

    if (!validTypes.includes(body.type)) {
      return NextResponse.json({ error: "Invalid dispute type", received: body.type, valid: validTypes }, { status: 400 });
    }

    if (!body.description || typeof body.description !== 'string' || body.description.trim().length === 0) {
      return NextResponse.json({ error: "Dispute description is required" }, { status: 400 });
    }

    // Check if there's already an open dispute for this contract
    const { data: existingDispute } = await serviceSupabase
      .from("contract_disputes")
      .select("id")
      .eq("contract_id", contractId)
      .in("status", ["open", "in_progress", "escalated"])
      .limit(1)
      .single();

    if (existingDispute) {
      return NextResponse.json({ 
        error: "There is already an active dispute for this contract" 
      }, { status: 400 });
    }

    // Create new dispute - using correct database field names
    const { data: newDispute, error } = await serviceSupabase
      .from("contract_disputes")
      .insert({
        contract_id: contractId,
        initiated_by: user.id,  // Fixed: was 'raised_by', should be 'initiated_by'
        dispute_type: body.type,
        description: body.description.trim(),
        status: 'open'
        // Removed: title and priority fields don't exist in database schema
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating dispute:", error);
      return NextResponse.json({ 
        error: "Failed to create dispute", 
        details: error.message,
        code: error.code 
      }, { status: 500 });
    }

    // Update contract status to disputed
    await serviceSupabase
      .from("contracts")
      .update({ status: 'disputed' })
      .eq("id", contractId);

    // Log the activity
    await auditLogger.logContractEvent(
      'dispute_created',
      contractId,
      user.id,
      {
        dispute_id: newDispute.id,
        dispute_type: body.type
      }
    );

    // Send notification to other party
    const otherPartyId = contract.client_id === user.id ? contract.freelancer_id : contract.client_id;
    const { data: currentUserProfile } = await serviceSupabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    // Create notification for other party
    await serviceSupabase
      .from("notifications")
      .insert({
        user_id: otherPartyId,
        type: "in_app",
        title: "Dispute Created",
        message: `${currentUserProfile?.display_name || 'The other party'} has created a dispute for contract "${contract.title}"`,
        related_entity_type: "contract",
        related_entity_id: contractId
      });

    // Send email notification using notification service
    const { notificationService } = await import('@/lib/services/notification-service');
    
    try {
      await notificationService.sendNotification(
        'dispute_created',
        otherPartyId,
        {
          contract_title: contract.title,
          dispute_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/contracts/${contractId}`
        },
        {
          types: ['email', 'in_app'],
          related_resource_type: 'contract',
          related_resource_id: contractId
        }
      );
    } catch (emailError) {
      console.warn('Failed to send email notification:', emailError);
    }
    
    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      dispute: newDispute,
      message: "Dispute created successfully" 
    });
  } catch (error) {
    console.error("Dispute creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}