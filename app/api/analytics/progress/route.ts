import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    console.log("DEBUG - Auth check:", { user: user?.id, authError });

    if (authError || !user) {
      console.log("DEBUG - Authentication failed:", authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile to determine role
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_type, display_name")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error(`[PROGRESS API] Failed to fetch user profile:`, profileError);
      return NextResponse.json({ 
        success: false, 
        error: "Failed to fetch user profile" 
      }, { status: 500 });
    }

    const userType = profile?.user_type || "both";

    // Use the same RPC function that the contracts page uses to ensure consistent data
    const { data: contractsFromRPC, error: contractsError } = await supabase
      .rpc('get_user_contracts', { 
        p_user_id: user.id,
        p_apply_free_tier_limit: false // Don't apply limits for analytics
      });

    if (contractsError) {
      console.error(`[PROGRESS API] RPC error:`, contractsError);
      return NextResponse.json({ 
        success: false, 
        error: "Failed to fetch user contracts", 
        details: contractsError.message 
      }, { status: 500 });
    }

    // Use the contract data from RPC directly since it contains all needed information
    // The RPC function already handles the complex relationships and security
    let contracts = contractsFromRPC || [];
    
    // Add empty arrays for related data that the progress calculation expects
    contracts = contracts.map(contract => ({
      ...contract,
      milestones: [], // Will be populated separately if needed
      deliverables: [], // Will be populated separately if needed
      payments: [] // Will be populated separately if needed
    }));

    console.log(`[PROGRESS API] User ${user.id} (${userType}) found ${contracts?.length || 0} contracts`);
    
    if (contractsError) {
      console.error(`[PROGRESS API] Database error:`, contractsError);
      return NextResponse.json({ 
        success: false, 
        error: "Database query failed", 
        details: contractsError.message 
      }, { status: 500 });
    }

    // Calculate comprehensive metrics
    const progressData = calculateProgressMetrics(contracts || [], userType, user.id);

    // Since contract_activities table doesn't exist, we'll skip recent activities for now
    const recentActivities: any[] = [];

    // Get upcoming deadlines
    const { data: upcomingDeadlines } = await supabase
      .from("milestones")
      .select(`
        id,
        title,
        due_date,
        status,
        amount,
        contracts!inner (
          id,
          title,
          client_id,
          freelancer_id
        )
      `)
      .gte("due_date", new Date().toISOString())
      .in("status", ["pending", "in_progress"])
      .or(`contracts.client_id.eq.${user.id},contracts.freelancer_id.eq.${user.id}`)
      .order("due_date", { ascending: true })
      .limit(20);

    return NextResponse.json({
      success: true,
      data: {
        ...progressData,
        recentActivities: recentActivities || [],
        upcomingDeadlines: upcomingDeadlines || [],
        userType
      }
    });

  } catch (error) {
    console.error("Progress API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function calculateProgressMetrics(contracts: any[], userType: string, userId: string) {
  // Basic counts
  const totalContracts = contracts.length;
  const activeContracts = contracts.filter(c => 
    ["pending_signatures", "pending_funding", "active", "pending_delivery", "in_review", "pending_completion"].includes(c.status)
  ).length;
  const completedContracts = contracts.filter(c => c.status === "completed").length;
  const cancelledContracts = contracts.filter(c => c.status === "cancelled").length;

  // Financial metrics
  const completedRevenue = contracts
    .filter(c => c.status === "completed")
    .reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0);

  const pendingRevenue = contracts
    .filter(c => ["active", "pending_delivery", "in_review", "pending_completion"].includes(c.status))
    .reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0);

  const totalRevenue = completedRevenue + pendingRevenue;

  // Calculate average contract value
  const avgContractValue = totalContracts > 0 ? totalRevenue / totalContracts : 0;

  // Progress calculations
  const contractsWithProgress = contracts.map(contract => {
    const progress = calculateContractProgress(contract);
    return { ...contract, progress_percentage: progress };
  });

  // Milestone analytics
  const allMilestones = contracts.flatMap(c => c.milestones || []);
  const totalMilestones = allMilestones.length;
  const completedMilestones = allMilestones.filter(m => m.status === "completed").length;
  const milestonesCompletionRate = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0;

  // Time-based metrics
  const completedContractsWithDates = contracts.filter(c => 
    c.status === "completed" && c.created_at && c.completed_at
  );

  let avgCompletionTime = 0;
  let onTimeDeliveryRate = 0;

  if (completedContractsWithDates.length > 0) {
    const completionTimes = completedContractsWithDates.map(c => {
      const start = new Date(c.created_at);
      const end = new Date(c.completed_at);
      return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    });

    avgCompletionTime = completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length;

    // Since there's no end_date column, we'll calculate on-time delivery as completion rate
    // In a real implementation, this would be based on deadlines vs completion dates
    const onTimeDeliveries = completedContractsWithDates.length; // Assume all completed contracts were on time for now

    onTimeDeliveryRate = (onTimeDeliveries / completedContractsWithDates.length) * 100;
  }

  // Client satisfaction (based on contract reviews/feedback)
  // This is simplified - in a real app, you'd have a reviews/ratings table
  const satisfactionScore = calculateSatisfactionScore(contracts);

  // Recent performance trends (last 30 days vs previous 30 days)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const recentContracts = contracts.filter(c => new Date(c.created_at) >= thirtyDaysAgo);
  const previousContracts = contracts.filter(c => 
    new Date(c.created_at) >= sixtyDaysAgo && new Date(c.created_at) < thirtyDaysAgo
  );

  const recentRevenue = recentContracts
    .filter(c => c.status === "completed")
    .reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0);

  const previousRevenue = previousContracts
    .filter(c => c.status === "completed")
    .reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0);

  const revenueGrowth = previousRevenue > 0 ? 
    ((recentRevenue - previousRevenue) / previousRevenue) * 100 : 
    (recentRevenue > 0 ? 100 : 0);

  // Contract distribution by status
  const statusDistribution = contracts.reduce((acc, contract) => {
    acc[contract.status] = (acc[contract.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    overview: {
      totalContracts,
      activeContracts,
      completedContracts,
      cancelledContracts,
      completionRate: totalContracts > 0 ? (completedContracts / totalContracts) * 100 : 0
    },
    financial: {
      totalRevenue,
      completedRevenue,
      pendingRevenue,
      avgContractValue,
      revenueGrowth
    },
    performance: {
      avgCompletionTime: Math.round(avgCompletionTime),
      onTimeDeliveryRate: Math.round(onTimeDeliveryRate),
      satisfactionScore,
      milestonesCompletionRate: Math.round(milestonesCompletionRate)
    },
    milestones: {
      total: totalMilestones,
      completed: completedMilestones,
      pending: allMilestones.filter(m => m.status === "pending").length,
      inProgress: allMilestones.filter(m => m.status === "in_progress").length,
      overdue: allMilestones.filter(m => 
        m.due_date && new Date(m.due_date) < new Date() && m.status !== "completed"
      ).length
    },
    trends: {
      contractsThisMonth: recentContracts.length,
      contractsLastMonth: previousContracts.length,
      contractGrowth: previousContracts.length > 0 ? 
        ((recentContracts.length - previousContracts.length) / previousContracts.length) * 100 : 
        (recentContracts.length > 0 ? 100 : 0)
    },
    contracts: contractsWithProgress,
    statusDistribution
  };
}

function calculateContractProgress(contract: any): number {
  if (contract.status === "completed") return 100;
  if (contract.status === "cancelled") return 0;

  // Base progress by status
  const statusProgress: Record<string, number> = {
    draft: 5,
    pending_signatures: 15,
    pending_funding: 25,
    active: 35,
    pending_delivery: 60,
    in_review: 80,
    revision_requested: 70,
    pending_completion: 90
  };

  let progress = statusProgress[contract.status] || 0;

  // Add milestone-based progress
  if (contract.milestones?.length > 0) {
    const completedMilestones = contract.milestones.filter((m: any) => m.status === "completed").length;
    const totalMilestones = contract.milestones.length;
    const milestoneProgress = (completedMilestones / totalMilestones) * 60; // Milestones contribute up to 60% of progress
    
    progress = Math.max(progress, 35 + milestoneProgress); // Minimum 35% for active status
  }

  // Add deliverable-based progress
  if (contract.deliverables?.length > 0) {
    const finalDeliverables = contract.deliverables.filter((d: any) => d.is_final === true).length;
    const totalDeliverables = contract.deliverables.length;
    const deliverableProgress = (finalDeliverables / totalDeliverables) * 30; // Deliverables contribute up to 30%
    
    progress += deliverableProgress;
  }

  return Math.min(Math.round(progress), 100);
}

function calculateSatisfactionScore(contracts: any[]): number {
  // Simplified satisfaction calculation
  // In a real app, this would be based on actual client reviews/ratings
  const completedContracts = contracts.filter(c => c.status === "completed");
  
  if (completedContracts.length === 0) return 0;

  // Base score calculation on contract completion success and timing
  let totalScore = 0;
  let validScores = 0;

  completedContracts.forEach(contract => {
    let score = 4.0; // Base score

    // Since there's no end_date column, we'll skip the on-time bonus
    // In a real implementation, this would compare completion_date vs deadline

    // Skip revision check since activities table doesn't exist
    // In the future, this could be based on contract status or other indicators

    // Ensure score is within 1-5 range
    score = Math.max(1.0, Math.min(5.0, score));
    
    totalScore += score;
    validScores++;
  });

  return validScores > 0 ? Math.round((totalScore / validScores) * 10) / 10 : 0;
}