"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  CalendarIcon,
  ClockIcon,
  ExternalLinkIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  PlayCircleIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Contract {
  id: string;
  title: string;
  status: string;
  total_amount: number;
  currency: string;
  client_email?: string;
  freelancer_email?: string;
  created_at: string;
  updated_at: string;
  end_date?: string;
  completion_date?: string;
  progress_percentage: number;
  contract_milestones?: any[];
  deliverables?: any[];
}

interface ContractProgressListProps {
  contracts: Contract[];
  userType: string;
  title?: string;
  filter?: 'all' | 'active' | 'completed' | 'overdue';
  limit?: number;
}

const STATUS_CONFIG = {
  draft: { 
    label: 'Draft', 
    color: 'bg-gray-100 text-gray-700 border-gray-200', 
    icon: PlayCircleIcon,
    priority: 'low' 
  },
  pending_signatures: { 
    label: 'Pending Signatures', 
    color: 'bg-yellow-100 text-yellow-700 border-yellow-200', 
    icon: AlertCircleIcon,
    priority: 'medium' 
  },
  pending_funding: { 
    label: 'Pending Funding', 
    color: 'bg-blue-100 text-blue-700 border-blue-200', 
    icon: AlertCircleIcon,
    priority: 'high' 
  },
  active: { 
    label: 'Active', 
    color: 'bg-green-100 text-green-700 border-green-200', 
    icon: PlayCircleIcon,
    priority: 'high' 
  },
  pending_delivery: { 
    label: 'Pending Delivery', 
    color: 'bg-orange-100 text-orange-700 border-orange-200', 
    icon: ClockIcon,
    priority: 'high' 
  },
  in_review: { 
    label: 'In Review', 
    color: 'bg-purple-100 text-purple-700 border-purple-200', 
    icon: ClockIcon,
    priority: 'medium' 
  },
  revision_requested: { 
    label: 'Revision Requested', 
    color: 'bg-red-100 text-red-700 border-red-200', 
    icon: AlertCircleIcon,
    priority: 'high' 
  },
  pending_completion: { 
    label: 'Pending Completion', 
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200', 
    icon: ClockIcon,
    priority: 'medium' 
  },
  completed: { 
    label: 'Completed', 
    color: 'bg-green-100 text-green-700 border-green-200', 
    icon: CheckCircleIcon,
    priority: 'low' 
  },
  cancelled: { 
    label: 'Cancelled', 
    color: 'bg-gray-100 text-gray-600 border-gray-200', 
    icon: AlertCircleIcon,
    priority: 'low' 
  },
  disputed: { 
    label: 'Disputed', 
    color: 'bg-red-100 text-red-700 border-red-200', 
    icon: AlertCircleIcon,
    priority: 'high' 
  }
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
    year: 'numeric'
  });
};

