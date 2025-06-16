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

    // Fetch contract versions
    const { data: versions, error } = await supabase
      .from("contract_versions")
      .select(`
        *,
        profiles:proposed_by(email)
      `)
      .eq("contract_id", contractId)
      .order("version_number", { ascending: false });

    if (error) {
      console.error("Error fetching contract versions:", error);
      return NextResponse.json({ error: "Failed to fetch versions" }, { status: 500 });
    }

    // Format versions with proposer email
    const formattedVersions = versions?.map(version => ({
      ...version,
      proposed_by_email: version.profiles?.email || 'Unknown',
    })) || [];

    return NextResponse.json({ versions: formattedVersions });
  } catch (error) {
    console.error("Contract versions fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const contractId = params.id;
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

    // TODO: Send notification to other party
    
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