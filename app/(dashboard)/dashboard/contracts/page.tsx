// Remove "use client" - this is now primarily a Server Component

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { createClient } from "@/utils/supabase/server"; // Use server client
import { redirect } from "next/navigation";
import { ContractsListClient } from "@/components/dashboard/contracts-list-client"; // Import the client component (to be created)
import { Database } from "@/types/supabase"; // Assuming you have types generated

// Define the type for fetched contracts based on your schema
export type ContractWithTemplate = Database['public']['Tables']['contracts']['Row'] & {
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

  // Fetch contracts from the database for the current user
  // Include contracts where user is creator OR client (by ID or email)
  const { data: contracts, error: fetchError } = await supabase
    .from("contracts")
    .select(`
      *,
      contract_templates ( name ) 
    `)
    .or(`creator_id.eq.${user.id},client_id.eq.${user.id},freelancer_id.eq.${user.id},client_email.eq.${user.email},freelancer_email.eq.${user.email}`)
    .order("created_at", { ascending: false }); // Order by creation date

  let fetchedContracts: ContractWithTemplate[] = []; // Use let to allow reassignment
  if (fetchError) {
    console.error("Error fetching contracts:", fetchError);
    // Handle error display appropriately, maybe show a message on the page
    // fetchedContracts remains an empty array
  } else {
    // Ensure contracts is an array even if fetch returns null/undefined
    fetchedContracts = Array.isArray(contracts) ? contracts : [];
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
