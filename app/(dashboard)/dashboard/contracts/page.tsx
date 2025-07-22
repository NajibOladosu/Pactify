// Remove "use client" - this is now primarily a Server Component

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { createClient } from "@/utils/supabase/server"; // Use server client
import { redirect } from "next/navigation";
import { ContractsListClient } from "@/components/dashboard/contracts-list-client"; // Import the client component (to be created)
import { Database } from "@/types/supabase"; // Assuming you have types generated

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

  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user) {
    console.error("Contracts Page Error: User not found.", getUserError);
    return redirect("/sign-in");
  }

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
        <Button asChild>
          <Link href="/dashboard/contracts/new">
            <PlusIcon className="mr-2 h-4 w-4" />
            Create Contract
          </Link>
        </Button>
      </div>

      {/* Pass fetched contracts to the Client Component */}
      {/* This component will handle filtering, searching, display, and actions */}
      <ContractsListClient initialContracts={validContracts} />
    </div>
  );
}
