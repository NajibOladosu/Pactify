// Remove "use client" - this is now primarily a Server Component

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { createClient } from "@/utils/supabase/server"; // Use server client
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { redirect } from "next/navigation";
import { ContractsListClient } from "@/components/dashboard/contracts-list-client"; // Import the client component (to be created)
import { Database } from "@/types/supabase"; // Assuming you have types generated
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Define the type for fetched contracts from get_user_contracts RPC function
export type ContractWithTemplate = {
  id: string;
  contract_id: string;
  title: string;
  description: string | null;
  total_amount: number | null;
  currency: string | null;
  status: string;
  type: string | null;
  client_id: string | null;
  freelancer_id: string | null;
  creator_id: string;
  created_at: string;
  updated_at: string;
  locked: boolean;
  milestones_count: number;
  completed_milestones: number;
  pending_amount: number;
  next_due_date: string | null;
  is_visible: boolean;
  contract_templates: { name: string } | null;
};


export default async function ContractsPage() {
  const supabase = await createClient();
  
  // Create service role client for bypassing RLS when needed
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!
  );

  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user) {
    console.error("Contracts Page Error: User not found.", getUserError);
    return redirect("/sign-in");
  }

  // --- Fetch Subscription and Contract Limit Data ---
  let planId = 'free';
  let maxContracts: number | null = 3; // Default to free plan limit
  let activeContractsCount = 0;

  // 1. Get active subscription using service role client
  const { data: subscription } = await serviceSupabase
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (subscription?.plan_id) {
    planId = subscription.plan_id;
    // 2. Get plan details using service role client
    const { data: planDetails } = await serviceSupabase
      .from('subscription_plans')
      .select('max_contracts')
      .eq('id', planId)
      .single();
    maxContracts = planDetails?.max_contracts ?? null; // Use null for unlimited
  } else {
     // Ensure we have the free plan limit if no active sub
     const { data: freePlanDetails } = await serviceSupabase
      .from('subscription_plans')
      .select('max_contracts')
      .eq('id', 'free')
      .single();
     maxContracts = freePlanDetails?.max_contracts ?? 3; // Fallback to 3 if DB fetch fails
  }

  // 3. Get active contracts count for limit checking
  const { data: dashboardStats } = await serviceSupabase.rpc('get_dashboard_stats', { p_user_id: user.id });
  activeContractsCount = dashboardStats?.[0]?.active_contracts || 0;

  // 4. Determine if limit is reached (only for plans with a limit)
  const isLimitReached = maxContracts !== null && activeContractsCount >= maxContracts;

  // Fetch contracts using security definer function with free tier filtering
  const { data: contracts, error: fetchError } = await supabase
    .rpc('get_user_contracts', { 
      p_user_id: user.id,
      p_apply_free_tier_limit: true 
    });

  let fetchedContracts: ContractWithTemplate[] = []; // Use let to allow reassignment
  if (fetchError) {
    console.error("Error fetching contracts:", fetchError);
    // Handle error display appropriately, maybe show a message on the page
    // fetchedContracts remains an empty array
  } else if (contracts) {
    const userContracts = contracts;

    // Fetch contract templates for the filtered contracts
    const contractsWithTemplates: ContractWithTemplate[] = await Promise.all(
      userContracts.map(async (contract: any) => {
        let contractTemplate = null;
        if (contract.template_id) {
          const { data: template } = await supabase
            .from("contract_templates")
            .select("name")
            .eq("id", contract.template_id)
            .single();
          
          if (template) {
            contractTemplate = template;
          }
        }
        
        return {
          ...contract,
          contract_templates: contractTemplate
        } as ContractWithTemplate;
      })
    );

    // Filter contracts to only show visible ones for free tier users
    fetchedContracts = contractsWithTemplates.filter(contract => contract.is_visible);
  }

  // Use the fetchedContracts variable
  const validContracts: ContractWithTemplate[] = fetchedContracts;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">Contracts</h1>
          <p className="text-muted-foreground mt-1">Manage your contracts and agreements.</p>
        </div>
        <TooltipProvider>
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <div className={isLimitReached ? 'cursor-not-allowed' : ''}>
                <Button asChild={!isLimitReached} disabled={isLimitReached}>
                  {isLimitReached ? (
                    <span className="inline-flex items-center">
                      <PlusIcon className="mr-2 h-4 w-4" />
                      Create Contract
                    </span>
                  ) : (
                    <Link href="/dashboard/contracts/new">
                      <PlusIcon className="mr-2 h-4 w-4" />
                      Create Contract
                    </Link>
                  )}
                </Button>
              </div>
            </TooltipTrigger>
            {isLimitReached && (
              <TooltipContent>
                <p>Upgrade to create more contracts.</p>
                <p className="text-xs text-muted-foreground">Free plan limit ({maxContracts}) reached.</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Pass fetched contracts to the Client Component */}
      {/* This component will handle filtering, searching, display, and actions */}
      <ContractsListClient 
        initialContracts={validContracts} 
        isLimitReached={isLimitReached}
        maxContracts={maxContracts}
      />
    </div>
  );
}
