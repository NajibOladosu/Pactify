import { createClient } from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
import { Database } from "@/types/supabase";
import ContractEditClient from "@/components/dashboard/contract-edit-client"; // Import the client component
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

// Re-use the type definition from the detail page or define locally
export type ContractDetail = Database['public']['Tables']['contracts']['Row'] & {
  contract_templates: Pick<Database['public']['Tables']['contract_templates']['Row'], 'name'> | null;
};

export default async function ContractEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user) {
    console.error("Contract Edit Error: User not found.", getUserError);
    return redirect("/sign-in");
  }

  // Fetch the specific contract by ID, ensuring it belongs to the user
  const { data: contract, error: fetchError } = await supabase
    .from("contracts")
    .select(`
      *,
      contract_templates ( name )
    `)
    .eq("id", id)
    .eq("creator_id", user.id) // Ensure user owns the contract
    .maybeSingle();

  if (fetchError) {
    console.error(`Error fetching contract ${id} for edit:`, fetchError);
    notFound();
  }

  if (!contract) {
    notFound(); // Trigger Next.js 404 page
  }

  // Ensure only 'draft' contracts can be edited (or adjust logic as needed)
  if (contract.status !== 'draft') {
      // Redirect to the detail page if not editable
      console.warn(`Contract ${id} is not in draft status (${contract.status}) and cannot be edited.`);
      return redirect(`/dashboard/contracts/${id}`);
  }

  const contractDetail = contract as ContractDetail;

  return (
    <div className="space-y-8">
       <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <Link href={`/dashboard/contracts/${contractDetail.id}`} className="flex items-center text-sm text-muted-foreground mb-2 hover:underline">
            <ArrowLeftIcon className="h-3 w-3 mr-1" />
            Back to Contract View
          </Link>
          <h1 className="text-3xl font-serif font-bold">Edit Contract: {contractDetail.title}</h1>
           <p className="text-muted-foreground mt-1">Modify the contract details and content.</p>
        </div>
        {/* Save button will be inside the client component */}
      </div>

      {/* Pass fetched contract data to the Client Component */}
      <ContractEditClient contract={contractDetail} />
    </div>
  );
}
