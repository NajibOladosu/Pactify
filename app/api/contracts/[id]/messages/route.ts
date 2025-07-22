import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: contractId } = await params;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log('GET messages - User:', { userId: user.id, userEmail: user.email });
    console.log('GET messages - Contract ID:', contractId);

    // Verify access to contract - check both old and new schema patterns
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("id, creator_id, client_email, client_id, freelancer_id")
      .eq("id", contractId)
      .single();

    console.log('GET messages - Contract query result:', { contract, contractError });

    if (contractError || !contract) {
      console.log('GET messages - Contract not found or error:', contractError);
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Check authorization - support both new and old schema
    const isCreator = contract.creator_id === user.id;
    const isClientByEmail = contract.client_email === user.email;
    const isClientById = contract.client_id === user.id;
    const isFreelancer = contract.freelancer_id === user.id;
    
    console.log('GET messages - Authorization checks:', {
      isCreator,
      isClientByEmail,
      isClientById,
      isFreelancer,
      contract_creator_id: contract.creator_id,
      contract_client_email: contract.client_email,
      contract_client_id: contract.client_id,
      contract_freelancer_id: contract.freelancer_id,
      user_id: user.id,
      user_email: user.email
    });

    const isAuthorized = isCreator || isClientByEmail || isClientById || isFreelancer;

    if (!isAuthorized) {
      // Check contract_parties table as well
      const { data: partyData } = await supabase
        .from('contract_parties')
        .select('id')
        .eq('contract_id', contractId)
        .eq('user_id', user.id)
        .maybeSingle();

      console.log('GET messages - Contract parties check:', partyData);

      if (!partyData) {
        console.log('GET messages - Access denied for user');
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    // Fetch messages with sender information
    const { data: messages, error } = await supabase
      .from("contract_messages")
      .select(`
        *,
        profiles:sender_id (
          id,
          display_name,
          email
        )
      `)
      .eq("contract_id", contractId)
      .is('deleted_at', null)
      .order("created_at", { ascending: true });

    console.log('Messages query result:', { messages, error, contractId });

    if (error) {
      console.error("Error fetching messages:", error);
      return NextResponse.json({ error: "Failed to fetch messages", details: error.message }, { status: 500 });
    }

    const formattedMessages = messages?.map(message => ({
      ...message,
      sender_name: message.profiles?.display_name || message.profiles?.email?.split('@')[0] || 'Unknown',
      sender_email: message.profiles?.email || 'Unknown',
    })) || [];

    // Mark messages as read for the current user
    if (messages && messages.length > 0) {
      await supabase.rpc('mark_messages_as_read', {
        p_contract_id: contractId,
        p_user_id: user.id
      });
    }

    return NextResponse.json({ 
      messages: formattedMessages,
      count: formattedMessages.length 
    });
  } catch (error) {
    console.error("Messages fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: contractId } = await params;
    const body = await request.json();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify access to contract - check both old and new schema patterns
    const { data: contract } = await supabase
      .from("contracts")
      .select("id, creator_id, client_email, client_id, freelancer_id")
      .eq("id", contractId)
      .single();

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Check authorization - support both new and old schema
    const isAuthorized = contract.creator_id === user.id || 
                        contract.client_email === user.email ||
                        contract.client_id === user.id || 
                        contract.freelancer_id === user.id;

    if (!isAuthorized) {
      // Check contract_parties table as well
      const { data: partyData } = await supabase
        .from('contract_parties')
        .select('id')
        .eq('contract_id', contractId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!partyData) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    // Support both 'content' and 'message' field names
    const messageText = body.message || body.content;
    console.log('POST /api/contracts/[id]/messages - Request body:', { body, messageText, contractId });
    
    if (!messageText || typeof messageText !== 'string' || messageText.trim().length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Ensure conversation exists
    const { data: conversation } = await supabase
      .from('contract_conversations')
      .select('id')
      .eq('contract_id', contractId)
      .maybeSingle();

    let conversationId = conversation?.id;

    if (!conversationId) {
      // Create conversation if it doesn't exist
      const { data: newConversation, error: createConversationError } = await supabase
        .from('contract_conversations')
        .insert({
          contract_id: contractId
        })
        .select('id')
        .single();

      if (createConversationError) {
        console.error('Error creating conversation:', createConversationError);
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
      }

      conversationId = newConversation.id;
    }

    // Create message
    const { data: newMessage, error } = await supabase
      .from("contract_messages")
      .insert({
        conversation_id: conversationId,
        contract_id: contractId,
        sender_id: user.id,
        message: messageText.trim(),
        message_type: body.message_type || 'text',
        attachment_url: body.attachment_url || null,
        attachment_name: body.attachment_name || null,
        attachment_size: body.attachment_size || null,
      })
      .select(`
        *,
        profiles:sender_id (
          id,
          display_name,
          email
        )
      `)
      .single();

    if (error) {
      console.error("Error creating message:", error);
      return NextResponse.json({ error: "Failed to create message" }, { status: 500 });
    }

    const formattedMessage = {
      ...newMessage,
      sender_name: newMessage.profiles?.display_name || newMessage.profiles?.email?.split('@')[0] || 'Unknown',
      sender_email: newMessage.profiles?.email || 'Unknown',
    };

    revalidatePath(`/dashboard/contracts/${contractId}`);
    
    return NextResponse.json({ 
      message: 'Message sent successfully',
      data: formattedMessage,
      success: true 
    });
  } catch (error) {
    console.error("Message creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}