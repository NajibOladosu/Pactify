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
  raised_by: string;
  raised_by_email: string;
  dispute_type: 'quality' | 'timeline' | 'payment' | 'scope' | 'other';
  status: 'open' | 'investigating' | 'mediation' | 'arbitration' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  description: string;
  evidence_urls?: string[];
  resolution?: string;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
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

const STATUS_COLORS = {
  open: 'bg-red-100 text-red-800 border-red-200',
  investigating: 'bg-orange-100 text-orange-800 border-orange-200',
  mediation: 'bg-blue-100 text-blue-800 border-blue-200',
  arbitration: 'bg-purple-100 text-purple-800 border-purple-200',
  resolved: 'bg-green-100 text-green-800 border-green-200',
  closed: 'bg-gray-100 text-gray-600 border-gray-200'
};

const PRIORITY_COLORS = {
  low: 'bg-blue-100 text-blue-600',
  medium: 'bg-yellow-100 text-yellow-600',
  high: 'bg-orange-100 text-orange-600',
  urgent: 'bg-red-100 text-red-600'
};

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
    priority: 'medium' as any,
    title: '',
    description: ''
  });
  
  // New response form state
  const [newResponse, setNewResponse] = useState('');

  useEffect(() => {
    fetchDisputeData();
  }, [contractId]);

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
          ['open', 'investigating', 'mediation', 'arbitration'].includes(d.status)
        );
        if (openDisputes?.length > 0 && !selectedDispute) {
          setSelectedDispute(openDisputes[0]);
        }
      }

      // Fetch responses for selected dispute
      if (selectedDispute) {
        const responsesResponse = await fetch(`/api/contracts/${contractId}/disputes/${selectedDispute.id}/responses`);
        if (responsesResponse.ok) {
          const responsesData = await responsesResponse.json();
          setDisputeResponses(responsesData.responses || []);
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
    if (!newDispute.title.trim() || !newDispute.description.trim()) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
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
          priority: 'medium',
          title: '',
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
        fetchDisputeData();
      } else {
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
        throw new Error('Failed to resolve dispute');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to resolve dispute",
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
      {disputes.some(d => ['open', 'investigating'].includes(d.status)) && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangleIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-red-900 mb-1">Active Dispute</p>
              <p className="text-red-700">
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
                          "p-4 border rounded-lg cursor-pointer transition-colors",
                          selectedDispute?.id === dispute.id
                            ? "border-primary-500 bg-primary-50"
                            : "border-border hover:border-muted-foreground"
                        )}
                        onClick={() => setSelectedDispute(dispute)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge className={cn(STATUS_COLORS[dispute.status])}>
                              {dispute.status.replace('_', ' ')}
                            </Badge>
                            <Badge className={cn("text-xs", PRIORITY_COLORS[dispute.priority])}>
                              {dispute.priority}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(dispute.created_at)}
                          </span>
                        </div>
                        
                        <h4 className="font-medium mb-1">{dispute.title}</h4>
                        <p className="text-sm text-muted-foreground mb-2">
                          Type: {DISPUTE_TYPES.find(t => t.value === dispute.dispute_type)?.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Raised by: {dispute.raised_by_email}
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
                    {selectedDispute ? selectedDispute.title : "Select a dispute to view details"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedDispute ? (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Description</h4>
                        <p className="text-sm">{selectedDispute.description}</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="font-medium mb-1">Type</h4>
                          <p className="text-sm">{DISPUTE_TYPES.find(t => t.value === selectedDispute.dispute_type)?.label}</p>
                        </div>
                        <div>
                          <h4 className="font-medium mb-1">Priority</h4>
                          <Badge className={cn("text-xs", PRIORITY_COLORS[selectedDispute.priority])}>
                            {selectedDispute.priority}
                          </Badge>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-medium mb-1">Status</h4>
                        <Badge className={cn(STATUS_COLORS[selectedDispute.status])}>
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
                      
                      {selectedDispute.status !== 'resolved' && selectedDispute.status !== 'closed' && (
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
                            {(userRole === 'client' || userRole === 'freelancer') && (
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
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircleIcon className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-900 mb-1">Before Raising a Dispute</p>
                      <p className="text-amber-700">
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
                    <Label htmlFor="dispute-priority">Priority</Label>
                    <select
                      id="dispute-priority"
                      className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={newDispute.priority}
                      onChange={(e) => setNewDispute(prev => ({ ...prev, priority: e.target.value as any }))}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="dispute-title">Dispute Title</Label>
                    <Input
                      id="dispute-title"
                      placeholder="Brief summary of the issue"
                      value={newDispute.title}
                      onChange={(e) => setNewDispute(prev => ({ ...prev, title: e.target.value }))}
                    />
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
                  disabled={!newDispute.title.trim() || !newDispute.description.trim()}
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
                        <div key={response.id} className="flex gap-3 p-4 border rounded-lg">
                          <div className="h-8 w-8 bg-primary-500 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
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