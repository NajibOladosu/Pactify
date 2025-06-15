import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const contractId = params.id;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify access to contract
    const { data: contract } = await supabase
      .from("contracts")
      .select("client_id, freelancer_id")
      .eq("id", contractId)
      .single();

    if (!contract || (contract.client_id !== user.id && contract.freelancer_id !== user.id)) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Fetch messages
    const { data: messages, error } = await supabase
      .from("contract_messages")
      .select(`
        *,
        profiles:sender_id(email)
      `)
      .eq("contract_id", contractId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching messages:", error);
      return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
    }

    const formattedMessages = messages?.map(message => ({
      ...message,
      sender_email: message.profiles?.email || 'Unknown',
    })) || [];

    return NextResponse.json({ messages: formattedMessages });
  } catch (error) {
    console.error("Messages fetch error:", error);
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify access to contract
    const { data: contract } = await supabase
      .from("contracts")
      .select("client_id, freelancer_id")
      .eq("id", contractId)
      .single();

    if (!contract || (contract.client_id !== user.id && contract.freelancer_id !== user.id)) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
      return NextResponse.json({ error: "Message content is required" }, { status: 400 });
    }

    // Create message
    const { data: newMessage, error } = await supabase
      .from("contract_messages")
      .insert({
        contract_id: contractId,
        sender_id: user.id,
        content: body.content.trim(),
        message_type: body.message_type || 'text',
        attachments: body.attachments || []
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating message:", error);
      return NextResponse.json({ error: "Failed to create message" }, { status: 500 });
    }

    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      message: newMessage,
      success: true 
    });
  } catch (error) {
    console.error("Message creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}