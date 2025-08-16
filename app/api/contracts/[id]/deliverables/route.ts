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
        profiles!uploaded_by(display_name)
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
      .select("client_id, freelancer_id, status")
      .eq("id", contractId)
      .single();

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    if (contract.freelancer_id !== user.id) {
      return NextResponse.json({ error: "Only the freelancer can submit deliverables" }, { status: 403 });
    }

    // Add logging to debug the issue
    console.log('Received deliverable submission:', {
      deliverable_type: body.deliverable_type,
      title: body.title,
      hasDescription: !!body.description,
      hasLinkUrl: !!body.link_url,
      hasTextContent: !!body.text_content
    });

    // Validate deliverable data
    const validDeliverableTypes = ['file', 'link', 'text'];
    
    if (!validDeliverableTypes.includes(body.deliverable_type)) {
      console.error('Invalid deliverable type:', body.deliverable_type);
      return NextResponse.json({ error: `Invalid deliverable type: ${body.deliverable_type}` }, { status: 400 });
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

    // Prepare the deliverable data based on type
    const deliverableData: any = {
      contract_id: contractId,
      version: nextVersion,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      deliverable_type: body.deliverable_type,
      uploaded_by: user.id,
      submitted_by: user.id,
      status: 'pending',
      is_latest_version: true
    };

    // Handle different deliverable types with required fields
    if (body.deliverable_type === 'file') {
      // For file type, all file fields are required by the schema
      deliverableData.file_url = body.file_url?.trim() || '';
      deliverableData.file_name = body.file_name?.trim() || 'Unknown File';
      deliverableData.file_size = body.file_size || 0;
      deliverableData.file_type = body.file_type?.trim() || 'application/octet-stream';
      deliverableData.link_url = null;
      deliverableData.text_content = null;
    } else if (body.deliverable_type === 'link') {
      // For link type, provide default values for required file fields
      deliverableData.file_url = '';
      deliverableData.file_name = '';
      deliverableData.file_size = 0;
      deliverableData.file_type = '';
      deliverableData.link_url = body.link_url?.trim() || null;
      deliverableData.text_content = null;
    } else if (body.deliverable_type === 'text') {
      // For text type, provide default values for required file fields
      deliverableData.file_url = '';
      deliverableData.file_name = '';
      deliverableData.file_size = 0;
      deliverableData.file_type = '';
      deliverableData.link_url = null;
      deliverableData.text_content = body.text_content?.trim() || null;
    }

    // Create new deliverable
    const { data: newDeliverable, error } = await serviceSupabase
      .from("contract_deliverables")
      .insert(deliverableData)
      .select()
      .single();

    if (error) {
      console.error("Error creating deliverable:", error);
      return NextResponse.json({ error: "Failed to create deliverable" }, { status: 500 });
    }

    // Check if this is a final deliverable submission for a pending_delivery contract
    if (contract.status === 'pending_delivery' && body.is_final === true) {
      // Move contract to pending_completion to enable payment release
      const { error: statusUpdateError } = await serviceSupabase
        .from("contracts")
        .update({ status: 'pending_completion' })
        .eq("id", contractId);

      if (statusUpdateError) {
        console.error("Error updating contract status to pending_completion:", statusUpdateError);
      } else {
        // Log the status change
        await auditLogger.logContractEvent(
          'final_deliverable_submitted',
          contractId,
          user.id,
          {
            deliverable_id: newDeliverable.id,
            title: body.title,
            message: 'Final deliverable submitted - contract ready for payment release'
          }
        );
      }
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
        type: body.deliverable_type,
        is_final: body.is_final || false
      }
    );

    // TODO: Send notification to client

    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      deliverable: newDeliverable,
      message: body.is_final 
        ? "Final deliverable submitted successfully. Contract is ready for payment release." 
        : "Deliverable submitted successfully" 
    });
  } catch (error) {
    console.error("Deliverable creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}