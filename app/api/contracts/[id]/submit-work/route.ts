import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLogger } from "@/utils/security/audit-logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params;
    const contractId = resolvedParams.id;
    const body = await request.json();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate request body
    const { title, description, deliverable_urls = [], milestone_id = null, notes = "" } = body;

    if (!title || !description) {
      return NextResponse.json({ 
        error: "Title and description are required" 
      }, { status: 400 });
    }

    // Create service client for database operations
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );

    // Get contract details and verify access
    const { data: contract, error: contractError } = await serviceSupabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Verify user is the freelancer on this contract
    if (contract.freelancer_id !== user.id) {
      return NextResponse.json({ 
        error: "Only the freelancer can submit work for this contract" 
      }, { status: 403 });
    }

    // Check contract status - must be signed/active to submit work
    if (!['signed', 'in_progress'].includes(contract.status)) {
      return NextResponse.json({ 
        error: `Cannot submit work. Contract status: ${contract.status}` 
      }, { status: 400 });
    }

    // If milestone_id is provided, verify it belongs to this contract
    if (milestone_id) {
      const { data: milestone, error: milestoneError } = await serviceSupabase
        .from("milestones")
        .select("id, status")
        .eq("id", milestone_id)
        .eq("contract_id", contractId)
        .single();

      if (milestoneError || !milestone) {
        return NextResponse.json({ 
          error: "Invalid milestone ID" 
        }, { status: 400 });
      }

      if (milestone.status === 'completed') {
        return NextResponse.json({ 
          error: "Cannot submit work for completed milestone" 
        }, { status: 400 });
      }
    }

    // Create the work submission
    const { data: submission, error: submissionError } = await serviceSupabase
      .from("submissions")
      .insert({
        contract_id: contractId,
        milestone_id: milestone_id,
        freelancer_id: user.id,
        title: title.trim(),
        description: description.trim(),
        deliverable_urls: deliverable_urls,
        notes: notes.trim(),
        status: 'pending_review',
        submitted_at: new Date().toISOString()
      })
      .select()
      .single();

    if (submissionError) {
      console.error("Error creating submission:", submissionError);
      return NextResponse.json({ 
        error: "Failed to submit work",
        details: submissionError.message 
      }, { status: 500 });
    }

    // Update contract status to in_progress if it was just signed
    if (contract.status === 'signed') {
      await serviceSupabase
        .from("contracts")
        .update({ 
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq("id", contractId);
    }

    // Update milestone status if applicable
    if (milestone_id) {
      await serviceSupabase
        .from("milestones")
        .update({ 
          status: 'submitted',
          updated_at: new Date().toISOString()
        })
        .eq("id", milestone_id);
    }

    // Log the activity
    await serviceSupabase
      .from("contract_activities")
      .insert({
        contract_id: contractId,
        user_id: user.id,
        activity_type: "work_submitted",
        description: `Work submitted: ${title}`,
        metadata: { 
          submission_id: submission.id,
          milestone_id: milestone_id,
          deliverable_count: deliverable_urls.length
        }
      });

    // Log audit event
    await auditLogger.logContractEvent(
      'work_submitted',
      contractId,
      user.id,
      {
        submission_id: submission.id,
        title: title,
        milestone_id: milestone_id
      }
    );

    // Get client profile for notification
    const { data: clientProfile } = await serviceSupabase
      .from("profiles")
      .select("display_name")
      .eq("id", contract.client_id)
      .single();

    // Create notification for the client
    await serviceSupabase
      .from("notifications")
      .insert({
        user_id: contract.client_id,
        type: "in_app",
        title: "New Work Submission",
        message: `${clientProfile?.display_name || 'Freelancer'} has submitted work for "${contract.title}": ${title}`,
        related_entity_type: "contract",
        related_entity_id: contractId
      });

    // Create deliverable records if this is deliverable-based contract
    if (contract.payment_type === 'milestone' && deliverable_urls.length > 0) {
      const deliverableInserts = deliverable_urls.map((url: string, index: number) => ({
        contract_id: contractId,
        submission_id: submission.id,
        title: `Deliverable ${index + 1}`,
        description: `Deliverable from submission: ${title}`,
        file_url: url,
        status: 'submitted',
        submitted_by: user.id,
        submitted_at: new Date().toISOString()
      }));

      await serviceSupabase
        .from("contract_deliverables")
        .insert(deliverableInserts);
    }

    // TODO: Send email notification to client
    // await emailService.sendWorkSubmissionNotification(contract.client_id, contract, submission);

    // TODO: If this completes all required deliverables, trigger completion workflow
    
    revalidatePath(`/dashboard/contracts/${contractId}`);
    revalidatePath(`/dashboard/contracts`);
    
    return NextResponse.json({ 
      success: true,
      submission: submission,
      message: "Work submitted successfully. The client will be notified to review your submission."
    });

  } catch (error) {
    console.error("Work submission error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET method to retrieve work submissions for a contract
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params;
    const contractId = resolvedParams.id;

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

    // Get all submissions for this contract
    const { data: submissions, error } = await serviceSupabase
      .from("submissions")
      .select(`
        *,
        milestones!milestone_id(id, title, description),
        profiles!freelancer_id(display_name, avatar_url)
      `)
      .eq("contract_id", contractId)
      .order("submitted_at", { ascending: false });

    if (error) {
      console.error("Error fetching submissions:", error);
      return NextResponse.json({ 
        error: "Failed to fetch submissions" 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      submissions: submissions || [] 
    });

  } catch (error) {
    console.error("Get submissions error:", error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}