"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PlusIcon, SearchIcon, UserIcon, MailIcon, CalendarIcon, FileTextIcon, ChevronDownIcon, MessageSquareIcon, ExternalLinkIcon } from "lucide-react";
import { ContractChat } from "@/components/dashboard/contract-chat";

interface ContractInfo {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  total_amount?: number;
  currency?: string;
}

interface Client {
  id: string;
  email: string;
  name?: string;
  company?: string;
  lastActivity?: string;
  contractCount: number;
  contracts: ContractInfo[];
}

interface ClientsListClientProps {
  initialClients: Client[];
}

export function ClientsListClient({ initialClients }: ClientsListClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedContract, setSelectedContract] = useState<ContractInfo | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const formatCurrency = (amount?: number, currency?: string) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD'
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'signed':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'disputed':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleChatOpen = (contract: ContractInfo, client: Client) => {
    setSelectedContract(contract);
    setSelectedClient(client);
    setIsChatOpen(true);
  };

  const handleChatClose = () => {
    setIsChatOpen(false);
    setSelectedContract(null);
    setSelectedClient(null);
  };

  const filteredClients = initialClients.filter(client => 
    client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (client.name?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
    (client.company?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <CardTitle>Your Clients</CardTitle>
          <div className="relative w-64">
            <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <CardDescription>Clients you've worked with or sent contracts to.</CardDescription>
      </CardHeader>
      <CardContent>
        {filteredClients.length > 0 ? (
          <div className="space-y-4">
            {filteredClients.map((client) => (
              <div key={client.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary-500 flex items-center justify-center text-white font-medium">
                    {(client.name || client.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">
                        {client.name || client.email.split('@')[0]}
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {client.contractCount} contract{client.contractCount !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MailIcon className="h-3 w-3" />
                        <span>{client.email}</span>
                      </div>
                      {client.lastActivity && (
                        <div className="flex items-center gap-1">
                          <CalendarIcon className="h-3 w-3" />
                          <span>Last activity: {new Date(client.lastActivity).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <FileTextIcon className="h-3 w-3 mr-1" />
                        View Contracts
                        <ChevronDownIcon className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                      <div className="px-2 py-1.5 text-sm font-medium text-muted-foreground">
                        Contracts with {client.name || client.email.split('@')[0]}
                      </div>
                      <DropdownMenuSeparator />
                      {client.contracts.map((contract) => (
                        <DropdownMenuItem key={contract.id} asChild>
                          <Link 
                            href={`/dashboard/contracts/${contract.id}`}
                            className="flex items-start justify-between p-2 cursor-pointer"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium truncate">{contract.title}</span>
                                <span className={`px-1.5 py-0.5 text-xs rounded-full ${getStatusColor(contract.status)}`}>
                                  {contract.status}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatCurrency(contract.total_amount, contract.currency)} • 
                                {new Date(contract.created_at).toLocaleDateString()}
                              </div>
                            </div>
                            <ExternalLinkIcon className="h-3 w-3 text-muted-foreground ml-2 flex-shrink-0" />
                          </Link>
                        </DropdownMenuItem>
                      ))}
                      {client.contracts.length === 0 && (
                        <DropdownMenuItem disabled>
                          <span className="text-muted-foreground">No contracts found</span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <MessageSquareIcon className="h-3 w-3 mr-1" />
                        Contact
                        <ChevronDownIcon className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <div className="px-2 py-1.5 text-sm font-medium text-muted-foreground">
                        Choose contract to discuss
                      </div>
                      <DropdownMenuSeparator />
                      {client.contracts.map((contract) => (
                        <DropdownMenuItem 
                          key={contract.id}
                          onClick={() => handleChatOpen(contract, client)}
                          className="flex items-start justify-between p-2 cursor-pointer"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium truncate">{contract.title}</span>
                              <span className={`px-1.5 py-0.5 text-xs rounded-full ${getStatusColor(contract.status)}`}>
                                {contract.status}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Chat about this contract
                            </div>
                          </div>
                          <MessageSquareIcon className="h-3 w-3 text-muted-foreground ml-2 flex-shrink-0" />
                        </DropdownMenuItem>
                      ))}
                      {client.contracts.length === 0 && (
                        <DropdownMenuItem disabled>
                          <span className="text-muted-foreground">No contracts to discuss</span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="bg-muted/30 p-4 rounded-full mb-4">
              <UserIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">
              {searchTerm ? "No clients found" : "No clients yet"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              {searchTerm 
                ? "No clients match your search criteria. Try adjusting your search term."
                : "You haven't worked with any clients yet. Create your first contract to start building your client list."
              }
            </p>
            {!searchTerm && (
              <Button disabled>
                <PlusIcon className="mr-2 h-4 w-4" />
                Add Client (Coming Soon)
              </Button>
            )}
          </div>
        )}
      </CardContent>

      {/* Contract Chat Modal */}
      {selectedContract && selectedClient && (
        <ContractChat
          contract={selectedContract}
          clientEmail={selectedClient.email}
          clientName={selectedClient.name}
          isOpen={isChatOpen}
          onClose={handleChatClose}
        />
      )}
    </Card>
  );
}