"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  PackageIcon, 
  UploadIcon, 
  DownloadIcon,
  FileTextIcon,
  ImageIcon,
  FileArchiveIcon,
  LinkIcon,
  MessageSquareIcon,
  EyeIcon,
  PlusIcon,
  CheckIcon,
  XIcon,
  ClockIcon,
  RefreshCwIcon,
  ExternalLinkIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Deliverable {
  id: string;
  contract_id: string;
  version: number;
  title: string;
  description?: string;
  deliverable_type: 'file' | 'link' | 'text';
  file_url?: string;
  file_name?: string;
  file_size?: number;
  link_url?: string;
  text_content?: string;
  submitted_by: string;
  submitted_by_email: string;
  submitted_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'revision_requested';
  client_feedback?: string;
  feedback_at?: string;
  is_latest_version: boolean;
}

interface DeliverableComment {
  id: string;
  deliverable_id: string;
  commenter_id: string;
  commenter_email: string;
  comment: string;
  created_at: string;
}

interface ContractDeliverablesProps {
  contractId: string;
  userId: string;
  userRole: 'client' | 'freelancer';
  contractStatus: string;
}

const DELIVERABLE_TYPES = [
  { 
    value: 'file', 
    label: 'File Upload', 
    icon: UploadIcon,
    description: 'Upload documents, images, zip files, etc.'
  },
  { 
    value: 'link', 
    label: 'External Link', 
    icon: LinkIcon,
    description: 'Provide a link to external deliverable'
  },
  { 
    value: 'text', 
    label: 'Text Content', 
    icon: FileTextIcon,
    description: 'Submit text-based deliverable'
  }
];

const STATUS_COLORS = {
  pending: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30 hover:bg-yellow-500/20 dark:text-yellow-400',
  approved: 'bg-green-500/10 text-green-700 border-green-500/30 hover:bg-green-500/20 dark:text-green-400',
  rejected: 'bg-red-500/10 text-red-700 border-red-500/30 hover:bg-red-500/20 dark:text-red-400',
  revision_requested: 'bg-orange-500/10 text-orange-700 border-orange-500/30 hover:bg-orange-500/20 dark:text-orange-400'
};

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

const getFileIcon = (fileName?: string) => {
  if (!fileName) return FileTextIcon;
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  switch (ext) {
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg':
      return ImageIcon;
    case 'zip':
    case 'rar':
    case '7z':
      return FileArchiveIcon;
    default:
      return FileTextIcon;
  }
};

