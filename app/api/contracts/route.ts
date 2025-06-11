import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate required fields
    if (!body.title || !body.content) {
      return NextResponse.json(
        { error: "Title and content are required" },
        { status: 400 }
      );
    }

    // Create contract with user as creator
    const { data: contract, error: createError } = await supabase
      .from('contracts')
      .insert({
        title: body.title,
        description: body.description,
        content: body.content,
        creator_id: user.id,
        template_id: body.template_id,
        status: 'draft',
        client_email: body.client_email,
        total_amount: body.total_amount,
        currency: body.currency || 'USD',
        payment_type: body.payment_type || 'fixed'
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating contract:', createError);
      return NextResponse.json(
        { error: "Failed to create contract" },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      message: "Contract created successfully",
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

export async function GET() {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch user's contracts only
    const { data: contracts, error: fetchError } = await supabase
      .from('contracts')
      .select(`
        *,
        contract_templates ( name )
      `)
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Error fetching contracts:', fetchError);
      return NextResponse.json(
        { error: "Failed to fetch contracts" },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      message: "Contracts fetched successfully",
      contracts: contracts || []
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
