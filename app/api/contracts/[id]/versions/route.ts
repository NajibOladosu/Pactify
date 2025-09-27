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

    // Get contract versions using the new function
    const { data: versions, error } = await supabase
      .rpc('get_contract_versions', { contract_uuid: contractId });

    if (error) {
      console.error("Error fetching contract versions:", error);
      return NextResponse.json({ error: "Failed to fetch versions" }, { status: 500 });
    }

    // Format versions with proposer name
    const formattedVersions = versions?.map((version: any) => ({
      ...version,
      proposed_by_name: version.proposer_name || 'Unknown',
    })) || [];

    return NextResponse.json({ versions: formattedVersions });
  } catch (error) {
    console.error("Contract versions fetch error:", error);
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

    // Get the latest version number
    const { data: latestVersion } = await supabase
      .from("contract_versions")
      .select("version_number")
      .eq("contract_id", contractId)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    const nextVersionNumber = (latestVersion?.version_number || 0) + 1;

    // Create new contract version
    const { data: newVersion, error } = await supabase
      .from("contract_versions")
      .insert({
        contract_id: contractId,
        version_number: nextVersionNumber,
        title: body.title || contract.title,
        description: body.description || contract.description,
        terms: body.terms || contract.terms,
        total_amount: body.total_amount || contract.total_amount,
        currency: body.currency || contract.currency,
        proposed_by: user.id,
        changes_summary: body.changes_summary,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating contract version:", error);
      return NextResponse.json({ error: "Failed to create version" }, { status: 500 });
    }

    // Log the activity
    await auditLogger.log({
      user_id: user.id,
      action: 'contract_version_proposed',
      resource_id: contractId,
      resource_type: 'contract',
      metadata: {
        version_number: nextVersionNumber,
        changes_summary: body.changes_summary
      }
    });

    // Send notification to other party
    const otherPartyId = contract.client_id === user.id ? contract.freelancer_id : contract.client_id;
    const { data: currentUserProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    await supabase
      .from("notifications")
      .insert({
        user_id: otherPartyId,
        type: "in_app",
        title: "Contract Version Proposed",
        message: `${currentUserProfile?.display_name || 'The other party'} has proposed a new version of the contract "${contract.title}"`,
        related_entity_type: "contract",
        related_entity_id: contractId
      });
    
    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      version: newVersion,
      message: "Contract version proposed successfully" 
    });
  } catch (error) {
    console.error("Contract version creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}