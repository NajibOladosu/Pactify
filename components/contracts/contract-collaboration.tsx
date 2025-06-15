"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { 
  MessageSquareIcon, 
  EditIcon,
  CheckIcon,
  XIcon,
  ClockIcon,
  UserIcon,
  FileTextIcon,
  AlertCircleIcon,
  SendIcon,
  HistoryIcon,
  EyeIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ContractVersion {
  id: string;
  version_number: number;
  title: string;
  description: string;
  terms: string;
  total_amount: number;
  currency: string;
  proposed_by: string;
  proposed_by_email: string;
  proposed_at: string;
  status: 'pending' | 'accepted' | 'rejected' | 'superseded';
  changes_summary?: string;
  rejection_reason?: string;
}

interface CollaborationComment {
  id: string;
  content: string;
  author_id: string;
  author_email: string;
  created_at: string;
  section?: string;
  is_resolved: boolean;
  parent_comment_id?: string;
}

interface ContractCollaborationProps {
  contractId: string;
  currentUserId: string;
  userType: 'freelancer' | 'client' | 'both';
  initialContract: any;
}

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  superseded: 'bg-gray-100 text-gray-600'
};

const formatCurrency = (amount: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function ContractCollaboration({ 
  contractId, 
  currentUserId, 
  userType, 
  initialContract 
}: ContractCollaborationProps) {
  const { toast } = useToast();
  const [versions, setVersions] = useState<ContractVersion[]>([]);
  const [comments, setComments] = useState<CollaborationComment[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<ContractVersion | null>(null);
  const [newComment, setNewComment] = useState('');
  const [proposalChanges, setProposalChanges] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'versions' | 'comments' | 'propose'>('versions');

  useEffect(() => {
    fetchCollaborationData();
  }, [contractId]);

  const fetchCollaborationData = async () => {
    try {
      setLoading(true);
      
      // Fetch contract versions
      const versionsResponse = await fetch(`/api/contracts/${contractId}/versions`);
      if (versionsResponse.ok) {
        const versionsData = await versionsResponse.json();
        setVersions(versionsData.versions || []);
        if (versionsData.versions?.length > 0) {
          setSelectedVersion(versionsData.versions[0]);
        }
      }

      // Fetch collaboration comments
      const commentsResponse = await fetch(`/api/contracts/${contractId}/comments`);
      if (commentsResponse.ok) {
        const commentsData = await commentsResponse.json();
        setComments(commentsData.comments || []);
      }
    } catch (error) {
      console.error('Failed to fetch collaboration data:', error);
      toast({
        title: "Error",
        description: "Failed to load collaboration data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVersionAction = async (versionId: string, action: 'accept' | 'reject', reason?: string) => {
    try {
      const response = await fetch(`/api/contracts/${contractId}/versions/${versionId}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `Contract version ${action}ed successfully`,
        });
        fetchCollaborationData();
      } else {
        throw new Error(`Failed to ${action} version`);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${action} contract version`,
        variant: "destructive",
      });
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    try {
      const response = await fetch(`/api/contracts/${contractId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newComment,
          section: selectedVersion ? `Version ${selectedVersion.version_number}` : undefined,
        }),
      });

      if (response.ok) {
        setNewComment('');
        toast({
          title: "Success",
          description: "Comment added successfully",
        });
        fetchCollaborationData();
      } else {
        throw new Error('Failed to add comment');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive",
      });
    }
  };

  const handleProposeChanges = async () => {
    if (!proposalChanges.trim()) return;

    try {
      const response = await fetch(`/api/contracts/${contractId}/versions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          changes_summary: proposalChanges,
          // In a real implementation, this would include the actual contract changes
          title: initialContract.title,
          description: initialContract.description,
          terms: initialContract.terms,
          total_amount: initialContract.total_amount,
          currency: initialContract.currency,
        }),
      });

      if (response.ok) {
        setProposalChanges('');
        toast({
          title: "Success",
          description: "Contract changes proposed successfully",
        });
        fetchCollaborationData();
        setActiveTab('versions');
      } else {
        throw new Error('Failed to propose changes');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to propose contract changes",
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
            <span>Loading collaboration data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold">Contract Collaboration</h2>
        <p className="text-muted-foreground">Negotiate and collaborate on contract terms</p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('versions')}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === 'versions'
              ? "border-primary-500 text-primary-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <HistoryIcon className="h-4 w-4 mr-2 inline" />
          Version History ({versions.length})
        </button>
        <button
          onClick={() => setActiveTab('comments')}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === 'comments'
              ? "border-primary-500 text-primary-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <MessageSquareIcon className="h-4 w-4 mr-2 inline" />
          Comments ({comments.length})
        </button>
        <button
          onClick={() => setActiveTab('propose')}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === 'propose'
              ? "border-primary-500 text-primary-500"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <EditIcon className="h-4 w-4 mr-2 inline" />
          Propose Changes
        </button>
      </div>

      {/* Version History Tab */}
      {activeTab === 'versions' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Version List */}
          <Card>
            <CardHeader>
              <CardTitle>Contract Versions</CardTitle>
              <CardDescription>Track all proposed contract changes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {versions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileTextIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No contract versions yet</p>
                    <p className="text-sm">Propose changes to get started</p>
                  </div>
                ) : (
                  versions.map((version) => (
                    <div
                      key={version.id}
                      className={cn(
                        "p-4 border rounded-lg cursor-pointer transition-colors",
                        selectedVersion?.id === version.id
                          ? "border-primary-500 bg-primary-50"
                          : "border-border hover:border-muted-foreground"
                      )}
                      onClick={() => setSelectedVersion(version)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Version {version.version_number}</span>
                          <Badge className={cn(STATUS_COLORS[version.status])}>
                            {version.status}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(version.proposed_at)}
                        </span>
                      </div>
                      
                      <p className="text-sm text-muted-foreground mb-2">
                        Proposed by: {version.proposed_by_email}
                      </p>
                      
                      {version.changes_summary && (
                        <p className="text-sm">{version.changes_summary}</p>
                      )}
                      
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-sm font-medium">
                          {formatCurrency(version.total_amount, version.currency)}
                        </span>
                        {version.status === 'pending' && version.proposed_by !== currentUserId && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleVersionAction(version.id, 'accept');
                              }}
                            >
                              <CheckIcon className="h-3 w-3 mr-1" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleVersionAction(version.id, 'reject', 'Changes not acceptable');
                              }}
                            >
                              <XIcon className="h-3 w-3 mr-1" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Version Details */}
          <Card>
            <CardHeader>
              <CardTitle>Version Details</CardTitle>
              <CardDescription>
                {selectedVersion 
                  ? `Version ${selectedVersion.version_number} details`
                  : "Select a version to view details"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedVersion ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Contract Title</h4>
                    <p className="text-sm">{selectedVersion.title}</p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Description</h4>
                    <p className="text-sm">{selectedVersion.description}</p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Total Amount</h4>
                    <p className="text-sm">
                      {formatCurrency(selectedVersion.total_amount, selectedVersion.currency)}
                    </p>
                  </div>
                  
                  {selectedVersion.changes_summary && (
                    <div>
                      <h4 className="font-medium mb-2">Changes Summary</h4>
                      <p className="text-sm">{selectedVersion.changes_summary}</p>
                    </div>
                  )}
                  
                  {selectedVersion.rejection_reason && (
                    <div>
                      <h4 className="font-medium mb-2 text-red-600">Rejection Reason</h4>
                      <p className="text-sm text-red-600">{selectedVersion.rejection_reason}</p>
                    </div>
                  )}
                  
                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <UserIcon className="h-4 w-4" />
                      <span>Proposed by {selectedVersion.proposed_by_email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <ClockIcon className="h-4 w-4" />
                      <span>On {formatDate(selectedVersion.proposed_at)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <EyeIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a version to view details</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Comments Tab */}
      {activeTab === 'comments' && (
        <Card>
          <CardHeader>
            <CardTitle>Contract Discussion</CardTitle>
            <CardDescription>Discuss contract terms and negotiate changes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Add Comment */}
              <div className="space-y-3">
                <h4 className="font-medium">Add Comment</h4>
                <Textarea
                  placeholder="Share your thoughts about the contract terms..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="min-h-[100px]"
                />
                <Button onClick={handleAddComment} disabled={!newComment.trim()}>
                  <SendIcon className="h-4 w-4 mr-2" />
                  Add Comment
                </Button>
              </div>

              {/* Comments List */}
              <div className="space-y-4 pt-4 border-t">
                {comments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquareIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No comments yet</p>
                    <p className="text-sm">Start the discussion by adding a comment</p>
                  </div>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3 p-4 border rounded-lg">
                      <div className="h-8 w-8 bg-primary-500 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                        {comment.author_email[0].toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{comment.author_email}</span>
                          {comment.section && (
                            <Badge variant="secondary" className="text-xs">
                              {comment.section}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDate(comment.created_at)}
                          </span>
                        </div>
                        <p className="text-sm">{comment.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Propose Changes Tab */}
      {activeTab === 'propose' && (
        <Card>
          <CardHeader>
            <CardTitle>Propose Contract Changes</CardTitle>
            <CardDescription>Suggest modifications to the current contract</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircleIcon className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900 mb-1">How Contract Changes Work</p>
                    <p className="text-blue-700">
                      When you propose changes, a new version of the contract will be created. 
                      The other party can then review, accept, or reject your proposal.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Describe Your Proposed Changes</h4>
                <Textarea
                  placeholder="Describe what changes you'd like to make to the contract (e.g., adjust timeline, modify payment terms, add new requirements...)"
                  value={proposalChanges}
                  onChange={(e) => setProposalChanges(e.target.value)}
                  className="min-h-[150px]"
                />
                <p className="text-xs text-muted-foreground">
                  Be specific about what you want to change and why. This helps the other party understand your reasoning.
                </p>
              </div>

              <Button 
                onClick={handleProposeChanges} 
                disabled={!proposalChanges.trim()}
                className="w-full"
              >
                <EditIcon className="h-4 w-4 mr-2" />
                Propose Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}