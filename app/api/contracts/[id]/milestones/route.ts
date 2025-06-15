import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { Database } from "@/types/supabase-enhanced";
import { 
  MilestoneCreateSchema,
  MilestoneUpdateSchema,
  validateSchema 
} from "@/utils/security/enhanced-validation-schemas";
import { auditLog } from "@/utils/security/audit-logger";

type MilestoneInsert = Database["public"]["Tables"]["contract_milestones"]["Insert"];

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const contractId = params.id;

    // Verify access to contract
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("creator_id, client_id, freelancer_id, type, status")
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

    // Get milestones with related data
    const { data: milestones, error: milestonesError } = await supabase
      .from("contract_milestones")
      .select(`
        *,
        contract_deliverables(
          id, file_name, file_url, is_final, created_at, uploaded_by
        ),
        escrow_payments(
          id, amount, status, funded_at, released_at
        ),
        contract_reviews(
          id, review_type, rating, feedback, created_at, reviewer_id
        )
      `)
      .eq("contract_id", contractId)
      .order("order_index", { ascending: true });

    if (milestonesError) {
      console.error("Milestones fetch error:", milestonesError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch milestones" },
        { status: 500 }
      );
    }

    // Calculate progress
    const totalMilestones = milestones?.length || 0;
    const completedMilestones = milestones?.filter(m => m.status === "completed").length || 0;
    const progress = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0;

    return NextResponse.json({
      success: true,
      milestones: milestones || [],
      progress: {
        total: totalMilestones,
        completed: completedMilestones,
        percentage: Math.round(progress)
      },
      contract_type: contract.type,
      contract_status: contract.status
    });

  } catch (error) {
    console.error("Milestones fetch error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const contractId = params.id;
    const body = await request.json();
    
    // Validate input using enhanced schema
    const validation = validateSchema(MilestoneCreateSchema, body);
    if (!validation.success) {
      return NextResponse.json({ 
        error: "VALIDATION_ERROR", 
        message: "Invalid input data",
        details: validation.errors 
      }, { status: 400 });
    }

    const { title, description, amount, due_date, deliverables = [], order_index } = validation.data!;

    // Verify access to contract and check if it's still in draft
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

    const canEdit = 
      contract.creator_id === user.id ||
      contract.client_id === user.id ||
      contract.freelancer_id === user.id;

    if (!canEdit) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Access denied to contract" },
        { status: 403 }
      );
    }

    // Only allow milestone creation for milestone contracts in draft or pending_signatures status
    if (contract.type !== "milestone") {
      return NextResponse.json(
        { error: "INVALID_CONTRACT_TYPE", message: "Milestones can only be added to milestone contracts" },
        { status: 400 }
      );
    }

    if (!["draft", "pending_signatures"].includes(contract.status)) {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: "Milestones can only be added to contracts in draft or pending signatures status" },
        { status: 400 }
      );
    }

    // Determine order index
    let finalOrderIndex = order_index;
    if (!finalOrderIndex) {
      const { data: existingMilestones } = await supabase
        .from("contract_milestones")
        .select("order_index")
        .eq("contract_id", contractId)
        .order("order_index", { ascending: false })
        .limit(1);

      finalOrderIndex = existingMilestones?.[0]?.order_index ? existingMilestones[0].order_index + 1 : 1;
    }

    // Create milestone
    const milestoneData: MilestoneInsert = {
      contract_id: contractId,
      title,
      description,
      amount: parseFloat(amount.toString()),
      due_date,
      deliverables,
      order_index: finalOrderIndex,
      status: "pending"
    };

    const { data: milestone, error: milestoneError } = await supabase
      .from("contract_milestones")
      .insert(milestoneData)
      .select()
      .single();

    if (milestoneError) {
      console.error("Milestone creation error:", milestoneError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to create milestone" },
        { status: 500 }
      );
    }

    // Log activity using audit logger
    await auditLog({
      action: 'milestone_created',
      resource: 'contract_milestone',
      resourceId: milestone.id,
      userId: user.id,
      metadata: {
        contract_id: contractId,
        milestone_title: title,
        amount: amount,
        order_index: finalOrderIndex,
        has_due_date: !!due_date,
        deliverables_count: deliverables?.length || 0
      }
    });

    return NextResponse.json({
      success: true,
      milestone,
      message: "Milestone created successfully"
    });

  } catch (error) {
    console.error("Milestone creation error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}