const formatStatusText = (status: string) => {
  return status
    .replace('_', ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export default function ContractDeliverables({
  contractId,
  userId,
  userRole,
  contractStatus
}: ContractDeliverablesProps) {
  const { toast } = useToast();
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [selectedDeliverable, setSelectedDeliverable] = useState<Deliverable | null>(null);
  const [comments, setComments] = useState<DeliverableComment[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New deliverable form
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [newDeliverable, setNewDeliverable] = useState({
    title: '',
    description: '',
    type: 'file' as 'file' | 'link' | 'text',
    linkUrl: '',
    textContent: ''
  });
  const [uploading, setUploading] = useState(false);
  
  // Feedback form
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackDeliverable, setFeedbackDeliverable] = useState<Deliverable | null>(null);
  const [feedback, setFeedback] = useState('');
  const [feedbackAction, setFeedbackAction] = useState<'approve' | 'reject' | 'revision'>('approve');
  
  // Comments
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    fetchDeliverables();
  }, [contractId]);

  useEffect(() => {
    if (selectedDeliverable) {
      fetchComments(selectedDeliverable.id);
    } else {
      setComments([]);
    }
  }, [selectedDeliverable]);

  const fetchDeliverables = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/contracts/${contractId}/deliverables`);
      if (response.ok) {
        const data = await response.json();
        setDeliverables(data.deliverables || []);
      } else {
        console.error('Failed to fetch deliverables');
      }
    } catch (error) {
      console.error('Error fetching deliverables:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async (deliverableId: string) => {
    try {
      const response = await fetch(`/api/contracts/${contractId}/deliverables/${deliverableId}/comments`);
      if (response.ok) {
        const data = await response.json();
        setComments(data.comments || []);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const handleSubmitDeliverable = async () => {
    if (!newDeliverable.title.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a title for the deliverable",
        variant: "destructive",
      });
      return;
    }

    if (newDeliverable.type === 'link' && !newDeliverable.linkUrl.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a valid URL",
        variant: "destructive",
      });
      return;
    }

    if (newDeliverable.type === 'text' && !newDeliverable.textContent.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide text content",
        variant: "destructive",
      });
      return;
    }

    try {
      setUploading(true);
      const response = await fetch(`/api/contracts/${contractId}/deliverables`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newDeliverable.title,
          description: newDeliverable.description,
          deliverable_type: newDeliverable.type,
          link_url: newDeliverable.type === 'link' ? newDeliverable.linkUrl : undefined,
          text_content: newDeliverable.type === 'text' ? newDeliverable.textContent : undefined,
        }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Deliverable submitted successfully",
        });
        setShowSubmitModal(false);
        setNewDeliverable({
          title: '',
          description: '',
          type: 'file',
          linkUrl: '',
          textContent: ''
        });
        fetchDeliverables();
      } else {
        throw new Error('Failed to submit deliverable');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit deliverable",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleProvideFeedback = async () => {
    if (feedbackAction !== 'approve' && !feedback.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide feedback",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`/api/contracts/${contractId}/deliverables/${feedbackDeliverable?.id}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: feedbackAction,
          feedback: feedback
        }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Feedback submitted successfully",
        });
        setShowFeedbackModal(false);
        setFeedbackDeliverable(null);
        setFeedback('');
        setFeedbackAction('approve');
        fetchDeliverables();
      } else {
        throw new Error('Failed to submit feedback');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit feedback",
        variant: "destructive",
      });
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedDeliverable) return;

    try {
      const response = await fetch(`/api/contracts/${contractId}/deliverables/${selectedDeliverable.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment: newComment
        }),
      });

      if (response.ok) {
        setNewComment('');
        fetchComments(selectedDeliverable.id);
        toast({
          title: "Success",
          description: "Comment added successfully",
        });
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

  // Group deliverables by title to show versions
  const groupedDeliverables = deliverables.reduce((acc, deliverable) => {
    if (!acc[deliverable.title]) {
      acc[deliverable.title] = [];
    }
    acc[deliverable.title].push(deliverable);
    return acc;
  }, {} as Record<string, Deliverable[]>);

  // Sort versions by version number (desc)
  Object.keys(groupedDeliverables).forEach(title => {
    groupedDeliverables[title].sort((a, b) => b.version - a.version);
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCwIcon className="h-6 w-6 animate-spin mr-2" />
            <span>Loading deliverables...</span>
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
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <PackageIcon className="h-5 w-5" />
            Deliverables
          </h3>
          <p className="text-sm text-muted-foreground">
            Submit and review project deliverables
          </p>
        </div>
        {userRole === 'freelancer' && ['active', 'pending_delivery', 'in_review'].includes(contractStatus) && (
          <Button onClick={() => setShowSubmitModal(true)}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Submit Deliverable
          </Button>
        )}
      </div>

      {/* Deliverables List */}
      {Object.keys(groupedDeliverables).length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <div className="text-center">
              <PackageIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h4 className="text-lg font-medium mb-2">No Deliverables</h4>
              <p className="text-muted-foreground mb-4">
                {userRole === 'freelancer' 
                  ? "You haven't submitted any deliverables yet." 
                  : "No deliverables have been submitted yet."
                }
              </p>
              {userRole === 'freelancer' && ['active', 'pending_delivery', 'in_review'].includes(contractStatus) && (
                <Button onClick={() => setShowSubmitModal(true)}>
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Submit First Deliverable
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Deliverables List */}
          <div className="space-y-4">
            {Object.entries(groupedDeliverables).map(([title, versions]) => {
              const latestVersion = versions[0];
              const FileIconComponent = getFileIcon(latestVersion.file_name);
              
              return (
                <Card key={title} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <FileIconComponent className="h-8 w-8 text-primary-500 flex-shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium truncate">{title}</h4>
                            <Badge variant="outline">
                              v{latestVersion.version}
                            </Badge>
                            {versions.length > 1 && (
                              <Badge variant="secondary" className="text-xs">
                                {versions.length} versions
                              </Badge>
                            )}
                          </div>
                          
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                            {latestVersion.description || 'No description'}
                          </p>
                          
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>
                              Submitted {new Date(latestVersion.submitted_at).toLocaleDateString()}
                            </span>
                            {latestVersion.file_size && (
                              <span>{formatFileSize(latestVersion.file_size)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end gap-2">
                        <Badge 
                          variant="outline" 
                          className={cn(STATUS_COLORS[latestVersion.status])}
                        >
                          {formatStatusText(latestVersion.status)}
                        </Badge>
                        
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedDeliverable(latestVersion)}
                          >
                            <EyeIcon className="h-3 w-3" />
                          </Button>
                          
                          {userRole === 'client' && latestVersion.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setFeedbackDeliverable(latestVersion);
                                setShowFeedbackModal(true);
                              }}
                            >
                              <MessageSquareIcon className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Deliverable Details */}
          {selectedDeliverable && (
            <Card className="lg:sticky lg:top-4">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    Deliverable Details
                    <Badge variant="outline">v{selectedDeliverable.version}</Badge>
                  </CardTitle>
                  <Badge 
                    variant="outline" 
                    className={cn(STATUS_COLORS[selectedDeliverable.status])}
                  >
                    {formatStatusText(selectedDeliverable.status)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Deliverable Info */}
                <div>
                  <h4 className="font-medium mb-2">{selectedDeliverable.title}</h4>
                  {selectedDeliverable.description && (
                    <p className="text-sm text-muted-foreground mb-3">
                      {selectedDeliverable.description}
                    </p>
                  )}
                  
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <span className="capitalize">{selectedDeliverable.deliverable_type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Submitted by:</span>
                      <span>{selectedDeliverable.submitted_by_email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Submitted on:</span>
                      <span>{new Date(selectedDeliverable.submitted_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Content based on type */}
                {selectedDeliverable.deliverable_type === 'link' && selectedDeliverable.link_url && (
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <ExternalLinkIcon className="h-4 w-4" />
                      <span className="font-medium text-sm">External Link</span>
                    </div>
                    <a 
                      href={selectedDeliverable.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-sm break-all"
                    >
                      {selectedDeliverable.link_url}
                    </a>
                  </div>
                )}

                {selectedDeliverable.deliverable_type === 'text' && selectedDeliverable.text_content && (
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <FileTextIcon className="h-4 w-4" />
                      <span className="font-medium text-sm">Text Content</span>
                    </div>
                    <div className="text-sm whitespace-pre-wrap">
                      {selectedDeliverable.text_content}
                    </div>
                  </div>
                )}

                {selectedDeliverable.deliverable_type === 'file' && selectedDeliverable.file_url && (
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DownloadIcon className="h-4 w-4" />
                        <span className="font-medium text-sm">
                          {selectedDeliverable.file_name || 'Download File'}
                        </span>
                      </div>
                      <Button size="sm" variant="outline" asChild>
                        <a 
                          href={selectedDeliverable.file_url} 
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Download
                        </a>
                      </Button>
                    </div>
                    {selectedDeliverable.file_size && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Size: {formatFileSize(selectedDeliverable.file_size)}
                      </p>
                    )}
                  </div>
                )}

                {/* Client Feedback */}
                {selectedDeliverable.client_feedback && (
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquareIcon className="h-4 w-4" />
                      <span className="font-medium text-sm">Client Feedback</span>
                    </div>
                    <p className="text-sm">{selectedDeliverable.client_feedback}</p>
                    {selectedDeliverable.feedback_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(selectedDeliverable.feedback_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                )}

                {/* Comments Section */}
                <div className="border-t pt-4">
                  <h5 className="font-medium mb-3">Comments</h5>
                  
                  {/* Add Comment */}
                  <div className="space-y-2 mb-4">
                    <Textarea
                      placeholder="Add a comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      rows={3}
                    />
                    <Button size="sm" onClick={handleAddComment} disabled={!newComment.trim()}>
                      Add Comment
                    </Button>
                  </div>

                  {/* Comments List */}
                  {comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No comments yet
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {comments.map((comment) => (
                        <div key={comment.id} className="flex gap-3 p-3 bg-muted/30 rounded-lg">
                          <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium flex-shrink-0">
                            {comment.commenter_email[0].toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{comment.commenter_email}</span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(comment.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm">{comment.comment}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Submit Deliverable Modal */}
      <Dialog open={showSubmitModal} onOpenChange={setShowSubmitModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Submit Deliverable</DialogTitle>
            <DialogDescription>
              Submit your work for client review. You can submit multiple versions if revisions are needed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div>
              <Label htmlFor="deliverable-title">Title</Label>
              <Input
                id="deliverable-title"
                placeholder="e.g., Website Design Mockups, Final Report, etc."
                value={newDeliverable.title}
                onChange={(e) => setNewDeliverable(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="deliverable-description">Description (Optional)</Label>
              <Textarea
                id="deliverable-description"
                placeholder="Describe what you're delivering..."
                value={newDeliverable.description}
                onChange={(e) => setNewDeliverable(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>

            <div>
              <Label className="text-sm font-medium mb-3 block">Deliverable Type</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {DELIVERABLE_TYPES.map((type) => {
                  const IconComponent = type.icon;
                  return (
                    <div
                      key={type.value}
                      className={cn(
                        "p-4 border rounded-lg cursor-pointer transition-all duration-200",
                        newDeliverable.type === type.value
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/50 hover:shadow-sm"
                      )}
                      onClick={() => setNewDeliverable(prev => ({ ...prev, type: type.value }))}
                    >
                      <div className="flex flex-col items-center text-center">
                        <IconComponent className="h-8 w-8 mb-2" />
                        <h4 className="font-medium mb-1">{type.label}</h4>
                        <p className="text-xs text-muted-foreground">{type.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {newDeliverable.type === 'link' && (
              <div>
                <Label htmlFor="deliverable-url">URL</Label>
                <Input
                  id="deliverable-url"
                  type="url"
                  placeholder="https://example.com/your-deliverable"
                  value={newDeliverable.linkUrl}
                  onChange={(e) => setNewDeliverable(prev => ({ ...prev, linkUrl: e.target.value }))}
                />
              </div>
            )}

            {newDeliverable.type === 'text' && (
              <div>
                <Label htmlFor="deliverable-text">Content</Label>
                <Textarea
                  id="deliverable-text"
                  placeholder="Paste your text content here..."
                  value={newDeliverable.textContent}
                  onChange={(e) => setNewDeliverable(prev => ({ ...prev, textContent: e.target.value }))}
                  rows={6}
                />
              </div>
            )}

            {newDeliverable.type === 'file' && (
              <div className="p-6 border-2 border-dashed rounded-lg text-center">
                <UploadIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">
                  File upload functionality will be implemented in the next phase
                </p>
                <p className="text-xs text-muted-foreground">
                  For now, please use the link option to share files via cloud storage
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitDeliverable}
              disabled={uploading || !newDeliverable.title.trim()}
            >
              {uploading ? (
                <>
                  <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <UploadIcon className="h-4 w-4 mr-2" />
                  Submit Deliverable
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feedback Modal */}
      <Dialog open={showFeedbackModal} onOpenChange={setShowFeedbackModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Provide Feedback</DialogTitle>
            <DialogDescription>
              Review the deliverable and provide your feedback to the freelancer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-3 block">Action</Label>
              <div className="space-y-2">
                {[
                  { value: 'approve', label: 'Approve', icon: CheckIcon, color: 'text-green-600' },
                  { value: 'revision', label: 'Request Revision', icon: RefreshCwIcon, color: 'text-orange-600' },
                  { value: 'reject', label: 'Reject', icon: XIcon, color: 'text-red-600' }
                ].map((action) => {
                  const IconComponent = action.icon;
                  return (
                    <div
                      key={action.value}
                      className={cn(
                        "flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors",
                        feedbackAction === action.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/30"
                      )}
                      onClick={() => setFeedbackAction(action.value as any)}
                    >
                      <IconComponent className={cn("h-5 w-5", action.color)} />
                      <span className="font-medium">{action.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {feedbackAction !== 'approve' && (
              <div>
                <Label htmlFor="feedback-text">
                  {feedbackAction === 'revision' ? 'Revision Instructions' : 'Rejection Reason'}
                </Label>
                <Textarea
                  id="feedback-text"
                  placeholder={
                    feedbackAction === 'revision' 
                      ? "Please explain what needs to be revised..."
                      : "Please explain why this deliverable is being rejected..."
                  }
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={4}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFeedbackModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleProvideFeedback}>
              Submit Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}