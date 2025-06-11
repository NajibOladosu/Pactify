"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PlusIcon, SearchIcon, UserIcon, MailIcon, CalendarIcon, FileTextIcon } from "lucide-react";

interface Client {
  id: string;
  email: string;
  name?: string;
  company?: string;
  lastActivity?: string;
  contractCount: number;
}

interface ClientsListClientProps {
  initialClients: Client[];
}

export function ClientsListClient({ initialClients }: ClientsListClientProps) {
  const [searchTerm, setSearchTerm] = useState("");

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
                  <Button variant="outline" size="sm">
                    <FileTextIcon className="h-3 w-3 mr-1" />
                    View Contracts
                  </Button>
                  <Button variant="outline" size="sm">
                    Contact
                  </Button>
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
    </Card>
  );
}