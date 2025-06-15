// Remove "use client" - Fetch data server-side

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react"; // Removed unused icons for now
import { createClient } from "@/utils/supabase/server"; // Use server client
import { redirect } from "next/navigation";
import { notFound } from 'next/navigation'; // Use Next.js notFound
import { Database } from "@/types/supabase"; // Import generated types
import { ContractDetailClientActions } from "@/components/dashboard/contract-detail-client-actions"; // Client component for actions
import TiptapEditor from '@/components/editor/tiptap-editor'; // Import the Tiptap editor
import DigitalSignaturePad from '@/components/contracts/digital-signature-pad';
import PaymentReleaseManager from '@/components/contracts/payment-release-manager';
import ContractCollaboration from '@/components/contracts/contract-collaboration';
import DisputeResolution from '@/components/contracts/dispute-resolution';
import RefundCancellationManager from '@/components/contracts/refund-cancellation-manager';

// Define and EXPORT the type for the fetched contract
export type ContractDetail = Database['public']['Tables']['contracts']['Row'] & {
  contract_templates: Pick<Database['public']['Tables']['contract_templates']['Row'], 'name'> | null;
  // TODO: Add contract_parties join later
  // contract_parties: Array<Database['public']['Tables']['contract_parties']['Row'] & { profiles: Pick<Database['public']['Tables']['profiles']['Row'], 'display_name' | 'email'> | null }> | null; // Example join
};

// Updated status type based on new workflow
type ContractStatus = 'draft' | 'pending_signatures' | 'pending_funding' | 'active' | 'pending_delivery' | 'in_review' | 'revision_requested' | 'pending_completion' | 'completed' | 'cancelled' | 'disputed';


