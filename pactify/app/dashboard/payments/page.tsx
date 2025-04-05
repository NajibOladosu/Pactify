import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, CreditCardIcon, DollarSignIcon } from "lucide-react";

export const metadata = {
  title: "Payments | Pactify",
  description: "Manage your payments and escrow with Pactify",
};

export default function PaymentsPage() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold">Payments</h1>
          <p className="text-muted-foreground mt-1">Track and manage your escrow payments.</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">Active Escrow</p>
              <div className="p-2 bg-primary-500/10 rounded-full">
                <CreditCardIcon className="h-5 w-5 text-primary-500" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-2xl font-bold">$0.00</h3>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">Pending Release</p>
              <div className="p-2 bg-warning/10 rounded-full">
                <CreditCardIcon className="h-5 w-5 text-warning" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-2xl font-bold">$0.00</h3>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">Total Received</p>
              <div className="p-2 bg-success/10 rounded-full">
                <ArrowDownIcon className="h-5 w-5 text-success" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-2xl font-bold">$0.00</h3>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">Total Sent</p>
              <div className="p-2 bg-secondary-500/10 rounded-full">
                <ArrowUpIcon className="h-5 w-5 text-secondary-500" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-2xl font-bold">$0.00</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Controls */}
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Filter by:</span>
          <span className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-full px-3 hover:bg-accent cursor-pointer">All</Badge>
            <Badge variant="outline" className="rounded-full px-3 hover:bg-accent cursor-pointer">Escrow</Badge>
            <Badge variant="outline" className="rounded-full px-3 hover:bg-accent cursor-pointer">Received</Badge>
            <Badge variant="outline" className="rounded-full px-3 hover:bg-accent cursor-pointer">Sent</Badge>
          </span>
        </div>
      </Card>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg bg-muted/30">
        <DollarSignIcon className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="text-lg font-medium mb-2">No payment history</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-md">
          You don't have any payment history yet. Payments will appear here once you start using escrow for your contracts.
        </p>
        <Button asChild>
          <Link href="/dashboard/contracts">
            View Contracts
          </Link>
        </Button>
      </div>

      {/* When there are payments, this will be shown instead */}
      <div className="border rounded-lg overflow-hidden" style={{ display: 'none' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Description</th>
                <th className="px-4 py-3 text-left font-medium">Contract</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr className="hover:bg-muted/30">
                <td className="px-4 py-3 text-left">May 4, 2023</td>
                <td className="px-4 py-3 text-left">Website Development - Milestone 1</td>
                <td className="px-4 py-3 text-left">
                  <Link href="/dashboard/contracts/123" className="text-primary-500 hover:underline">
                    Website Redesign
                  </Link>
                </td>
                <td className="px-4 py-3 text-left">
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                    Completed
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right font-medium">$2,500.00</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm">View</Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
