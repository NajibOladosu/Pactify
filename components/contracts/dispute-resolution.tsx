"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  AlertTriangleIcon, 
  GavelIcon,
  MessageSquareIcon,
  FileTextIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  UploadIcon,
  ScaleIcon,
  ShieldIcon,
  AlertCircleIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Dispute {
  id: string;
  contract_id: string;
  initiated_by: string;
  initiated_by_email: string;
  dispute_type: 'quality' | 'timeline' | 'payment' | 'scope' | 'other';
  status: 'open' | 'in_progress' | 'resolved' | 'escalated';
  description: string;
  evidence_urls?: string[];
  resolution?: string;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
  updated_at?: string;
}

interface DisputeResponse {
  id: string;
  dispute_id: string;
  responder_id: string;
  responder_email: string;
  response_type: 'comment' | 'evidence' | 'proposal' | 'counter_proposal';
  content: string;
  attachments?: string[];
  created_at: string;
}

interface DisputeResolutionProps {
  contractId: string;
  userId: string;
  userRole: 'client' | 'freelancer' | 'creator';
  contractTitle: string;
}

const DISPUTE_TYPES = [
  { value: 'quality', label: 'Work Quality Issues', icon: AlertTriangleIcon },
  { value: 'timeline', label: 'Timeline/Deadline Issues', icon: ClockIcon },
  { value: 'payment', label: 'Payment Disputes', icon: FileTextIcon },
  { value: 'scope', label: 'Scope Changes', icon: MessageSquareIcon },
  { value: 'other', label: 'Other Issues', icon: AlertCircleIcon }
];

// Updated status colors to match website theme with better contrast
const STATUS_COLORS = {
  open: 'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20',
  in_progress: 'bg-amber-500/10 text-amber-700 border-amber-500/30 hover:bg-amber-500/20 dark:text-amber-400', 
  escalated: 'bg-red-500/10 text-red-700 border-red-500/30 hover:bg-red-500/20 dark:text-red-400',
  resolved: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20 dark:text-emerald-400'
};

