import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate contract ID format
    if (!context.params.id || typeof context.params.id !== 'string') {
      return NextResponse.json({ error: "Invalid contract ID" }, { status: 400 });
    }

    // Fetch contract ensuring user owns it
    const { data: contract, error: fetchError } = await supabase
      .from('contracts')
      .select(`
        *,
        contract_templates ( name )
      `)
      .eq('id', context.params.id)
      .eq('creator_id', user.id)
      .single();

    if (fetchError || !contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: "Contract found",
      contract
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate contract ID format
    if (!context.params.id || typeof context.params.id !== 'string') {
      return NextResponse.json({ error: "Invalid contract ID" }, { status: 400 });
    }

    const body = await request.json();

    // Validate input
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Check if user owns the contract first
    const { data: existingContract, error: checkError } = await supabase
      .from('contracts')
      .select('id, creator_id, locked')
      .eq('id', context.params.id)
      .eq('creator_id', user.id)
      .single();

    if (checkError || !existingContract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Check if contract is locked
    if (existingContract.locked) {
      return NextResponse.json({ error: "Contract is locked and cannot be modified" }, { status: 403 });
    }

    // Prepare update data (only allow certain fields)
    const allowedFields = ['title', 'description', 'content', 'client_email', 'total_amount', 'currency'];
    const updateData: any = {};
    
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    updateData.updated_at = new Date().toISOString();

    // Update contract
    const { data: updatedContract, error: updateError } = await supabase
      .from('contracts')
      .update(updateData)
      .eq('id', context.params.id)
      .eq('creator_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating contract:', updateError);
      return NextResponse.json({ error: "Failed to update contract" }, { status: 500 });
    }

    return NextResponse.json({
      message: "Contract updated successfully",
      contract: updatedContract
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate contract ID format
    if (!context.params.id || typeof context.params.id !== 'string') {
      return NextResponse.json({ error: "Invalid contract ID" }, { status: 400 });
    }

    // Check if user owns the contract and if it can be deleted
    const { data: existingContract, error: checkError } = await supabase
      .from('contracts')
      .select('id, creator_id, status, locked')
      .eq('id', context.params.id)
      .eq('creator_id', user.id)
      .single();

    if (checkError || !existingContract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Prevent deletion of signed/completed contracts
    if (['signed', 'completed'].includes(existingContract.status)) {
      return NextResponse.json({ 
        error: "Cannot delete signed or completed contracts" 
      }, { status: 403 });
    }

    // Delete contract
    const { error: deleteError } = await supabase
      .from('contracts')
      .delete()
      .eq('id', context.params.id)
      .eq('creator_id', user.id);

    if (deleteError) {
      console.error('Error deleting contract:', deleteError);
      return NextResponse.json({ error: "Failed to delete contract" }, { status: 500 });
    }

    return NextResponse.json({
      message: "Contract deleted successfully"
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
