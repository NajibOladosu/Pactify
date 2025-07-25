import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

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

    const resolvedParams = await params; const contractId = resolvedParams.id;
    const body = await request.json();
    const { 
      action, // "approve" or "request_revision"
      submission_id,
      feedback,
      milestone_id = null,
      revision_notes = null
    } = body;

    if (!["approve", "request_revision"].includes(action)) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Action must be 'approve' or 'request_revision'" },
        { status: 400 }
      );
    }

    if (action === "request_revision" && !revision_notes) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Revision notes are required when requesting revisions" },
        { status: 400 }
      );
    }

    // Fetch contract details
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

    // Verify user is the client
    if (contract.client_id !== user.id) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Only the client can review deliverables" },
        { status: 403 }
      );
    }

    // Check contract status
    if (!["in_review", "pending_delivery"].includes(contract.status)) {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: `Cannot review deliverables. Contract status: ${contract.status}` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // If submission_id is provided, update that specific submission
    if (submission_id) {
      const { data: submission, error: submissionError } = await supabase
        .from("submissions")
        .select("*")
        .eq("id", submission_id)
        .eq("contract_id", contractId)
        .single();

      if (submissionError) {
        return NextResponse.json(
          { error: "NOT_FOUND", message: "Submission not found" },
          { status: 404 }
        );
      }

      // Update submission
      const submissionUpdate: any = { updated_at: now };
      if (action === "approve") {
        submissionUpdate.approved_at = now;
      } else {
        submissionUpdate.rejected_at = now;
        submissionUpdate.rejection_reason = revision_notes;
      }

      await supabase
        .from("submissions")
        .update(submissionUpdate)
        .eq("id", submission_id);
    }

    // Handle milestone-specific logic
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

      // Update milestone status
      const milestoneStatus = action === "approve" ? "approved" : "revision_requested";
      await supabase
        .from("milestones")
        .update({
          status: milestoneStatus,
          updated_at: now
        })
        .eq("id", milestone_id);

      // Log milestone activity
      await supabase.from("contract_activities").insert({
        contract_id: contractId,
        user_id: user.id,
        activity_type: `milestone_${action === "approve" ? "approved" : "revision_requested"}`,
        description: `Milestone "${milestone.title}" ${action === "approve" ? "approved" : "revision requested"}`,
        metadata: {
          milestone_id,
          submission_id,
          feedback,
          revision_notes
        }
      });
    }

    // Determine new contract status
    let newContractStatus = contract.status;
    
    if (action === "approve") {
      if (contract.type === "milestone") {
        // Check if all milestones are approved
        const { data: allMilestones } = await supabase
          .from("milestones")
          .select("status")
          .eq("contract_id", contractId);

        const unapprovedMilestones = allMilestones?.filter(m => 
          !["approved", "completed"].includes(m.status)
        ) || [];

        if (unapprovedMilestones.length === 0) {
          newContractStatus = "pending_completion";
        } else {
          newContractStatus = "active"; // More milestones to work on
        }
      } else {
        // Fixed contract - move to pending completion
        newContractStatus = "pending_completion";
      }
    } else {
      // Revision requested
      newContractStatus = "revision_requested";
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

    // Create feedback record if provided
    if (feedback) {
      await supabase.from("feedback").insert({
        contract_id: contractId,
        user_id: user.id,
        comment: feedback,
        rating: null // Rating can be added later
      });
    }

    // Log contract activity
    await supabase.from("contract_activities").insert({
      contract_id: contractId,
      user_id: user.id,
      activity_type: action === "approve" ? "work_approved" : "revision_requested",
      description: action === "approve" ? 
        "Work approved by client" : 
        "Client requested revisions",
      metadata: {
        submission_id,
        milestone_id,
        feedback,
        revision_notes,
        new_status: newContractStatus
      }
    });

    // Create notification for freelancer
    if (contract.freelancer_id) {
      const notificationType = action === "approve" ? "work_approved" : "revision_requested";
      const notificationTitle = action === "approve" ? "Work Approved!" : "Revisions Requested";
      const notificationMessage = action === "approve" ? 
        "Your work has been approved by the client." :
        `The client has requested revisions: ${revision_notes}`;

      await supabase.from("notifications").insert({
        user_id: contract.freelancer_id,
        type: notificationType,
        title: notificationTitle,
        message: notificationMessage,
        related_entity_type: "contract",
        related_entity_id: contractId
      });
    }

    // If approved and ready for completion, trigger payment release process
    if (action === "approve" && newContractStatus === "pending_completion") {
      // In a real implementation, this would trigger the payment release workflow
      console.log(`Contract ${contractId} ready for payment release`);
    }

    return NextResponse.json({
      success: true,
      contract: updatedContract,
      action,
      message: action === "approve" ? 
        "Work approved successfully" : 
        "Revision request sent to freelancer",
      next_steps: action === "approve" ? 
        (newContractStatus === "pending_completion" ? 
          "Contract ready for final completion and payment release" :
          "Continue with remaining milestones") :
        "Freelancer will address the requested revisions"
    });

  } catch (error) {
    console.error("Review submission error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

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

    const resolvedParams = await params; const contractId = resolvedParams.id;

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

    // Get submissions pending review
    const { data: pendingSubmissions, error: submissionsError } = await supabase
      .from("submissions")
      .select(`
        *,
        profiles!user_id(display_name, avatar_url)
      `)
      .eq("contract_id", contractId)
      .is("approved_at", null)
      .is("rejected_at", null)
      .order("submitted_at", { ascending: false });

    if (submissionsError) {
      console.error("Pending submissions fetch error:", submissionsError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch pending submissions" },
        { status: 500 }
      );
    }

    // Get feedback history
    const { data: feedbackHistory, error: feedbackError } = await supabase
      .from("feedback")
      .select(`
        *,
        profiles!user_id(display_name, avatar_url)
      `)
      .eq("contract_id", contractId)
      .order("created_at", { ascending: false });

    if (feedbackError) {
      console.error("Feedback fetch error:", feedbackError);
      // Don't fail the request, just continue without feedback
    }

    // Determine review capabilities
    const reviewCapabilities = {
      can_review: contract.client_id === user.id && pendingSubmissions && pendingSubmissions.length > 0,
      can_submit: contract.freelancer_id === user.id && 
                  ["active", "revision_requested"].includes(contract.status),
      pending_submissions_count: pendingSubmissions?.length || 0,
      contract_status: contract.status
    };

    return NextResponse.json({
      success: true,
      pending_submissions: pendingSubmissions || [],
      feedback_history: feedbackHistory || [],
      review_capabilities,
      contract_type: contract.type
    });

  } catch (error) {
    console.error("Review status fetch error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}