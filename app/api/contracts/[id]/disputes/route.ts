import { createClient } from "@/utils/supabase/server";
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

    // Verify user has access to this contract
    const { data: contract } = await supabase
      .from("contracts")
      .select("client_id, freelancer_id")
      .eq("id", contractId)
      .single();

    if (!contract || (contract.client_id !== user.id && contract.freelancer_id !== user.id)) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Fetch disputes for this contract
    const { data: disputes, error } = await supabase
      .from("contract_disputes")
      .select(`
        *,
        profiles:raised_by(email)
      `)
      .eq("contract_id", contractId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching disputes:", error);
      return NextResponse.json({ error: "Failed to fetch disputes" }, { status: 500 });
    }

    // Format disputes with raiser email
    const formattedDisputes = disputes?.map(dispute => ({
      ...dispute,
      raised_by_email: dispute.profiles?.email || 'Unknown',
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

    // Verify user has access to this contract
    const { data: contract } = await supabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (!contract || (contract.client_id !== user.id && contract.freelancer_id !== user.id)) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Validate dispute data
    const validTypes = ['quality', 'timeline', 'payment', 'scope', 'other'];
    const validPriorities = ['low', 'medium', 'high', 'urgent'];

    if (!validTypes.includes(body.type)) {
      return NextResponse.json({ error: "Invalid dispute type" }, { status: 400 });
    }

    if (!validPriorities.includes(body.priority)) {
      return NextResponse.json({ error: "Invalid priority level" }, { status: 400 });
    }

    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
      return NextResponse.json({ error: "Dispute title is required" }, { status: 400 });
    }

    if (!body.description || typeof body.description !== 'string' || body.description.trim().length === 0) {
      return NextResponse.json({ error: "Dispute description is required" }, { status: 400 });
    }

    // Check if there's already an open dispute for this contract
    const { data: existingDispute } = await supabase
      .from("contract_disputes")
      .select("id")
      .eq("contract_id", contractId)
      .in("status", ["open", "investigating", "mediation", "arbitration"])
      .limit(1)
      .single();

    if (existingDispute) {
      return NextResponse.json({ 
        error: "There is already an active dispute for this contract" 
      }, { status: 400 });
    }

    // Create new dispute
    const { data: newDispute, error } = await supabase
      .from("contract_disputes")
      .insert({
        contract_id: contractId,
        raised_by: user.id,
        dispute_type: body.type,
        priority: body.priority,
        title: body.title.trim(),
        description: body.description.trim(),
        status: 'open'
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating dispute:", error);
      return NextResponse.json({ error: "Failed to create dispute" }, { status: 500 });
    }

    // Update contract status to disputed
    await supabase
      .from("contracts")
      .update({ status: 'disputed' })
      .eq("id", contractId);

    // Log the activity
    await auditLogger.log({
      user_id: user.id,
      action: 'contract_dispute_created',
      resource_id: contractId,
      resource_type: 'contract',
      metadata: {
        dispute_id: newDispute.id,
        dispute_type: body.type,
        priority: body.priority,
        title: body.title
      }
    });

    // TODO: Send notification to other party
    
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