// Fetch data server-side
export default async function ContractDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user) {
    console.error("Contract Detail Error: User not found.", getUserError);
    return redirect("/sign-in");
  }

  // Fetch the specific contract by ID, ensuring user has access (creator, client, or freelancer)
  const { data: contract, error: fetchError } = await supabase
    .from("contracts")
    .select(`
      *,
      contract_templates ( name )
    `)
    .eq("id", params.id)
    .or(`creator_id.eq.${user.id},client_id.eq.${user.id},freelancer_id.eq.${user.id}`)
    .maybeSingle();

  // Fetch milestones if it's a milestone contract
  const { data: milestones } = await supabase
    .from("contract_milestones")
    .select("*")
    .eq("contract_id", params.id)
    .order("order_index", { ascending: true });

  if (fetchError) {
    console.error(`Error fetching contract ${params.id}:`, fetchError);
    notFound();
  }

  if (!contract) {
    notFound(); // Trigger Next.js 404 page
  }

  // Access is already controlled by the query filter above (creator_id = user.id)
  // If we reach here, the user has proper access to view this contract


  // Cast to the specific type for easier access
  const contractDetail = contract as ContractDetail;

  // Determine user role for signature workflow
  let userRole: 'client' | 'freelancer' | 'creator' = 'creator';
  if (contractDetail.client_id === user.id) {
    userRole = 'client';
  } else if (contractDetail.freelancer_id === user.id) {
    userRole = 'freelancer';
  }

  // Default content structure if contract.content is null/invalid
  const editorContent = contractDetail.content || { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Contract content is empty or invalid." }] }] };

  // Dummy function for read-only editor - required by the component prop
  const handleContentChangeDummy = (content: any) => {
    // Do nothing in read-only mode
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-200">Draft</Badge>;
      case "pending_signatures":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-200">Pending Signatures</Badge>;
      case "pending_funding":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200">Pending Funding</Badge>;
      case "active":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">Active</Badge>;
      case "pending_delivery":
        return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-200">Pending Delivery</Badge>;
      case "in_review":
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-200">In Review</Badge>;
      case "revision_requested":
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200">Revision Requested</Badge>;
      case "pending_completion":
        return <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-200">Pending Completion</Badge>;
      case "completed":
        return <Badge variant="outline" className="bg-green-500/20 text-green-700 border-green-300">Completed</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-200">Cancelled</Badge>;
      case "disputed":
        return <Badge variant="destructive">Disputed</Badge>;
      default:
        return <Badge variant="outline">{status ?? 'Unknown'}</Badge>;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <Link href="/dashboard/contracts" className="flex items-center text-sm text-muted-foreground mb-2 hover:underline">
            <ArrowLeftIcon className="h-3 w-3 mr-1" />
            Back to contracts
          </Link>
          <h1 className="text-3xl font-serif font-bold">{contractDetail.title}</h1>
          <div className="flex items-center gap-3 mt-2">
            {getStatusBadge(contractDetail.status)}
            <span className="text-sm text-muted-foreground">
              Created on {contractDetail.created_at ? new Date(contractDetail.created_at).toLocaleDateString() : 'N/A'}
            </span>
          </div>
        </div>

        {/* Client Actions Component - This will handle action visibility based on user role/status */}
        <ContractDetailClientActions contract={contractDetail} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Contract Details Column */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contract Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
                  <p>{contractDetail.description || "No description provided."}</p>
                </div>

                <Separator />

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Payment Details</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">
                      {contractDetail.total_amount ? `${contractDetail.currency || 'USD'} ${Number(contractDetail.total_amount).toFixed(2)}` : "Not specified"}
                    </span>
                    {/* Add payment type display if needed */}
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Contract Template</h3>
                  <p>{contractDetail.contract_templates?.name ?? 'Custom Contract'}</p>
                </div>

                <Separator />

                {/* Render actual contract content using TiptapEditor */}
                <div>
                   <h3 className="text-sm font-medium text-muted-foreground mb-2">Contract Content</h3>
                   {/* Use the TiptapEditor component in read-only mode */}
                    <TiptapEditor
                     initialContent={editorContent}
                     // No onContentChange needed for read-only
                     editable={false} // Set to read-only
                   />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Digital Signature Section */}
          {(contractDetail.status === 'draft' || contractDetail.status === 'pending_signatures') && (
            <DigitalSignaturePad
              contractId={contractDetail.id}
              userId={user.id}
              userRole={userRole}
              contractTitle={contractDetail.title}
              isSigningEnabled={contractDetail.status === 'draft' || contractDetail.status === 'pending_signatures'}
              onSignatureComplete={() => {
                // Refresh the page to update status
                window.location.reload();
              }}
            />
          )}

          {/* Payment Release Section */}
          {(['pending_funding', 'active', 'pending_delivery', 'in_review', 'pending_completion', 'completed'].includes(contractDetail.status)) && (
            <PaymentReleaseManager
              contractId={contractDetail.id}
              userId={user.id}
              userRole={userRole}
              contractType={contractDetail.type as 'fixed' | 'milestone' | 'hourly'}
              contractStatus={contractDetail.status}
              milestones={milestones?.map(m => ({
                id: m.id,
                title: m.title,
                amount: m.amount,
                status: m.status as any,
                due_date: m.due_date
              })) || []}
              onPaymentReleased={() => {
                // Refresh the page to update status
                window.location.reload();
              }}
            />
          )}

          {/* Contract Collaboration Section */}
          {(['draft', 'pending_signatures', 'pending_funding'].includes(contractDetail.status)) && (
            <ContractCollaboration
              contractId={contractDetail.id}
              currentUserId={user.id}
              userType={userRole}
              initialContract={contractDetail}
            />
          )}

          {/* Dispute Resolution Section */}
          {(contractDetail.status === 'disputed' || ['active', 'pending_delivery', 'in_review', 'pending_completion'].includes(contractDetail.status)) && (
            <DisputeResolution
              contractId={contractDetail.id}
              userId={user.id}
              userRole={userRole}
              contractTitle={contractDetail.title}
              onDisputeStatusChange={() => {
                // Refresh the page to update contract status
                window.location.reload();
              }}
            />
          )}

          {/* Refund & Cancellation Section */}
          {!['completed', 'cancelled'].includes(contractDetail.status) && (
            <RefundCancellationManager
              contractId={contractDetail.id}
              userId={user.id}
              userRole={userRole}
              contractStatus={contractDetail.status}
              totalAmount={contractDetail.total_amount || 0}
              currency={contractDetail.currency || 'USD'}
              escrowStatus="held" // TODO: Fetch actual escrow status
              onStatusChange={() => {
                // Refresh the page to update contract status
                window.location.reload();
              }}
            />
          )}
        </div>

        {/* Sidebar Column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* TODO: Fetch and display client info from contract_parties table */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Client Info (Placeholder)</h3>
                  <p className="text-xs text-muted-foreground">Fetch client details from contract_parties table.</p>
                  {/* Example: Display client name/email if fetched */}
                  {/* {contractDetail.contract_parties?.find(p => p.role === 'client')?.profiles?.display_name || 'Client details pending'} */}
                </div>

                <Separator />

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Contract Status</h3>
                  <div className="flex items-center mt-1">
                    {getStatusBadge(contractDetail.status)}
                  </div>
                </div>
                {/* Actions are handled by the Client Component */}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">
                  Payment tracking is available on Professional and Business plans.
                </p>
                <Button variant="outline" size="sm" className="mt-4" asChild>
                  <Link href="/dashboard/subscription">
                    Upgrade Plan
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
