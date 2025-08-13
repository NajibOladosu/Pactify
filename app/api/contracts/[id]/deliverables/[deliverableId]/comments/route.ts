import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLogger } from "@/utils/security/audit-logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deliverableId: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params;
    const { id: contractId, deliverableId } = resolvedParams;

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

    // Verify deliverable belongs to this contract
    const { data: deliverable } = await serviceSupabase
      .from("contract_deliverables")
      .select("id")
      .eq("id", deliverableId)
      .eq("contract_id", contractId)
      .single();

    if (!deliverable) {
      return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
    }

    // Fetch comments with commenter information
    const { data: comments, error } = await serviceSupabase
      .from("deliverable_comments")
      .select(`
        *,
        profiles!commenter_id(display_name)
      `)
      .eq("deliverable_id", deliverableId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching deliverable comments:", error);
      return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
    }

    // Format comments with commenter display name
    const formattedComments = comments?.map(comment => ({
      ...comment,
      commenter_email: comment.profiles?.display_name || 'Unknown User',
    })) || [];

    return NextResponse.json({ comments: formattedComments });
  } catch (error) {
    console.error("Deliverable comments fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deliverableId: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params;
    const { id: contractId, deliverableId } = resolvedParams;
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
      .select("client_id, freelancer_id")
      .eq("id", contractId)
      .single();

    if (!contract || (contract.client_id !== user.id && contract.freelancer_id !== user.id)) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Verify deliverable belongs to this contract
    const { data: deliverable } = await serviceSupabase
      .from("contract_deliverables")
      .select("id")
      .eq("id", deliverableId)
      .eq("contract_id", contractId)
      .single();

    if (!deliverable) {
      return NextResponse.json({ error: "Deliverable not found" }, { status: 404 });
    }

    // Validate comment data
    if (!body.comment || typeof body.comment !== 'string' || body.comment.trim().length === 0) {
      return NextResponse.json({ error: "Comment is required" }, { status: 400 });
    }

    if (body.comment.length > 2000) {
      return NextResponse.json({ error: "Comment is too long" }, { status: 400 });
    }

    // Create new comment
    const { data: newComment, error } = await serviceSupabase
      .from("deliverable_comments")
      .insert({
        deliverable_id: deliverableId,
        commenter_id: user.id,
        comment: body.comment.trim()
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating deliverable comment:", error);
      return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
    }

    // Log the activity
    await auditLogger.logContractEvent(
      'deliverable_comment_added',
      contractId,
      user.id,
      {
        deliverable_id: deliverableId,
        comment_id: newComment.id
      }
    );

    // TODO: Send notification to other party

    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      comment: newComment,
      message: "Comment added successfully" 
    });
  } catch (error) {
    console.error("Deliverable comment creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}