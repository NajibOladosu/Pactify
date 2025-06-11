import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: Request,
  context: { params: { id: string } }
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

    const contractId = context.params.id;

    // Fetch contract with full details
    const { data: contract, error } = await supabase
      .from("contracts")
      .select(`
        *,
        contract_templates(name, description, content),
        milestones(
          id, title, description, amount, status, 
          due_date, order_index, deliverables, 
          created_at, updated_at
        ),
        contract_activities(
          id, activity_type, description, created_at, metadata,
          profiles(display_name, avatar_url)
        ),
        profiles!creator_id(display_name, avatar_url, user_type),
        client:profiles!client_id(display_name, avatar_url, user_type),
        freelancer:profiles!freelancer_id(display_name, avatar_url, user_type)
      `)
      .eq("id", contractId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: "NOT_FOUND", message: "Contract not found" },
          { status: 404 }
        );
      }
      console.error("Contract fetch error:", error);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch contract" },
        { status: 500 }
      );
    }

    // Check if user has access to this contract
    const hasAccess = 
      contract.creator_id === user.id ||
      contract.client_id === user.id ||
      contract.freelancer_id === user.id;

    if (!hasAccess) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Access denied to this contract" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      contract
    });

  } catch (error) {
    console.error("Contract fetch error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
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

    const contractId = context.params.id;
    const body = await request.json();

    // First, fetch the contract to check permissions and current status
    const { data: existingContract, error: fetchError } = await supabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json(
          { error: "NOT_FOUND", message: "Contract not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch contract" },
        { status: 500 }
      );
    }

    // Check if user has permission to edit this contract
    const canEdit = 
      existingContract.creator_id === user.id ||
      existingContract.client_id === user.id ||
      existingContract.freelancer_id === user.id;

    if (!canEdit) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Access denied to edit this contract" },
        { status: 403 }
      );
    }

    // Check if contract is locked
    if (existingContract.locked) {
      return NextResponse.json(
        { error: "CONTRACT_LOCKED", message: "Cannot edit locked contract" },
        { status: 400 }
      );
    }

    // Validate status transitions
    if (body.status && body.status !== existingContract.status) {
      const validTransitions = getValidStatusTransitions(existingContract.status);
      if (!validTransitions.includes(body.status)) {
        return NextResponse.json(
          { 
            error: "INVALID_TRANSITION", 
            message: `Cannot transition from ${existingContract.status} to ${body.status}`,
            validTransitions
          },
          { status: 400 }
        );
      }
    }

    // Prepare update data
    const updateData: any = {};
    const allowedFields = [
      'title', 'description', 'content', 'total_amount', 'currency',
      'start_date', 'end_date', 'terms_and_conditions', 'status',
      'client_id', 'freelancer_id', 'client_email'
    ];

    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });

    // Add updated timestamp
    updateData.updated_at = new Date().toISOString();

    // Update contract
    const { data: updatedContract, error: updateError } = await supabase
      .from("contracts")
      .update(updateData)
      .eq("id", contractId)
      .select()
      .single();

    if (updateError) {
      console.error("Contract update error:", updateError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to update contract" },
        { status: 500 }
      );
    }

    // Log the update activity
    if (Object.keys(updateData).length > 1) { // More than just updated_at
      await supabase.from("contract_activities").insert({
        contract_id: contractId,
        user_id: user.id,
        activity_type: "contract_updated",
        description: `Contract updated`,
        metadata: {
          updated_fields: Object.keys(updateData).filter(key => key !== 'updated_at'),
          previous_status: existingContract.status,
          new_status: body.status
        }
      });
    }

    return NextResponse.json({
      success: true,
      contract: updatedContract,
      message: "Contract updated successfully"
    });

  } catch (error) {
    console.error("Contract update error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: { id: string } }
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

    const contractId = context.params.id;

    // Check if contract exists and user is the creator
    const { data: contract, error: fetchError } = await supabase
      .from("contracts")
      .select("creator_id, status, title")
      .eq("id", contractId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json(
          { error: "NOT_FOUND", message: "Contract not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch contract" },
        { status: 500 }
      );
    }

    // Only creator can delete the contract
    if (contract.creator_id !== user.id) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Only the contract creator can delete it" },
        { status: 403 }
      );
    }

    // Cannot delete contracts that are not in draft status
    if (contract.status !== "draft") {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: "Can only delete contracts in draft status" },
        { status: 400 }
      );
    }

    // Delete the contract (this will cascade to related records)
    const { error: deleteError } = await supabase
      .from("contracts")
      .delete()
      .eq("id", contractId);

    if (deleteError) {
      console.error("Contract deletion error:", deleteError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to delete contract" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Contract deleted successfully"
    });

  } catch (error) {
    console.error("Contract deletion error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper function to determine valid status transitions
function getValidStatusTransitions(currentStatus: string): string[] {
  const transitions: Record<string, string[]> = {
    "draft": ["pending_signatures", "cancelled"],
    "pending_signatures": ["pending_funding", "draft", "cancelled"],
    "pending_funding": ["active", "cancelled"],
    "active": ["pending_delivery", "cancelled", "disputed"],
    "pending_delivery": ["in_review", "active", "disputed"],
    "in_review": ["revision_requested", "pending_completion", "disputed"],
    "revision_requested": ["active", "disputed"],
    "pending_completion": ["completed", "disputed"],
    "completed": [], // Final state
    "cancelled": [], // Final state
    "disputed": ["active", "cancelled"] // Can be resolved back to active or cancelled
  };

  return transitions[currentStatus] || [];
}
