import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
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

    const { id: contractId, milestoneId } = params;

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
        { error: "FORBIDDEN", message: "Access denied to contract" },
        { status: 403 }
      );
    }

    // Get milestone
    const { data: milestone, error: milestoneError } = await supabase
      .from("milestones")
      .select("*")
      .eq("id", milestoneId)
      .eq("contract_id", contractId)
      .single();

    if (milestoneError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Milestone not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      milestone
    });

  } catch (error) {
    console.error("Milestone fetch error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
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

    const { id: contractId, milestoneId } = params;
    const body = await request.json();
    const { status, title, description, amount, due_date, deliverables } = body;

    // Verify access to contract
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("*")
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

    // Get current milestone
    const { data: currentMilestone, error: milestoneError } = await supabase
      .from("milestones")
      .select("*")
      .eq("id", milestoneId)
      .eq("contract_id", contractId)
      .single();

    if (milestoneError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Milestone not found" },
        { status: 404 }
      );
    }

    // Validate status transitions
    if (status && status !== currentMilestone.status) {
      const validTransitions = getValidMilestoneStatusTransitions(currentMilestone.status);
      if (!validTransitions.includes(status)) {
        return NextResponse.json(
          { 
            error: "INVALID_TRANSITION", 
            message: `Cannot transition from ${currentMilestone.status} to ${status}`,
            validTransitions
          },
          { status: 400 }
        );
      }

      // Check permissions for status changes
      if (status === "submitted" && contract.freelancer_id !== user.id) {
        return NextResponse.json(
          { error: "FORBIDDEN", message: "Only freelancer can submit milestones" },
          { status: 403 }
        );
      }

      if (["approved", "revision_requested"].includes(status) && contract.client_id !== user.id) {
        return NextResponse.json(
          { error: "FORBIDDEN", message: "Only client can approve or request revisions" },
          { status: 403 }
        );
      }
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (amount !== undefined) updateData.amount = parseFloat(amount.toString());
    if (due_date !== undefined) updateData.due_date = due_date;
    if (deliverables !== undefined) updateData.deliverables = deliverables;
    if (status !== undefined) {
      updateData.status = status;
      if (status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }
    }

    // Update milestone
    const { data: updatedMilestone, error: updateError } = await supabase
      .from("milestones")
      .update(updateData)
      .eq("id", milestoneId)
      .select()
      .single();

    if (updateError) {
      console.error("Milestone update error:", updateError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to update milestone" },
        { status: 500 }
      );
    }

    // Log activity
    const activityType = status ? `milestone_${status}` : "milestone_updated";
    await supabase.from("contract_activities").insert({
      contract_id: contractId,
      user_id: user.id,
      activity_type: activityType,
      description: status ? 
        `Milestone "${currentMilestone.title}" ${status}` :
        `Milestone "${currentMilestone.title}" updated`,
      metadata: {
        milestone_id: milestoneId,
        previous_status: currentMilestone.status,
        new_status: status,
        updated_fields: Object.keys(updateData).filter(key => key !== 'updated_at')
      }
    });

    // Handle specific status changes
    if (status === "approved") {
      // Check if this was the last milestone
      const { data: allMilestones } = await supabase
        .from("milestones")
        .select("status")
        .eq("contract_id", contractId);

      const pendingMilestones = allMilestones?.filter(m => m.status !== "completed") || [];
      
      if (pendingMilestones.length === 0) {
        // All milestones completed, move contract to pending_completion
        await supabase
          .from("contracts")
          .update({ 
            status: "pending_completion",
            updated_at: new Date().toISOString()
          })
          .eq("id", contractId);

        await supabase.from("contract_activities").insert({
          contract_id: contractId,
          user_id: user.id,
          activity_type: "all_milestones_completed",
          description: "All milestones completed. Contract ready for final completion.",
          metadata: {
            total_milestones: allMilestones?.length || 0
          }
        });
      }
    }

    // Create notifications
    if (status) {
      const notificationRecipients = [contract.creator_id, contract.client_id, contract.freelancer_id]
        .filter(id => id && id !== user.id);

      for (const recipientId of notificationRecipients) {
        await supabase.from("notifications").insert({
          user_id: recipientId,
          type: `milestone_${status}`,
          title: `Milestone ${status.replace('_', ' ')}`,
          message: `Milestone "${currentMilestone.title}" has been ${status.replace('_', ' ')}`,
          related_entity_type: "milestone",
          related_entity_id: milestoneId
        });
      }
    }

    return NextResponse.json({
      success: true,
      milestone: updatedMilestone,
      message: `Milestone ${status ? status.replace('_', ' ') + ' ' : ''}updated successfully`
    });

  } catch (error) {
    console.error("Milestone update error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
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

    const { id: contractId, milestoneId } = params;

    // Verify access to contract
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("creator_id, client_id, freelancer_id, status")
      .eq("id", contractId)
      .single();

    if (contractError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Contract not found" },
        { status: 404 }
      );
    }

    const canEdit = 
      contract.creator_id === user.id ||
      contract.client_id === user.id ||
      contract.freelancer_id === user.id;

    if (!canEdit) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Access denied to contract" },
        { status: 403 }
      );
    }

    // Only allow deletion in draft or pending_signatures status
    if (!["draft", "pending_signatures"].includes(contract.status)) {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: "Milestones can only be deleted from contracts in draft or pending signatures status" },
        { status: 400 }
      );
    }

    // Get milestone to verify it exists and get details for logging
    const { data: milestone, error: milestoneError } = await supabase
      .from("milestones")
      .select("*")
      .eq("id", milestoneId)
      .eq("contract_id", contractId)
      .single();

    if (milestoneError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Milestone not found" },
        { status: 404 }
      );
    }

    // Delete milestone
    const { error: deleteError } = await supabase
      .from("milestones")
      .delete()
      .eq("id", milestoneId);

    if (deleteError) {
      console.error("Milestone deletion error:", deleteError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to delete milestone" },
        { status: 500 }
      );
    }

    // Log activity
    await supabase.from("contract_activities").insert({
      contract_id: contractId,
      user_id: user.id,
      activity_type: "milestone_deleted",
      description: `Milestone "${milestone.title}" deleted`,
      metadata: {
        deleted_milestone: {
          title: milestone.title,
          amount: milestone.amount,
          order_index: milestone.order_index
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: "Milestone deleted successfully"
    });

  } catch (error) {
    console.error("Milestone deletion error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper function to determine valid milestone status transitions
function getValidMilestoneStatusTransitions(currentStatus: string): string[] {
  const transitions: Record<string, string[]> = {
    "pending": ["in_progress"],
    "in_progress": ["submitted"],
    "submitted": ["approved", "revision_requested"],
    "revision_requested": ["in_progress"],
    "approved": ["completed"],
    "completed": [] // Final state
  };

  return transitions[currentStatus] || [];
}