// Remove priority colors since priority field doesn't exist

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function DisputeResolution({ 
  contractId, 
  userId, 
  userRole, 
  contractTitle 
}: DisputeResolutionProps) {
  const { toast } = useToast();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [disputeResponses, setDisputeResponses] = useState<DisputeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'create' | 'responses'>('overview');
  
  // New dispute form state
  const [newDispute, setNewDispute] = useState({
    type: 'other' as any,
    description: ''
  });
  
  // New response form state
  const [newResponse, setNewResponse] = useState('');

  useEffect(() => {
    fetchDisputeData();
  }, [contractId]);

  useEffect(() => {
    if (selectedDispute) {
      fetchDisputeResponses(selectedDispute.id);
    } else {
      setDisputeResponses([]);
    }
  }, [selectedDispute, contractId]);

  const fetchDisputeResponses = async (disputeId: string) => {
    try {
      const responsesResponse = await fetch(`/api/contracts/${contractId}/disputes/${disputeId}/responses`);
      if (responsesResponse.ok) {
        const responsesData = await responsesResponse.json();
        setDisputeResponses(responsesData.responses || []);
      } else {
        console.error('Failed to fetch responses:', await responsesResponse.text());
      }
    } catch (error) {
      console.error('Error fetching responses:', error);
    }
  };

  const fetchDisputeData = async () => {
    try {
      setLoading(true);
      
      // Fetch disputes for this contract
      const disputesResponse = await fetch(`/api/contracts/${contractId}/disputes`);
      if (disputesResponse.ok) {
        const disputesData = await disputesResponse.json();
        setDisputes(disputesData.disputes || []);
        
        // Select the first open dispute if available
        const openDisputes = disputesData.disputes?.filter((d: Dispute) => 
          ['open', 'in_progress', 'escalated'].includes(d.status)
        );
        if (openDisputes?.length > 0 && !selectedDispute) {
          setSelectedDispute(openDisputes[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch dispute data:', error);
      toast({
        title: "Error",
        description: "Failed to load dispute information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDispute = async () => {
    if (!newDispute.description.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a description of the dispute",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`/api/contracts/${contractId}/disputes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newDispute),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Dispute created successfully",
        });
        
        // Reset form
        setNewDispute({
          type: 'other',
          description: ''
        });
        
        // Refresh data and switch to overview
        fetchDisputeData();
        setActiveTab('overview');
        window.location.reload();
      } else {
        throw new Error('Failed to create dispute');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create dispute",
        variant: "destructive",
      });
    }
  };

  const handleAddResponse = async () => {
    if (!newResponse.trim() || !selectedDispute) return;

    try {
      const response = await fetch(`/api/contracts/${contractId}/disputes/${selectedDispute.id}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          response_type: 'comment',
          content: newResponse
        }),
      });

      if (response.ok) {
        setNewResponse('');
        toast({
          title: "Success",
          description: "Response added successfully",
        });
        // Refetch disputes to capture any status changes (responses will refresh via useEffect)
        await fetchDisputeData();
      } else {
        const errorText = await response.text();
        console.error('Response error:', errorText);
        throw new Error('Failed to add response');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add response",
        variant: "destructive",
      });
    }
  };

  const handleResolveDispute = async (disputeId: string, resolution: string) => {
    try {
      const response = await fetch(`/api/contracts/${contractId}/disputes/${disputeId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resolution }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Dispute resolved successfully",
        });
        fetchDisputeData();
        window.location.reload();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to resolve dispute');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to resolve dispute",
        variant: "destructive",
      });
    }
  };

  const handleEscalateDispute = async (disputeId: string) => {
    try {
      const response = await fetch(`/api/contracts/${contractId}/disputes/${disputeId}/escalate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Dispute escalated to Pactify support team",
        });
        fetchDisputeData();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to escalate dispute');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to escalate dispute",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <ClockIcon className="h-6 w-6 animate-spin mr-2" />
            <span>Loading dispute information...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <GavelIcon className="h-6 w-6" />
            Dispute Resolution
          </h2>
          <p className="text-muted-foreground">Manage and resolve contract disputes</p>
        </div>
        {disputes.length === 0 && (
          <Button onClick={() => setActiveTab('create')}>
            <AlertTriangleIcon className="h-4 w-4 mr-2" />
            Raise Dispute
          </Button>
        )}
      </div>

      {/* Dispute Alert */}
      {disputes.some(d => ['open', 'in_progress'].includes(d.status)) && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangleIcon className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-destructive mb-1">Active Dispute</p>
              <p className="text-destructive/80">
                This contract has an active dispute that needs to be resolved before proceeding.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab as any}>
        <TabsList>
          <TabsTrigger value="overview">
            Overview ({disputes.length})
          </TabsTrigger>
          <TabsTrigger value="create">
            Raise Dispute
          </TabsTrigger>
          {selectedDispute && (
            <TabsTrigger value="responses">
              Discussion ({disputeResponses.length})
            </TabsTrigger>
          )}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          {disputes.length === 0 ? (
            <Card>
              <CardContent className="p-8">
                <div className="text-center">
                  <ScaleIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No Disputes</h3>
                  <p className="text-muted-foreground mb-4">
                    This contract has no disputes. If you encounter issues, you can raise a dispute.
                  </p>
                  <Button onClick={() => setActiveTab('create')}>
                    <AlertTriangleIcon className="h-4 w-4 mr-2" />
                    Raise Dispute
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Dispute List */}
              <Card>
                <CardHeader>
                  <CardTitle>Contract Disputes</CardTitle>
                  <CardDescription>All disputes for this contract</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {disputes.map((dispute) => (
                      <div
                        key={dispute.id}
                        className={cn(
                          "p-4 border rounded-lg cursor-pointer transition-all duration-200",
                          selectedDispute?.id === dispute.id
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border hover:border-primary/50 hover:shadow-sm hover:bg-muted/30"
                        )}
                        onClick={() => setSelectedDispute(dispute)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn(STATUS_COLORS[dispute.status])}>
                              {dispute.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(dispute.created_at)}
                          </span>
                        </div>
                        
                        <h4 className="font-medium mb-1">
                          {DISPUTE_TYPES.find(t => t.value === dispute.dispute_type)?.label}
                        </h4>
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {dispute.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Initiated by: {dispute.initiated_by_email}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Dispute Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Dispute Details</CardTitle>
                  <CardDescription>
                    {selectedDispute ? DISPUTE_TYPES.find(t => t.value === selectedDispute.dispute_type)?.label : "Select a dispute to view details"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedDispute ? (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Description</h4>
                        <p className="text-sm">{selectedDispute.description}</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium mb-1">Type</h4>
                        <p className="text-sm">{DISPUTE_TYPES.find(t => t.value === selectedDispute.dispute_type)?.label}</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium mb-1">Status</h4>
                        <Badge variant="outline" className={cn(STATUS_COLORS[selectedDispute.status])}>
                          {selectedDispute.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      
                      {selectedDispute.resolution && (
                        <div>
                          <h4 className="font-medium mb-2 text-green-600">Resolution</h4>
                          <p className="text-sm">{selectedDispute.resolution}</p>
                          {selectedDispute.resolved_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Resolved on {formatDate(selectedDispute.resolved_at)}
                            </p>
                          )}
                        </div>
                      )}
                      
                      {selectedDispute.status !== 'resolved' && (
                        <div className="pt-4 border-t space-y-3">
                          <h4 className="font-medium">Actions</h4>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => setActiveTab('responses')}
                            >
                              <MessageSquareIcon className="h-3 w-3 mr-1" />
                              Discuss
                            </Button>
                            {selectedDispute.initiated_by === userId && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const resolution = prompt("Enter resolution details:");
                                  if (resolution) {
                                    handleResolveDispute(selectedDispute.id, resolution);
                                  }
                                }}
                              >
                                <CheckCircleIcon className="h-3 w-3 mr-1" />
                                Resolve
                              </Button>
                            )}
                            {selectedDispute.status !== 'escalated' && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  if (confirm("Are you sure you want to escalate this dispute to Pactify support? This will flag the issue for our team to review and potentially intervene.")) {
                                    handleEscalateDispute(selectedDispute.id);
                                  }
                                }}
                              >
                                <AlertTriangleIcon className="h-3 w-3 mr-1" />
                                Request Support
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <GavelIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Select a dispute to view details</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Create Dispute Tab */}
        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>Raise a Dispute</CardTitle>
              <CardDescription>
                Describe the issue you're experiencing with this contract
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircleIcon className="h-5 w-5 text-amber-700 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-800 dark:text-amber-300 mb-1">Before Raising a Dispute</p>
                      <p className="text-amber-700 dark:text-amber-400">
                        Try to resolve the issue through direct communication first. 
                        Disputes should be used when communication has failed to resolve the problem.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="dispute-type">Dispute Type</Label>
                    <select
                      id="dispute-type"
                      className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={newDispute.type}
                      onChange={(e) => setNewDispute(prev => ({ ...prev, type: e.target.value as any }))}
                    >
                      {DISPUTE_TYPES.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="dispute-description">Detailed Description</Label>
                    <Textarea
                      id="dispute-description"
                      placeholder="Provide a detailed explanation of the issue, including timeline, expectations vs reality, and any attempts at resolution..."
                      className="min-h-[120px]"
                      value={newDispute.description}
                      onChange={(e) => setNewDispute(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                </div>

                <Button 
                  onClick={handleCreateDispute}
                  disabled={!newDispute.description.trim()}
                  className="w-full"
                >
                  <AlertTriangleIcon className="h-4 w-4 mr-2" />
                  Create Dispute
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Responses Tab */}
        {selectedDispute && (
          <TabsContent value="responses">
            <Card>
              <CardHeader>
                <CardTitle>Dispute Discussion</CardTitle>
                <CardDescription>
                  Communicate with the other party to resolve: {selectedDispute.title}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Add Response */}
                  <div className="space-y-3">
                    <h4 className="font-medium">Add Response</h4>
                    <Textarea
                      placeholder="Provide additional information, propose a solution, or respond to the dispute..."
                      value={newResponse}
                      onChange={(e) => setNewResponse(e.target.value)}
                      className="min-h-[100px]"
                    />
                    <Button onClick={handleAddResponse} disabled={!newResponse.trim()}>
                      <MessageSquareIcon className="h-4 w-4 mr-2" />
                      Add Response
                    </Button>
                  </div>

                  {/* Responses List */}
                  <div className="space-y-4 pt-4 border-t">
                    {disputeResponses.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <MessageSquareIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No responses yet</p>
                        <p className="text-sm">Start the discussion by adding a response</p>
                      </div>
                    ) : (
                      disputeResponses.map((response) => (
                        <div key={response.id} className="flex gap-3 p-4 border rounded-lg bg-card hover:bg-muted/30 transition-colors">
                          <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium flex-shrink-0">
                            {response.responder_email[0].toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{response.responder_email}</span>
                              <Badge variant="secondary" className="text-xs">
                                {response.response_type}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(response.created_at)}
                              </span>
                            </div>
                            <p className="text-sm">{response.content}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}