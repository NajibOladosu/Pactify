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
  
  // Create service role client for better database access
  const { createClient: createServiceClient } = await import('@supabase/supabase-js');
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }


  // Get clients from contracts - extract unique client emails from user's contracts
  // Use service role client to bypass potential RLS issues
  const { data: contracts, error: contractsError } = await serviceSupabase
    .from("contracts")
    .select("id, client_email, content, created_at, updated_at, title")
    .eq("creator_id", user.id);


  if (contractsError) {
    console.error("Error fetching contracts for clients:", contractsError);
  }

  // Get all contract parties that are clients for user's contracts
  const { data: clientPartiesData } = await serviceSupabase
    .from("contract_parties")
    .select(`
      id,
      contract_id,
      user_id,
      role,
      status,
      created_at
    `)
    .eq("role", "client");

  // Filter for contracts created by current user
  let relevantClientParties: Array<{
    id: string;
    contract_id: string;
    user_id: string;
    role: string;
    status: string;
    created_at: string;
  }> = [];
  if (clientPartiesData && contracts) {
    const userContractIds = contracts.map(c => c.id);
    relevantClientParties = clientPartiesData.filter(party => 
      userContractIds.includes(party.contract_id)
    );
  }

  // Get profile data and emails for client user IDs
  const clientUserIds = relevantClientParties.map(p => p.user_id);
  let clientProfiles: Array<{ id: string; display_name: string }> = [];
  let clientEmails: Array<{ id: string; email: string }> = [];
  
  if (clientUserIds.length > 0) {
    // Get profiles
    const { data: profiles, error: profilesError } = await serviceSupabase
      .from("profiles")
      .select("id, display_name")
      .in("id", clientUserIds);
    
    if (!profilesError && profiles) {
      clientProfiles = profiles;
    }

    // Get emails using the function
    const { data: emails, error: emailsError } = await serviceSupabase
      .rpc('get_user_emails', { user_ids: clientUserIds });
    
    if (!emailsError && emails) {
      clientEmails = emails;
    }
  }

  // Process contracts to extract client information
  const clientsMap = new Map<string, Client>();
  
  // 1. Process contracts with client_email field OR content.clientEmail
  if (contracts) {
    contracts.forEach((contract) => {
      const content = contract.content as Record<string, unknown>;
      // Check both client_email column and content.clientEmail field
      const email = contract.client_email || (content?.clientEmail as string);
      
      if (email) {
        if (!clientsMap.has(email)) {
          // Extract name from contract content if available
          const clientName = (content?.clientName as string) || (content?.client_name as string);
          
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

  // 2. Process contract parties (clients from contract_parties table)
  relevantClientParties.forEach((party) => {
    // Skip if the client is the same user as the creator (doesn't make sense)
    if (party.user_id === user.id) return;
    
    // Find contract details
    const contract = contracts?.find(c => c.id === party.contract_id);
    if (!contract) return;
    
    // Find client profile and email
    const profile = clientProfiles.find(p => p.id === party.user_id);
    const emailData = clientEmails.find(e => e.id === party.user_id);
    
    if (!emailData?.email) return; // Skip if no email found
    
    const email = emailData.email;
    const clientName = profile?.display_name;
    
    if (!clientsMap.has(email)) {
      clientsMap.set(email, {
        id: email,
        email,
        name: clientName,
        company: undefined,
        lastActivity: contract.updated_at || contract.created_at,
        contractCount: 1,
      });
    } else {
      // Update existing client
      const existingClient = clientsMap.get(email)!;
      existingClient.contractCount += 1;
      
      // Update name if we have a better one from profile
      if (!existingClient.name && clientName) {
        existingClient.name = clientName;
      }
      
      // Update last activity if this contract is more recent
      const currentActivity = new Date(contract.updated_at || contract.created_at);
      const lastActivity = new Date(existingClient.lastActivity || '');
      if (currentActivity > lastActivity) {
        existingClient.lastActivity = contract.updated_at || contract.created_at;
      }
    }
  });

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
