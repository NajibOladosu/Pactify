"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  SendIcon, 
  XIcon, 
  MessageSquareIcon, 
  UserIcon, 
  ClockIcon,
  FileTextIcon 
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface ContractInfo {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  total_amount?: number;
  currency?: string;
}

interface Message {
  id: string;
  message: string;
  sender_id: string;
  sender_name?: string;
  created_at: string;
  message_type: string;
  is_read: boolean;
}

interface ContractChatProps {
  contract: ContractInfo;
  isOpen: boolean;
  onClose: () => void;
  clientEmail: string;
  clientName?: string;
}

export function ContractChat({ contract, isOpen, onClose, clientEmail, clientName }: ContractChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const supabase = createClient();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && contract) {
      fetchCurrentUser();
      fetchMessages();
      
      // Set up real-time subscription for new messages
      const channel = supabase
        .channel(`contract-${contract.id}-messages`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'contract_messages',
            filter: `contract_id=eq.${contract.id}`
          },
          (payload) => {
            const newMessage = payload.new as any;
            // Format the message to match our interface
            const formattedMessage = {
              ...newMessage,
              sender_name: 'New User', // This will be updated when we refetch
            };
            setMessages(prev => [...prev, formattedMessage]);
            
            // Mark as read if it's not from current user
            if (newMessage.sender_id !== currentUser?.id) {
              markMessagesAsRead();
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [isOpen, contract, currentUser?.id]);

  const fetchCurrentUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      setCurrentUser(user);
    } catch (error) {
      console.error('Error fetching user:', error);
    }
  };

  const fetchMessages = async () => {
    setIsLoading(true);
    try {
      // Use the API endpoint instead of direct Supabase call
      const response = await fetch(`/api/contracts/${contract.id}/messages`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch messages');
      }

      const { messages: fetchedMessages } = await response.json();
      setMessages(fetchedMessages || []);
      
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load chat messages.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const markMessagesAsRead = async () => {
    if (!currentUser) return;
    
    try {
      const { error } = await supabase.rpc('mark_messages_as_read', {
        p_contract_id: contract.id,
        p_user_id: currentUser.id
      });
      
      if (error) {
        console.error('RPC Error marking messages as read:', error);
      }
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUser || isSending) return;

    setIsSending(true);
    try {
      const response = await fetch(`/api/contracts/${contract.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: newMessage.trim(),
          message_type: 'text'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }

      const { data: sentMessage } = await response.json();
      
      // Add the message to the local state
      if (sentMessage) {
        setMessages(prev => [...prev, sentMessage]);
      }
      
      setNewMessage("");
      
      toast({
        title: "Message Sent",
        description: "Your message has been sent successfully.",
      });
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      });
    } else if (diffInHours < 48) {
      return 'Yesterday ' + date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'signed':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'disputed':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl h-[600px] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <MessageSquareIcon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg">
                  Chat: {contract.title}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-muted-foreground">
                    with {clientName || clientEmail.split('@')[0]}
                  </span>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${getStatusColor(contract.status)}`}
                  >
                    {contract.status}
                  </Badge>
                </div>
              </div>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                <XIcon className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          <ScrollArea className="flex-1 px-6 py-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-sm text-muted-foreground">Loading messages...</div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <MessageSquareIcon className="h-8 w-8 text-muted-foreground mb-2" />
                <div className="text-sm text-muted-foreground mb-1">No messages yet</div>
                <div className="text-xs text-muted-foreground">
                  Start the conversation about this contract
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => {
                  const isCurrentUser = message.sender_id === currentUser?.id;
                  const showDate = index === 0 || 
                    new Date(message.created_at).toDateString() !== 
                    new Date(messages[index - 1].created_at).toDateString();

                  return (
                    <div key={message.id}>
                      {showDate && (
                        <div className="flex items-center gap-3 my-4">
                          <Separator className="flex-1" />
                          <span className="text-xs text-muted-foreground px-2">
                            {new Date(message.created_at).toDateString() === new Date().toDateString() 
                              ? 'Today' 
                              : new Date(message.created_at).toLocaleDateString('en-US', { 
                                  weekday: 'long', 
                                  year: 'numeric', 
                                  month: 'long', 
                                  day: 'numeric' 
                                })
                            }
                          </span>
                          <Separator className="flex-1" />
                        </div>
                      )}
                      
                      <div className={`flex gap-3 ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <UserIcon className="h-4 w-4" />
                        </div>
                        <div className={`flex-1 max-w-[70%] ${isCurrentUser ? 'items-end' : 'items-start'} flex flex-col`}>
                          <div className={`rounded-lg px-3 py-2 text-sm ${
                            isCurrentUser 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-muted'
                          }`}>
                            {message.message}
                          </div>
                          <div className={`flex items-center gap-2 mt-1 text-xs text-muted-foreground ${
                            isCurrentUser ? 'flex-row-reverse' : ''
                          }`}>
                            <span>{isCurrentUser ? 'You' : message.sender_name}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <ClockIcon className="h-3 w-3" />
                              {formatTime(message.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          <div className="border-t px-6 py-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Type your message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isSending}
                />
              </div>
              <Button 
                onClick={sendMessage} 
                disabled={!newMessage.trim() || isSending}
                size="sm"
              >
                {isSending ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <SendIcon className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Press Enter to send • This conversation is specific to this contract
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}