const calculateDaysRemaining = (endDate: string) => {
  const today = new Date();
  const end = new Date(endDate);
  const diffTime = end.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getProgressColor = (percentage: number, status: string) => {
  if (status === 'completed') return 'bg-green-500';
  if (status === 'cancelled' || status === 'disputed') return 'bg-red-500';
  if (percentage >= 80) return 'bg-green-500';
  if (percentage >= 60) return 'bg-blue-500';
  if (percentage >= 40) return 'bg-yellow-500';
  return 'bg-gray-300';
};

export function ContractProgressList({ 
  contracts, 
  userType, 
  title = "Contract Progress",
  filter = 'all',
  limit
}: ContractProgressListProps) {
  let filteredContracts = contracts;

  // Apply filters
  switch (filter) {
    case 'active':
      filteredContracts = contracts.filter(c => 
        ['active', 'pending_delivery', 'in_review', 'pending_completion', 'revision_requested'].includes(c.status)
      );
      break;
    case 'completed':
      filteredContracts = contracts.filter(c => c.status === 'completed');
      break;
    case 'overdue':
      filteredContracts = contracts.filter(c => 
        c.end_date && 
        new Date(c.end_date) < new Date() && 
        c.status !== 'completed' && 
        c.status !== 'cancelled'
      );
      break;
  }

  // Sort by priority and update date
  filteredContracts = filteredContracts.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    const aStatusPriority = STATUS_CONFIG[a.status as keyof typeof STATUS_CONFIG]?.priority || 'low';
    const bStatusPriority = STATUS_CONFIG[b.status as keyof typeof STATUS_CONFIG]?.priority || 'low';
    const aPriority = priorityOrder[aStatusPriority as keyof typeof priorityOrder];
    const bPriority = priorityOrder[bStatusPriority as keyof typeof priorityOrder];
    
    if (aPriority !== bPriority) return bPriority - aPriority;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  // Apply limit
  if (limit) {
    filteredContracts = filteredContracts.slice(0, limit);
  }

  if (filteredContracts.length === 0) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center text-muted-foreground">
            <CheckCircleIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No contracts found</p>
            <p className="text-sm">
              {filter === 'active' && "No active contracts at the moment"}
              {filter === 'completed' && "No completed contracts yet"}
              {filter === 'overdue' && "No overdue contracts - great job!"}
              {filter === 'all' && "No contracts available"}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          <Badge variant="secondary">
            {filteredContracts.length} {filteredContracts.length === 1 ? 'contract' : 'contracts'}
          </Badge>
        </CardTitle>
        <CardDescription>
          Track progress and status of your {filter === 'all' ? '' : filter} contracts
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {filteredContracts.map((contract) => {
            const statusConfig = STATUS_CONFIG[contract.status as keyof typeof STATUS_CONFIG];
            const StatusIcon = statusConfig?.icon || PlayCircleIcon;
            const daysRemaining = contract.end_date ? calculateDaysRemaining(contract.end_date) : null;
            const isOverdue = daysRemaining !== null && daysRemaining < 0 && contract.status !== 'completed';
            
            const completedMilestones = contract.contract_milestones?.filter(m => m.status === 'completed').length || 0;
            const totalMilestones = contract.contract_milestones?.length || 0;
            
            const completedDeliverables = contract.deliverables?.filter(d => d.status === 'completed').length || 0;
            const totalDeliverables = contract.deliverables?.length || 0;

            return (
              <div key={contract.id} className="p-4 border rounded-lg transition-all hover:shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <h4 className="font-medium truncate">{contract.title}</h4>
                      {isOverdue && (
                        <AlertCircleIcon className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>
                        {userType === 'client' ? 'Freelancer' : 'Client'}: {' '}
                        {userType === 'client' 
                          ? contract.freelancer_email?.split('@')[0] || 'Unknown' 
                          : contract.client_email?.split('@')[0] || 'Unknown'}
                      </span>
                      {contract.end_date && (
                        <>
                          <span>•</span>
                          <CalendarIcon className="h-3 w-3" />
                          <span>Due {formatDate(contract.end_date)}</span>
                          {isOverdue && (
                            <Badge variant="destructive" className="text-xs">
                              {Math.abs(daysRemaining!)} days overdue
                            </Badge>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    <Badge className={cn("text-xs border", statusConfig?.color || '')}>
                      {statusConfig?.label || contract.status}
                    </Badge>
                    <span className="text-sm font-medium">
                      {formatCurrency(contract.total_amount, contract.currency)}
                    </span>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="space-y-2 mb-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{contract.progress_percentage.toFixed(0)}%</span>
                  </div>
                  <Progress 
                    value={contract.progress_percentage} 
                    className="h-2"
                  />
                </div>

                {/* Details and Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {totalMilestones > 0 && (
                      <span>Milestones: {completedMilestones}/{totalMilestones}</span>
                    )}
                    {totalDeliverables > 0 && (
                      <span>Deliverables: {completedDeliverables}/{totalDeliverables}</span>
                    )}
                    <span>Updated {formatDate(contract.updated_at)}</span>
                  </div>
                  
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/dashboard/contracts/${contract.id}`}>
                      <ExternalLinkIcon className="h-3 w-3 mr-1" />
                      View
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}