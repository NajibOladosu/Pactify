import { createClient } from "@/utils/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusIcon, SearchIcon, UsersIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Contacts | Pactify",
  description: "Manage your clients and freelancers with Pactify",
};

export default async function ClientsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  // Fetch user profile to determine if they're a freelancer, client, or both
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const userType = profile?.user_type || user.user_metadata?.user_type || "both";
  
  // Determine the page title based on user type
  const title = userType === 'client' ? 'Freelancers' : 'Clients';
  const subtitle = userType === 'client' 
    ? 'Manage your freelancers and collaborators.'
    : 'Manage your clients and business relationships.';

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold">{title}</h1>
          <p className="text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/clients/new">
            <PlusIcon className="mr-2 h-4 w-4" />
            Add {userType === 'client' ? 'Freelancer' : 'Client'}
          </Link>
        </Button>
      </div>

      {/* Search and Filter */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name or email..." 
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Filter by:</span>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full px-3 hover:bg-accent cursor-pointer">All</Badge>
              <Badge variant="outline" className="rounded-full px-3 hover:bg-accent cursor-pointer">Active</Badge>
              <Badge variant="outline" className="rounded-full px-3 hover:bg-accent cursor-pointer">Archived</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg bg-muted/30">
        <UsersIcon className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="text-lg font-medium mb-2">No contacts yet</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-md">
          You haven't added any {userType === 'client' ? 'freelancers' : 'clients'} yet. 
          Add your first contact to start collaborating.
        </p>
        <Button asChild>
          <Link href="/dashboard/clients/new">
            <PlusIcon className="mr-2 h-4 w-4" />
            Add {userType === 'client' ? 'Freelancer' : 'Client'}
          </Link>
        </Button>
      </div>

      {/* When there are contacts, this will be shown instead */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" style={{ display: 'none' }}>
        {/* Contact card - sample */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-full bg-primary-500 flex items-center justify-center text-white font-medium text-lg flex-shrink-0">
                JD
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-lg truncate">John Doe</h3>
                <p className="text-sm text-muted-foreground truncate">john.doe@example.com</p>
                <p className="text-sm text-muted-foreground mt-1">Web Developer</p>
                
                <div className="flex gap-2 mt-4">
                  <Badge variant="outline" className="bg-primary-500/10 text-primary-500 border-primary-500/20">
                    3 Contracts
                  </Badge>
                </div>
                
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm" className="flex-1">View</Button>
                  <Button size="sm" className="flex-1">Contact</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
