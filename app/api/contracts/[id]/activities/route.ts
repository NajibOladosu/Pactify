import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const resolvedParams = await params;
    const contractId = resolvedParams.id;
    const { searchParams } = new URL(request.url);
    const activityType = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Verify access to contract
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("creator_id, client_id, freelancer_id")
      .eq("id", contractId)
      .single();

    if (contractError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Contract not found" },
        { status: 404 }
      );
    }

    const hasAccess = 
      contract.creator_id === user.id ||
      contract.client_id === user.id ||
      contract.freelancer_id === user.id;

    if (!hasAccess) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Access denied to contract activities" },
        { status: 403 }
      );
    }

    // Build query
    let query = supabase
      .from("contract_activities")
      .select(`
        id,
        activity_type,
        description,
        metadata,
        created_at,
        profiles!user_id(id, display_name, avatar_url)
      `)
      .eq("contract_id", contractId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (activityType) {
      query = query.eq("activity_type", activityType);
    }

    const { data: activities, error: activitiesError } = await query;

    if (activitiesError) {
      console.error("Activities fetch error:", activitiesError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch contract activities" },
        { status: 500 }
      );
    }

    // Get activity type counts for summary
    const { data: activityCounts } = await supabase
      .from("contract_activities")
      .select("activity_type")
      .eq("contract_id", contractId);

    const summary = activityCounts?.reduce((acc: Record<string, number>, activity: any) => {
      acc[activity.activity_type] = (acc[activity.activity_type] || 0) + 1;
      return acc;
    }, {}) || {};

    return NextResponse.json({
      success: true,
      activities: activities || [],
      summary,
      pagination: {
        limit,
        offset,
        total: activities?.length || 0,
        has_more: (activities?.length || 0) === limit
      }
    });

  } catch (error) {
    console.error("Contract activities fetch error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const resolvedParams = await params;
    const contractId = resolvedParams.id;
    const body = await request.json();
    const { activity_type, description, metadata = {} } = body;

    if (!activity_type || !description) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Activity type and description are required" },
        { status: 400 }
      );
    }

    // Verify access to contract
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("creator_id, client_id, freelancer_id, title")
      .eq("id", contractId)
      .single();

    if (contractError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Contract not found" },
        { status: 404 }
      );
    }

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

    // Validate activity type
    const validActivityTypes = [
      "contract_created", "contract_updated", "contract_signed", "funding_initiated", 
      "funding_completed", "milestone_activated", "milestone_submitted", "milestone_approved",
      "delivery_submitted", "review_completed", "revision_requested", "payment_released",
      "contract_completed", "contract_cancelled", "dispute_raised", "comment_added",
      "file_uploaded", "deadline_extended", "status_changed"
    ];

    if (!validActivityTypes.includes(activity_type)) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid activity type" },
        { status: 400 }
      );
    }

    // Create activity
    const { data: activity, error: activityError } = await supabase
      .from("contract_activities")
      .insert({
        contract_id: contractId,
        user_id: user.id,
        activity_type,
        description,
        metadata
      })
      .select(`
        id,
        activity_type,
        description,
        metadata,
        created_at,
        profiles!user_id(id, display_name, avatar_url)
      `)
      .single();

    if (activityError) {
      console.error("Activity creation error:", activityError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to create activity" },
        { status: 500 }
      );
    }

    // Create notifications for other parties (if applicable)
    const notificationTypes = ["comment_added", "file_uploaded", "deadline_extended"];
    if (notificationTypes.includes(activity_type)) {
      const otherParties = [contract.creator_id, contract.client_id, contract.freelancer_id]
        .filter(id => id && id !== user.id);

      for (const partyId of otherParties) {
        await supabase.from("notifications").insert({
          user_id: partyId,
          type: activity_type,
          title: getNotificationTitle(activity_type, contract.title),
          message: description,
          related_entity_type: "contract",
          related_entity_id: contractId
        });
      }
    }

    return NextResponse.json({
      success: true,
      activity,
      message: "Activity logged successfully"
    });

  } catch (error) {
    console.error("Contract activity creation error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper function to generate notification titles
function getNotificationTitle(activityType: string, contractTitle: string): string {
  const titles: Record<string, string> = {
    comment_added: `New comment on "${contractTitle}"`,
    file_uploaded: `New file uploaded to "${contractTitle}"`,
    deadline_extended: `Deadline extended for "${contractTitle}"`,
    milestone_submitted: `Milestone submitted for "${contractTitle}"`,
    delivery_submitted: `Work delivered for "${contractTitle}"`,
    revision_requested: `Revision requested for "${contractTitle}"`,
    payment_released: `Payment released for "${contractTitle}"`,
    dispute_raised: `Dispute raised for "${contractTitle}"`
  };

  return titles[activityType] || `Update on "${contractTitle}"`;
}