"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  ExternalLinkIcon,
  AlertCircleIcon,
  CheckCircleIcon
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
  uploaded_by: string;
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
    textContent: '',
    isFinal: false
  });
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    size: number;
    type: string;
    url: string;
    path: string;
  } | null>(null);
  
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
        const text = await response.text();
        if (text) {
          const data = JSON.parse(text);
          setDeliverables(data.deliverables || []);
        } else {
          setDeliverables([]);
        }
      } else {
        console.error('Failed to fetch deliverables:', response.status, response.statusText);
        setDeliverables([]);
      }
    } catch (error) {
      console.error('Error fetching deliverables:', error);
      setDeliverables([]);
      toast({
        title: "Error",
        description: "Failed to load deliverables. Please refresh the page.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async (deliverableId: string) => {
    try {
      const response = await fetch(`/api/contracts/${contractId}/deliverables/${deliverableId}/comments`);
      if (response.ok) {
        const text = await response.text();
        if (text) {
          const data = JSON.parse(text);
          setComments(data.comments || []);
        } else {
          setComments([]);
        }
      } else {
        console.error('Failed to fetch comments:', response.status, response.statusText);
        setComments([]);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
      setComments([]);
    }
  };

  const handleFileUpload = async (file: File) => {
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setUploadedFile(data.file);
        toast({
          title: "Success",
          description: "File uploaded successfully",
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload file');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
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

    if (newDeliverable.type === 'file' && !uploadedFile) {
      toast({
        title: "Validation Error",
        description: "Please upload a file",
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
          file_url: newDeliverable.type === 'file' && uploadedFile ? uploadedFile.url : undefined,
          file_name: newDeliverable.type === 'file' && uploadedFile ? uploadedFile.name : undefined,
          file_size: newDeliverable.type === 'file' && uploadedFile ? uploadedFile.size : undefined,
          file_type: newDeliverable.type === 'file' && uploadedFile ? uploadedFile.type : undefined,
          is_final: newDeliverable.isFinal,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "Success",
          description: result.message || "Deliverable submitted successfully",
        });
        setShowSubmitModal(false);
        setNewDeliverable({
          title: '',
          description: '',
          type: 'file',
          linkUrl: '',
          textContent: '',
          isFinal: false
        });
        setUploadedFile(null);
        
        // If this was a final deliverable, refresh the entire page to update contract status
        if (newDeliverable.isFinal) {
          window.location.reload();
        } else {
          fetchDeliverables();
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit deliverable');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit deliverable",
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
      <div className="flex items-center justify-center p-6">
        <RefreshCwIcon className="h-6 w-6 animate-spin mr-2" />
        <span>Loading deliverables...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {contractStatus === 'pending_delivery' && userRole === 'freelancer' 
              ? "Submit all final deliverables to complete the project and enable payment release"
              : contractStatus === 'pending_delivery' && userRole === 'client'
              ? "Pending final deliverables from freelancer before payment can be released"
              : "Submit and review project deliverables"
            }
          </p>
        </div>
        {userRole === 'freelancer' && ['active', 'pending_delivery', 'in_review', 'pending_completion'].includes(contractStatus) && (
          <Button 
            onClick={() => setShowSubmitModal(true)}
            size="sm"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Submit Deliverable
          </Button>
        )}
      </div>


      {/* Deliverables List */}
      {Object.keys(groupedDeliverables).length === 0 ? (
        <div className="text-center py-8">
          <PackageIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h4 className="font-medium mb-2">No Deliverables</h4>
          <p className="text-sm text-muted-foreground mb-4">
            {userRole === 'freelancer' 
              ? "You haven't submitted any deliverables yet." 
              : "No deliverables have been submitted yet."
            }
          </p>
          {userRole === 'freelancer' && ['active', 'pending_delivery', 'in_review', 'pending_completion'].includes(contractStatus) && (
            <Button size="sm" onClick={() => setShowSubmitModal(true)}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Submit First Deliverable
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Deliverables List */}
          {Object.entries(groupedDeliverables).map(([title, versions]) => {
            const latestVersion = versions[0];
            const FileIconComponent = getFileIcon(latestVersion.file_name);
            
            return (
              <div key={title} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-start gap-3">
                  <FileIconComponent className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-sm truncate">{title}</h4>
                      <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                        v{latestVersion.version}
                      </Badge>
                      {versions.length > 1 && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                          {versions.length} versions
                        </Badge>
                      )}
                    </div>
                    
                    {latestVersion.description && (
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
                        {latestVersion.description}
                      </p>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          {new Date(latestVersion.submitted_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                        {latestVersion.file_size && latestVersion.file_size > 0 && (
                          <span>{formatFileSize(latestVersion.file_size)}</span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="outline" 
                          className={cn(STATUS_COLORS[latestVersion.status], "text-xs px-1.5 py-0.5")}
                        >
                          {formatStatusText(latestVersion.status)}
                        </Badge>
                        
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => setSelectedDeliverable(latestVersion)}
                          >
                            <EyeIcon className="h-3 w-3" />
                          </Button>
                          
                          {userRole === 'client' && latestVersion.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
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
                    </div>
                  </div>
                </div>
            );
          })}
        </div>
      )}

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
                  <span>{new Date(selectedDeliverable.submitted_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}</span>
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
                    {new Date(selectedDeliverable.feedback_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
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
                            {new Date(comment.created_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
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
              <Label htmlFor="deliverable-title">Title *</Label>
              <Input
                id="deliverable-title"
                placeholder="e.g., Website Design Mockups, Final Report, etc."
                value={newDeliverable.title}
                onChange={(e) => setNewDeliverable(prev => ({ ...prev, title: e.target.value }))}
                autoComplete="off"
                autoFocus
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
                      onClick={() => setNewDeliverable(prev => ({ ...prev, type: type.value as "file" | "link" | "text" }))}
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
                <Label htmlFor="deliverable-url">URL *</Label>
                <Input
                  id="deliverable-url"
                  type="url"
                  placeholder="https://example.com/your-deliverable"
                  value={newDeliverable.linkUrl}
                  onChange={(e) => setNewDeliverable(prev => ({ ...prev, linkUrl: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Provide a link to your deliverable (Google Drive, GitHub, etc.)
                </p>
              </div>
            )}

            {newDeliverable.type === 'text' && (
              <div>
                <Label htmlFor="deliverable-text">Content *</Label>
                <Textarea
                  id="deliverable-text"
                  placeholder="Paste your text content here..."
                  value={newDeliverable.textContent}
                  onChange={(e) => setNewDeliverable(prev => ({ ...prev, textContent: e.target.value }))}
                  rows={6}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter the text content of your deliverable
                </p>
              </div>
            )}

            {newDeliverable.type === 'file' && (
              <div className="space-y-4">
                <Label className="text-sm font-medium">File Upload *</Label>
                {!uploadedFile ? (
                  <div className="p-6 border-2 border-dashed rounded-lg text-center hover:border-primary/50 transition-colors">
                    <UploadIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-4">
                      Click to upload or drag and drop your file
                    </p>
                    <input
                      type="file"
                      id="file-upload"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleFileUpload(file);
                        }
                      }}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.jpg,.jpeg,.png,.gif,.webp,.svg"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('file-upload')?.click()}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <>
                          <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <UploadIcon className="h-4 w-4 mr-2" />
                          Choose File
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Supported: Images, PDF, Office docs, text files, archives (max 10MB)
                    </p>
                  </div>
                ) : (
                  <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-900/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CheckIcon className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-medium text-green-800 dark:text-green-200">
                            {uploadedFile.name}
                          </p>
                          <p className="text-sm text-green-600 dark:text-green-400">
                            {formatFileSize(uploadedFile.size)} • {uploadedFile.type}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setUploadedFile(null)}
                      >
                        <XIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Final deliverable checkbox - only show for pending_delivery status */}
          {contractStatus === 'pending_delivery' && userRole === 'freelancer' && (
            <div className="border rounded-lg p-4 mt-4 bg-muted/30">
              <div className="flex items-start gap-3">
                <Checkbox 
                  id="final-deliverable"
                  checked={newDeliverable.isFinal}
                  onCheckedChange={(checked) => 
                    setNewDeliverable(prev => ({ ...prev, isFinal: !!checked }))
                  }
                  className="mt-0.5"
                />
                <Label htmlFor="final-deliverable" className="cursor-pointer flex-1">
                  <span className="text-sm font-medium block">
                    Mark as final deliverable
                  </span>
                  <span className="text-xs text-muted-foreground mt-1 block">
                    Check this box if this is the final deliverable for project completion. 
                    This will automatically enable the client to release payment.
                  </span>
                </Label>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col gap-2">
            {/* Validation helper text */}
            {!newDeliverable.title.trim() && (
              <p className="text-xs text-muted-foreground text-center">
                Please enter a title for your deliverable
              </p>
            )}
            {newDeliverable.title.trim() && newDeliverable.type === 'file' && !uploadedFile && (
              <p className="text-xs text-muted-foreground text-center">
                Please upload a file
              </p>
            )}
            {newDeliverable.title.trim() && newDeliverable.type === 'link' && !newDeliverable.linkUrl.trim() && (
              <p className="text-xs text-muted-foreground text-center">
                Please enter a valid URL
              </p>
            )}
            {newDeliverable.title.trim() && newDeliverable.type === 'text' && !newDeliverable.textContent.trim() && (
              <p className="text-xs text-muted-foreground text-center">
                Please enter text content
              </p>
            )}
            
            <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => {
              setShowSubmitModal(false);
              setNewDeliverable({
                title: '',
                description: '',
                type: 'file',
                linkUrl: '',
                textContent: '',
                isFinal: false
              });
              setUploadedFile(null);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitDeliverable}
              disabled={
                uploading || 
                !newDeliverable.title.trim() ||
                (newDeliverable.type === 'file' && !uploadedFile) ||
                (newDeliverable.type === 'link' && !newDeliverable.linkUrl.trim()) ||
                (newDeliverable.type === 'text' && !newDeliverable.textContent.trim())
              }
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
            </div>
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