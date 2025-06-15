"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { 
  MessageSquareIcon, 
  SendIcon,
  PaperclipIcon,
  UserIcon,
  ClockIcon,
  CheckCheckIcon,
  FileIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  contract_id: string;
  sender_id: string;
  sender_email: string;
  content: string;
  message_type: 'text' | 'file' | 'system';
  attachments?: string[];
  read_at?: string;
  created_at: string;
}

interface ContractMessagingProps {
  contractId: string;
  userId: string;
  userEmail: string;
  contractTitle: string;
}

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffHours = Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60);
  
  if (diffHours < 24) {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  } else if (diffHours < 168) { // 7 days
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit'
    });
  }
};

export default function ContractMessaging({ 
  contractId, 
  userId, 
  userEmail,
  contractTitle 
}: ContractMessagingProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
  }, [contractId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchMessages = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`/api/contracts/${contractId}/messages`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        
        // Mark messages as read
        markMessagesAsRead();
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      toast({
        title: "Error",
        description: "Failed to load messages",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const markMessagesAsRead = async () => {
    try {
      await fetch(`/api/contracts/${contractId}/messages/mark-read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      setSending(true);

      const response = await fetch(`/api/contracts/${contractId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newMessage.trim(),
          message_type: 'text'
        }),
      });

      if (response.ok) {
        setNewMessage('');
        fetchMessages(); // Refresh messages
      } else {
        throw new Error('Failed to send message');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <ClockIcon className="h-6 w-6 animate-spin mr-2" />
            <span>Loading messages...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareIcon className="h-5 w-5" />
          Contract Discussion
        </CardTitle>
        <CardDescription>
          Communicate about: {contractTitle}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Messages Container */}
          <div className="h-96 border rounded-lg p-4 overflow-y-auto bg-muted/20">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <MessageSquareIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No messages yet</p>
                  <p className="text-sm">Start the conversation!</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => {
                  const isOwnMessage = message.sender_id === userId;
                  
                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex gap-3",
                        isOwnMessage ? "justify-end" : "justify-start"
                      )}
                    >
                      {!isOwnMessage && (
                        <div className="h-8 w-8 bg-primary-500 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                          {message.sender_email[0].toUpperCase()}
                        </div>
                      )}
                      
                      <div
                        className={cn(
                          "max-w-xs lg:max-w-md rounded-lg p-3",
                          isOwnMessage
                            ? "bg-primary-500 text-white"
                            : "bg-white border shadow-sm"
                        )}
                      >
                        {!isOwnMessage && (
                          <div className="text-xs font-medium mb-1 opacity-70">
                            {message.sender_email}
                          </div>
                        )}
                        
                        <div className="text-sm">
                          {message.message_type === 'system' ? (
                            <em className="text-muted-foreground">{message.content}</em>
                          ) : (
                            message.content
                          )}
                        </div>
                        
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {message.attachments.map((attachment, index) => (
                              <div key={index} className="flex items-center gap-2 text-xs">
                                <FileIcon className="h-3 w-3" />
                                <span>{attachment}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <div className={cn(
                          "text-xs mt-1 flex items-center gap-1",
                          isOwnMessage ? "text-white/70" : "text-muted-foreground"
                        )}>
                          <ClockIcon className="h-3 w-3" />
                          <span>{formatTime(message.created_at)}</span>
                          {isOwnMessage && message.read_at && (
                            <CheckCheckIcon className="h-3 w-3 ml-1" />
                          )}
                        </div>
                      </div>
                      
                      {isOwnMessage && (
                        <div className="h-8 w-8 bg-primary-500 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                          {userEmail[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Message Input */}
          <div className="space-y-3">
            <Textarea
              placeholder="Type your message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              className="min-h-[80px] resize-none"
              disabled={sending}
            />
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled>
                  <PaperclipIcon className="h-4 w-4 mr-2" />
                  Attach File
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Soon
                  </Badge>
                </Button>
              </div>
              
              <Button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || sending}
              >
                {sending ? (
                  <ClockIcon className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <SendIcon className="h-4 w-4 mr-2" />
                )}
                Send Message
              </Button>
            </div>
          </div>

          {/* Info */}
          <div className="text-xs text-muted-foreground border-t pt-3">
            <p>💡 Tip: Press Enter to send, Shift+Enter for new line</p>
            <p>🔒 All messages are encrypted and only visible to contract participants</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}