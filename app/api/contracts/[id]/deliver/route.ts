import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const contractId = params.id;
    const body = await request.json();
    const { 
      submission_url, 
      notes, 
      deliverables = [], 
      milestone_id = null 
    } = body;

    // Fetch contract details
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (contractError) {
      if (contractError.code === 'PGRST116') {
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

    // Verify user is the freelancer
    if (contract.freelancer_id !== user.id) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Only the freelancer can submit deliverables" },
        { status: 403 }
      );
    }

    // Check contract status
    const validStatuses = ["active", "pending_delivery"];
    if (!validStatuses.includes(contract.status)) {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: `Cannot submit deliverables. Contract status: ${contract.status}` },
        { status: 400 }
      );
    }

    // If milestone_id is provided, verify it belongs to this contract and is in correct status
    if (milestone_id) {
      const { data: milestone, error: milestoneError } = await supabase
        .from("milestones")
        .select("*")
        .eq("id", milestone_id)
        .eq("contract_id", contractId)
        .single();

      if (milestoneError) {
        return NextResponse.json(
          { error: "NOT_FOUND", message: "Milestone not found" },
          { status: 404 }
        );
      }

      if (milestone.status !== "in_progress") {
        return NextResponse.json(
          { error: "INVALID_MILESTONE_STATUS", message: `Milestone must be in progress. Current status: ${milestone.status}` },
          { status: 400 }
        );
      }
    }

    const now = new Date().toISOString();

    // Create submission record
    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .insert({
        contract_id: contractId,
        user_id: user.id,
        submission_url,
        notes,
        submitted_at: now
      })
      .select()
      .single();

    if (submissionError) {
      console.error("Submission creation error:", submissionError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to create submission" },
        { status: 500 }
      );
    }

    // Update contract status
    let newContractStatus = "in_review";
    if (contract.type === "milestone" && milestone_id) {
      // For milestone contracts, update the specific milestone
      await supabase
        .from("milestones")
        .update({
          status: "submitted",
          updated_at: now
        })
        .eq("id", milestone_id);

      // Check if all milestones are submitted/approved
      const { data: allMilestones } = await supabase
        .from("milestones")
        .select("status")
        .eq("contract_id", contractId);

      const pendingMilestones = allMilestones?.filter(m => 
        !["submitted", "approved", "completed"].includes(m.status)
      ) || [];

      // If no pending milestones, move contract to in_review
      if (pendingMilestones.length === 0) {
        newContractStatus = "in_review";
      } else {
        newContractStatus = "active"; // Keep active if there are pending milestones
      }
    }

    // Update contract status
    const { data: updatedContract, error: contractUpdateError } = await supabase
      .from("contracts")
      .update({
        status: newContractStatus,
        updated_at: now
      })
      .eq("id", contractId)
      .select()
      .single();

    if (contractUpdateError) {
      console.error("Contract update error:", contractUpdateError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to update contract status" },
        { status: 500 }
      );
    }

    // Log delivery activity
    const activityType = milestone_id ? "milestone_delivered" : "work_delivered";
    await supabase.from("contract_activities").insert({
      contract_id: contractId,
      user_id: user.id,
      activity_type: activityType,
      description: milestone_id ? 
        "Milestone deliverables submitted for review" :
        "Work deliverables submitted for review",
      metadata: {
        submission_id: submission.id,
        milestone_id,
        submission_url,
        has_notes: !!notes,
        deliverables_count: deliverables.length,
        new_contract_status: newContractStatus
      }
    });

    // Create notification for client
    if (contract.client_id) {
      await supabase.from("notifications").insert({
        user_id: contract.client_id,
        type: "work_submitted",
        title: "Work Submitted for Review",
        message: milestone_id ? 
          "Milestone deliverables have been submitted and are ready for your review." :
          `Work for "${contract.title}" has been submitted and is ready for your review.`,
        related_entity_type: "contract",
        related_entity_id: contractId
      });
    }

    // Set auto-approval timer (7 days from now)
    const autoApprovalDate = new Date();
    autoApprovalDate.setDate(autoApprovalDate.getDate() + 7);

    return NextResponse.json({
      success: true,
      submission,
      contract: updatedContract,
      message: milestone_id ? 
        "Milestone deliverables submitted successfully" :
        "Work submitted successfully and is now under review",
      review_period: {
        start_date: now,
        auto_approval_date: autoApprovalDate.toISOString(),
        review_days_remaining: 7
      },
      next_steps: {
        for_client: "Review the submitted work and either approve, request revisions, or raise disputes",
        for_freelancer: "Wait for client review. Auto-approval occurs in 7 days if no response."
      }
    });

  } catch (error) {
    console.error("Work delivery error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const contractId = params.id;

    // Verify access to contract
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("creator_id, client_id, freelancer_id, status, type")
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

    // Get all submissions for this contract
    const { data: submissions, error: submissionsError } = await supabase
      .from("submissions")
      .select(`
        *,
        profiles!user_id(display_name, avatar_url)
      `)
      .eq("contract_id", contractId)
      .order("submitted_at", { ascending: false });

    if (submissionsError) {
      console.error("Submissions fetch error:", submissionsError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch submissions" },
        { status: 500 }
      );
    }

    // Get pending submissions (not yet reviewed)
    const pendingSubmissions = submissions?.filter(s => 
      !s.approved_at && !s.rejected_at
    ) || [];

    // Calculate review status
    const reviewStatus = {
      total_submissions: submissions?.length || 0,
      pending_review: pendingSubmissions.length,
      can_submit: contract.freelancer_id === user.id && 
                  ["active", "pending_delivery"].includes(contract.status),
      can_review: contract.client_id === user.id && pendingSubmissions.length > 0
    };

    return NextResponse.json({
      success: true,
      submissions: submissions || [],
      review_status: reviewStatus,
      contract_status: contract.status,
      contract_type: contract.type
    });

  } catch (error) {
    console.error("Submissions fetch error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}