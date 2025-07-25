import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLogger } from "@/utils/security/audit-logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params;
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this contract
    const { data: contract } = await supabase
      .from("contracts")
      .select("client_id, freelancer_id")
      .eq("id", contractId)
      .single();

    if (!contract || (contract.client_id !== user.id && contract.freelancer_id !== user.id)) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Fetch collaboration comments
    const { data: comments, error } = await supabase
      .from("contract_comments")
      .select(`
        *,
        profiles:user_id(email)
      `)
      .eq("contract_id", contractId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching collaboration comments:", error);
      return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
    }

    // Format comments with author email
    const formattedComments = comments?.map(comment => ({
      ...comment,
      author_email: comment.profiles?.email || 'Unknown',
    })) || [];

    return NextResponse.json({ comments: formattedComments });
  } catch (error) {
    console.error("Collaboration comments fetch error:", error);
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

    // Verify user has access to this contract
    const { data: contract } = await supabase
      .from("contracts")
      .select("client_id, freelancer_id")
      .eq("id", contractId)
      .single();

    if (!contract || (contract.client_id !== user.id && contract.freelancer_id !== user.id)) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Validate comment content
    if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
      return NextResponse.json({ error: "Comment content is required" }, { status: 400 });
    }

    if (body.content.length > 2000) {
      return NextResponse.json({ error: "Comment is too long" }, { status: 400 });
    }

    // Create new collaboration comment
    const { data: newComment, error } = await supabase
      .from("contract_comments")
      .insert({
        contract_id: contractId,
        comment: body.content.trim(),
        user_id: user.id
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating collaboration comment:", error);
      return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
    }

    // Log the activity
    await auditLogger.log({
      user_id: user.id,
      action: 'collaboration_comment_added',
      resource_id: contractId,
      resource_type: 'contract',
      metadata: {
        comment_id: newComment.id,
        section: body.section,
        content_length: body.content.length
      }
    });

    // TODO: Send notification to other party
    
    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      comment: newComment,
      message: "Comment added successfully" 
    });
  } catch (error) {
    console.error("Collaboration comment creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}