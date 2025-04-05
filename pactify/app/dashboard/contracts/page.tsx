import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { EyeIcon, FileTextIcon, PlusIcon } from "lucide-react";

export const metadata = {
  title: "Contracts | Pactify",
  description: "Manage your contracts with Pactify",
};

export default function ContractsPage() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold">Contracts</h1>
          <p className="text-muted-foreground mt-1">View and manage all your contracts.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/contracts/new">
            <PlusIcon className="mr-2 h-4 w-4" />
            New Contract
          </Link>
        </Button>
      </div>

      {/* Filters - to be implemented */}
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Filter by:</span>
          <span className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-full px-3 hover:bg-accent cursor-pointer">All</Badge>
            <Badge variant="outline" className="rounded-full px-3 hover:bg-accent cursor-pointer">Draft</Badge>
            <Badge variant="outline" className="rounded-full px-3 hover:bg-accent cursor-pointer">Pending</Badge>
            <Badge variant="outline" className="rounded-full px-3 hover:bg-accent cursor-pointer">Signed</Badge>
            <Badge variant="outline" className="rounded-full px-3 hover:bg-accent cursor-pointer">Completed</Badge>
          </span>
        </div>
      </Card>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg bg-muted/30">
        <FileTextIcon className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="text-lg font-medium mb-2">No contracts yet</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-md">
          You haven't created any contracts yet. Get started by creating your first contract.
        </p>
        <Button asChild>
          <Link href="/dashboard/contracts/new">
            <PlusIcon className="mr-2 h-4 w-4" />
            Create Contract
          </Link>
        </Button>
      </div>

      {/* When there are contracts, this will be shown instead */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" style={{ display: 'none' }}>
        {/* Contract card - sample */}
        <Card className="overflow-hidden">
          <CardHeader className="p-6 pb-4">
            <div className="flex justify-between items-start mb-2">
              <Badge className="mb-2">Draft</Badge>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <EyeIcon className="h-4 w-4" />
              </Button>
            </div>
            <CardTitle className="truncate">Website Redesign Project</CardTitle>
            <CardDescription className="text-xs">Created on May 4, 2023</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Client:</span>
              <span className="font-medium truncate">Acme Corporation</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm mt-2">
              <span className="text-muted-foreground">Value:</span>
              <span className="font-medium">$5,000 USD</span>
            </div>
            <div className="border-t my-4"></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/contracts/123">View</Link>
              </Button>
              <Button size="sm">Continue</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
