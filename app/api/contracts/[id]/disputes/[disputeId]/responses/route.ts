import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLogger } from "@/utils/security/audit-logger";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; disputeId: string } }
) {
  try {
    const supabase = await createClient();
    const { id: contractId, disputeId } = params;

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

    // Verify dispute belongs to this contract
    const { data: dispute } = await supabase
      .from("contract_disputes")
      .select("id")
      .eq("id", disputeId)
      .eq("contract_id", contractId)
      .single();

    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    // Fetch dispute responses
    const { data: responses, error } = await supabase
      .from("dispute_responses")
      .select(`
        *,
        profiles:responder_id(email)
      `)
      .eq("dispute_id", disputeId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching dispute responses:", error);
      return NextResponse.json({ error: "Failed to fetch responses" }, { status: 500 });
    }

    // Format responses with responder email
    const formattedResponses = responses?.map(response => ({
      ...response,
      responder_email: response.profiles?.email || 'Unknown',
    })) || [];

    return NextResponse.json({ responses: formattedResponses });
  } catch (error) {
    console.error("Dispute responses fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; disputeId: string } }
) {
  try {
    const supabase = await createClient();
    const { id: contractId, disputeId } = params;
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

    // Verify dispute belongs to this contract and is still active
    const { data: dispute } = await supabase
      .from("contract_disputes")
      .select("*")
      .eq("id", disputeId)
      .eq("contract_id", contractId)
      .single();

    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    if (dispute.status === 'resolved' || dispute.status === 'closed') {
      return NextResponse.json({ error: "Cannot respond to a closed dispute" }, { status: 400 });
    }

    // Validate response data
    const validResponseTypes = ['comment', 'evidence', 'proposal', 'counter_proposal'];
    
    if (!validResponseTypes.includes(body.response_type)) {
      return NextResponse.json({ error: "Invalid response type" }, { status: 400 });
    }

    if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
      return NextResponse.json({ error: "Response content is required" }, { status: 400 });
    }

    if (body.content.length > 5000) {
      return NextResponse.json({ error: "Response is too long" }, { status: 400 });
    }

    // Create new dispute response
    const { data: newResponse, error } = await supabase
      .from("dispute_responses")
      .insert({
        dispute_id: disputeId,
        responder_id: user.id,
        response_type: body.response_type,
        content: body.content.trim(),
        attachments: body.attachments || []
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating dispute response:", error);
      return NextResponse.json({ error: "Failed to create response" }, { status: 500 });
    }

    // Update dispute status to investigating if it was just opened
    if (dispute.status === 'open') {
      await supabase
        .from("contract_disputes")
        .update({ status: 'investigating' })
        .eq("id", disputeId);
    }

    // Log the activity
    await auditLogger.log({
      user_id: user.id,
      action: 'dispute_response_added',
      resource_id: contractId,
      resource_type: 'contract',
      metadata: {
        dispute_id: disputeId,
        response_id: newResponse.id,
        response_type: body.response_type,
        content_length: body.content.length
      }
    });

    // TODO: Send notification to other party
    
    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      response: newResponse,
      message: "Response added successfully" 
    });
  } catch (error) {
    console.error("Dispute response creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}