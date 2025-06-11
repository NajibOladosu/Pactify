import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { ClientsListClient } from "@/components/dashboard/clients-list-client";

interface Client {
  id: string;
  email: string;
  name?: string;
  company?: string;
  lastActivity?: string;
  contractCount: number;
}

export default async function ClientsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  // Get clients from contracts - extract unique client emails from user's contracts
  const { data: contracts, error: contractsError } = await supabase
    .from("contracts")
    .select("id, client_email, content, created_at, updated_at")
    .eq("creator_id", user.id)
    .not("client_email", "is", null);

  if (contractsError) {
    console.error("Error fetching contracts for clients:", contractsError);
  }

  // Process contracts to extract client information
  const clientsMap = new Map<string, Client>();
  
  if (contracts) {
    contracts.forEach((contract) => {
      const email = contract.client_email;
      if (email) {
        if (!clientsMap.has(email)) {
          // Extract name from contract content if available
          const content = contract.content as any;
          const clientName = content?.clientName || content?.client_name;
          
          clientsMap.set(email, {
            id: email, // Use email as ID for now
            email,
            name: clientName,
            company: undefined, // Could be extracted from content if available
            lastActivity: contract.updated_at || contract.created_at,
            contractCount: 1,
          });
        } else {
          // Update existing client
          const existingClient = clientsMap.get(email)!;
          existingClient.contractCount += 1;
          
          // Update last activity if this contract is more recent
          const currentActivity = new Date(contract.updated_at || contract.created_at);
          const lastActivity = new Date(existingClient.lastActivity || '');
          if (currentActivity > lastActivity) {
            existingClient.lastActivity = contract.updated_at || contract.created_at;
          }
        }
      }
    });
  }

  const clients = Array.from(clientsMap.values());

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage your client relationships and contracts.</p>
        </div>
        <Button disabled>
          <PlusIcon className="mr-2 h-4 w-4" />
          Add Client (Coming Soon)
        </Button>
      </div>

      {/* Pass clients to client component for display and search */}
      <ClientsListClient initialClients={clients} />
    </div>
  );
}
