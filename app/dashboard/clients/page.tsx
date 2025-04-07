"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusIcon, SearchIcon, UserIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Client {
  id: string;
  email: string;
  name?: string;
  company?: string;
  lastActivity?: string;
  contractCount: number;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    // Simulate fetching clients
    const loadClients = () => {
      setTimeout(() => {
        // In a real app, this would come from an API
        setClients([]);
        setLoading(false);
      }, 500);
    };

    loadClients();
  }, []);

  const filteredClients = clients.filter(client => 
    client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (client.name?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
    (client.company?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage your client relationships and contracts.</p>
        </div>
        <Button>
          <PlusIcon className="mr-2 h-4 w-4" />
          Add Client
        </Button>
      </div>

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
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            </div>
          ) : filteredClients.length > 0 ? (
            <div className="space-y-4">
              {/* Client list would go here */}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="bg-muted/30 p-4 rounded-full mb-4">
                <UserIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No clients yet</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                You haven't added any clients yet. Add your first client to start creating contracts.
              </p>
              <Button>
                <PlusIcon className="mr-2 h-4 w-4" />
                Add Client
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
