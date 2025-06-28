import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get('timeRange') || '30d';

    // Calculate date range
    const now = new Date();
    const startDate = new Date(now);
    const previousPeriodStart = new Date(now);
    
    switch (timeRange) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        previousPeriodStart.setDate(now.getDate() - 14);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        previousPeriodStart.setDate(now.getDate() - 60);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        previousPeriodStart.setDate(now.getDate() - 180);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        previousPeriodStart.setFullYear(now.getFullYear() - 2);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
        previousPeriodStart.setDate(now.getDate() - 60);
    }

    // Fetch all contracts for user
    const { data: contracts, error: contractsError } = await supabase
      .from('contracts')
      .select(`
        *,
        contract_milestones!inner(
          id,
          amount,
          status,
          due_date
        ),
        contract_reviews(
          rating
        ),
        escrow_payments(
          amount,
          status,
          created_at
        )
      `)
      .or(`creator_id.eq.${user.id},client_id.eq.${user.id},freelancer_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (contractsError) {
      console.error('Analytics error:', contractsError);
      return NextResponse.json(
        { error: "DATABASE_ERROR", message: "Failed to fetch contracts" },
        { status: 500 }
      );
    }

    // Fetch recent activities
    const { data: activities } = await supabase
      .from('contract_activities')
      .select(`
        *,
        contracts!inner(
          contract_number,
          title
        ),
        profiles(
          display_name
        )
      `)
      .or(`contracts.creator_id.eq.${user.id},contracts.client_id.eq.${user.id},contracts.freelancer_id.eq.${user.id}`)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    // Calculate overview metrics
    const totalContracts = contracts?.length || 0;
    const activeContracts = contracts?.filter(c => ['active', 'pending_delivery', 'in_review'].includes(c.status)).length || 0;
    const completedContracts = contracts?.filter(c => c.status === 'completed').length || 0;
    
    // Calculate revenue from escrow payments
    const totalRevenue = contracts?.reduce((sum, contract) => {
      const contractPayments = contract.escrow_payments?.filter((p: any) => p.status === 'released') || [];
      return sum + contractPayments.reduce((paymentSum: number, payment: any) => paymentSum + (payment.amount || 0), 0);
    }, 0) || 0;

    const pendingPayments = contracts?.reduce((sum, contract) => {
      const contractPayments = contract.escrow_payments?.filter((p: any) => p.status === 'funded') || [];
      return sum + contractPayments.reduce((paymentSum: number, payment: any) => paymentSum + (payment.amount || 0), 0);
    }, 0) || 0;

    const averageContractValue = totalContracts > 0 ? 
      contracts?.reduce((sum, c) => sum + (c.total_amount || 0), 0) / totalContracts : 0;

    // Calculate trends
    const currentPeriodContracts = contracts?.filter(c => 
      new Date(c.created_at) >= startDate
    ).length || 0;

    const previousPeriodContracts = contracts?.filter(c => {
      const createdAt = new Date(c.created_at);
      return createdAt >= previousPeriodStart && createdAt < startDate;
    }).length || 0;

    const currentPeriodRevenue = contracts?.filter(c => 
      new Date(c.created_at) >= startDate
    ).reduce((sum, contract) => {
      const contractPayments = contract.escrow_payments?.filter((p: any) => p.status === 'released') || [];
      return sum + contractPayments.reduce((paymentSum: number, payment: any) => paymentSum + (payment.amount || 0), 0);
    }, 0) || 0;

    const previousPeriodRevenue = contracts?.filter(c => {
      const createdAt = new Date(c.created_at);
      return createdAt >= previousPeriodStart && createdAt < startDate;
    }).reduce((sum, contract) => {
      const contractPayments = contract.escrow_payments?.filter((p: any) => p.status === 'released') || [];
      return sum + contractPayments.reduce((paymentSum: number, payment: any) => paymentSum + (payment.amount || 0), 0);
    }, 0) || 0;

    // Calculate client satisfaction (average rating)
    const allReviews = contracts?.flatMap(c => c.contract_reviews || []) || [];
    const averageRating = allReviews.length > 0 ? 
      allReviews.reduce((sum, review) => sum + (review.rating || 0), 0) / allReviews.length : 0;

    // Calculate average completion time
    const completedContractsWithDates = contracts?.filter(c => 
      c.status === 'completed' && c.created_at && c.completed_at
    ) || [];
    
    const averageCompletionTime = completedContractsWithDates.length > 0 ?
      completedContractsWithDates.reduce((sum, contract) => {
        const start = new Date(contract.created_at);
        const end = new Date(contract.completed_at!);
        const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        return sum + days;
      }, 0) / completedContractsWithDates.length : 0;

    // Calculate contract status distribution
    const statusCounts = contracts?.reduce((acc, contract) => {
      acc[contract.status] = (acc[contract.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    const contractsByStatus = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count: count as number,
      percentage: totalContracts > 0 ? ((count as number) / totalContracts) * 100 : 0,
      color: getStatusColor(status)
    }));

    // Get upcoming deadlines
    const upcomingDeadlines = contracts?.flatMap(contract => 
      contract.contract_milestones?.filter((milestone: any) => 
        milestone.due_date && 
        new Date(milestone.due_date) > now &&
        milestone.status !== 'completed'
      ).map((milestone: any) => ({
        id: milestone.id,
        contract_number: contract.contract_number || `CON-${contract.id.slice(0, 8)}`,
        title: contract.title,
        client_name: contract.client_email?.split('@')[0] || 'Unknown Client',
        due_date: milestone.due_date!,
        days_remaining: Math.ceil((new Date(milestone.due_date!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        status: milestone.status
      })) || []
    ).sort((a, b) => a.days_remaining - b.days_remaining) || [];

    // Format recent activity
    const recentActivity = activities?.map(activity => ({
      id: activity.id,
      type: activity.activity_type,
      description: activity.description || getActivityDescription(activity.activity_type),
      timestamp: activity.created_at,
      contract_number: activity.contracts?.contract_number,
      client_name: activity.profiles?.display_name
    })) || [];

    // Calculate conversion rate (mock - would need more data)
    const conversionRate = 75; // Placeholder
    const clientRetention = 65; // Placeholder

    const analyticsData = {
      overview: {
        totalContracts,
        activeContracts,
        completedContracts,
        totalRevenue,
        pendingPayments,
        averageContractValue,
        conversionRate,
        clientRetention
      },
      trends: {
        contractsThisMonth: currentPeriodContracts,
        contractsLastMonth: previousPeriodContracts,
        revenueThisMonth: currentPeriodRevenue,
        revenueLastMonth: previousPeriodRevenue,
        averageCompletionTime: Math.round(averageCompletionTime),
        clientSatisfactionScore: (averageRating / 5) * 100
      },
      contractsByStatus,
      recentActivity,
      upcomingDeadlines: upcomingDeadlines.slice(0, 10)
    };

    return NextResponse.json(analyticsData);

  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: '#94a3b8',
    pending_signatures: '#f59e0b',
    pending_funding: '#8b5cf6',
    active: '#10b981',
    pending_delivery: '#3b82f6',
    in_review: '#f97316',
    revision_requested: '#ef4444',
    pending_completion: '#06b6d4',
    completed: '#22c55e',
    cancelled: '#6b7280',
    disputed: '#dc2626'
  };
  return colors[status] || '#6b7280';
}

function getActivityDescription(activityType: string): string {
  const descriptions: Record<string, string> = {
    contract_created: 'Contract was created',
    contract_signed: 'Contract was signed',
    payment_funded: 'Payment was funded',
    milestone_submitted: 'Milestone was submitted',
    review_requested: 'Review was requested',
    payment_released: 'Payment was released',
    dispute_opened: 'Dispute was opened',
    contract_completed: 'Contract was completed',
    contract_cancelled: 'Contract was cancelled'
  };
  return descriptions[activityType] || 'Activity occurred';
}