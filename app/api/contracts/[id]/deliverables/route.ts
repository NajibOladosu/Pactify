import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLogger } from "@/utils/security/audit-logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params;
    const { id: contractId } = resolvedParams;

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

    // Fetch deliverables with profile information
    const { data: deliverables, error } = await serviceSupabase
      .from("contract_deliverables")
      .select(`
        *,
        profiles!submitted_by(display_name)
      `)
      .eq("contract_id", contractId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching deliverables:", error);
      return NextResponse.json({ error: "Failed to fetch deliverables" }, { status: 500 });
    }

    // Format deliverables with submitter display name
    const formattedDeliverables = deliverables?.map(deliverable => ({
      ...deliverable,
      submitted_by_email: deliverable.profiles?.display_name || 'Unknown User',
    })) || [];

    return NextResponse.json({ deliverables: formattedDeliverables });
  } catch (error) {
    console.error("Deliverables fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const resolvedParams = await params;
    const { id: contractId } = resolvedParams;
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

    // Verify user has access to this contract and is the freelancer
    const { data: contract } = await serviceSupabase
      .from("contracts")
      .select("client_id, freelancer_id")
      .eq("id", contractId)
      .single();

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    if (contract.freelancer_id !== user.id) {
      return NextResponse.json({ error: "Only the freelancer can submit deliverables" }, { status: 403 });
    }

    // Validate deliverable data
    const validDeliverableTypes = ['file', 'link', 'text'];
    
    if (!validDeliverableTypes.includes(body.deliverable_type)) {
      return NextResponse.json({ error: "Invalid deliverable type" }, { status: 400 });
    }

    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (body.title.length > 200) {
      return NextResponse.json({ error: "Title is too long" }, { status: 400 });
    }

    if (body.description && body.description.length > 1000) {
      return NextResponse.json({ error: "Description is too long" }, { status: 400 });
    }

    // Type-specific validations
    if (body.deliverable_type === 'link') {
      if (!body.link_url || typeof body.link_url !== 'string' || body.link_url.trim().length === 0) {
        return NextResponse.json({ error: "URL is required for link deliverables" }, { status: 400 });
      }
      // Basic URL validation
      try {
        new URL(body.link_url);
      } catch {
        return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
      }
    }

    if (body.deliverable_type === 'text') {
      if (!body.text_content || typeof body.text_content !== 'string' || body.text_content.trim().length === 0) {
        return NextResponse.json({ error: "Text content is required for text deliverables" }, { status: 400 });
      }
      if (body.text_content.length > 50000) {
        return NextResponse.json({ error: "Text content is too long" }, { status: 400 });
      }
    }

    // Get the latest version number for this title
    const { data: existingDeliverables } = await serviceSupabase
      .from("contract_deliverables")
      .select("version")
      .eq("contract_id", contractId)
      .eq("title", body.title.trim())
      .order("version", { ascending: false })
      .limit(1);

    const nextVersion = existingDeliverables && existingDeliverables.length > 0 
      ? existingDeliverables[0].version + 1 
      : 1;

    // Mark previous versions as not latest
    if (nextVersion > 1) {
      await serviceSupabase
        .from("contract_deliverables")
        .update({ is_latest_version: false })
        .eq("contract_id", contractId)
        .eq("title", body.title.trim());
    }

    // Create new deliverable
    const { data: newDeliverable, error } = await serviceSupabase
      .from("contract_deliverables")
      .insert({
        contract_id: contractId,
        version: nextVersion,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        deliverable_type: body.deliverable_type,
        link_url: body.link_url?.trim() || null,
        text_content: body.text_content?.trim() || null,
        submitted_by: user.id,
        status: 'pending',
        is_latest_version: true
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating deliverable:", error);
      return NextResponse.json({ error: "Failed to create deliverable" }, { status: 500 });
    }

    // Log the activity
    await auditLogger.logContractEvent(
      'deliverable_submitted',
      contractId,
      user.id,
      {
        deliverable_id: newDeliverable.id,
        title: body.title,
        version: nextVersion,
        type: body.deliverable_type
      }
    );

    // TODO: Send notification to client

    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      deliverable: newDeliverable,
      message: "Deliverable submitted successfully" 
    });
  } catch (error) {
    console.error("Deliverable creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}