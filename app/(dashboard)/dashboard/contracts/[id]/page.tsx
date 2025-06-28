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
  client_profile: Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'display_name' | 'company_name' | 'website' | 'avatar_url' | 'user_type' | 'email'> | null;
  freelancer_profile: Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'display_name' | 'company_name' | 'website' | 'avatar_url' | 'user_type' | 'email'> | null;
};

// Updated status type based on new workflow
type ContractStatus = 'draft' | 'pending_signatures' | 'pending_funding' | 'active' | 'pending_delivery' | 'in_review' | 'revision_requested' | 'pending_completion' | 'completed' | 'cancelled' | 'disputed';


// Fetch data server-side
export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    .eq("id", id)
    .or(`creator_id.eq.${user.id},client_id.eq.${user.id},freelancer_id.eq.${user.id}`)
    .maybeSingle();

  // Fetch milestones if it's a milestone contract
  const { data: milestones } = await supabase
    .from("contract_milestones")
    .select("*")
    .eq("contract_id", id)
    .order("order_index", { ascending: true });

  // Fetch payment information to determine funding status
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("contract_id", id);

  // Calculate funded amount and escrow status
  const fundedAmount = payments?.reduce((total, payment) => {
    if (payment.status === 'in_escrow' || payment.status === 'released') {
      return total + Number(payment.amount);
    }
    return total;
  }, 0) || 0;

  const escrowStatus: 'pending' | 'held' | 'released' | 'refunded' = 
    payments?.some(p => p.status === 'released') ? 'released' :
    payments?.some(p => p.status === 'refunded') ? 'refunded' :
    payments?.some(p => p.status === 'in_escrow') ? 'held' : 'pending';

  if (fetchError) {
    console.error(`Error fetching contract ${id}:`, fetchError);
    notFound();
  }

  if (!contract) {
    notFound(); // Trigger Next.js 404 page
  }

  // Access is already controlled by the query filter above (creator_id = user.id)
  // If we reach here, the user has proper access to view this contract

  // Fetch client profile if client_id exists
  let clientProfile = null;
  if (contract.client_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, display_name, company_name, website, avatar_url, user_type, email')
      .eq('id', contract.client_id)
      .single();
    
    if (profile) {
      clientProfile = profile;
    }
  }

  // If no client profile found but we have client_email, try to find by email
  if (!clientProfile && contract.client_email) {
    const { data: emailProfile } = await supabase
      .from('profiles')
      .select('id, display_name, company_name, website, avatar_url, user_type, email')
      .eq('email', contract.client_email)
      .single();
    
    if (emailProfile) {
      clientProfile = emailProfile;
    }
  }

  // Fetch freelancer profile if freelancer_id exists
  let freelancerProfile = null;
  if (contract.freelancer_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, display_name, company_name, website, avatar_url, user_type, email')
      .eq('id', contract.freelancer_id)
      .single();
    
    if (profile) {
      freelancerProfile = profile;
    }
  }

  // Cast to the specific type for easier access
  const contractDetail = {
    ...contract,
    client_profile: clientProfile,
    freelancer_profile: freelancerProfile
  } as ContractDetail;

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
    switch (status?.toString().trim()) {
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
              escrowStatus={escrowStatus}
              fundedAmount={fundedAmount}
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
                {/* Client Information */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Client Details</h3>
                  {contractDetail.client_profile ? (
                    <div className="space-y-3">
                      {/* Client Name and Avatar */}
                      <div className="flex items-center space-x-3">
                        {contractDetail.client_profile.avatar_url ? (
                          <img
                            src={contractDetail.client_profile.avatar_url}
                            alt={contractDetail.client_profile.display_name || 'Client'}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-sm font-medium text-muted-foreground">
                              {(contractDetail.client_profile.display_name || contractDetail.client_profile.email || 'C').charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {contractDetail.client_profile.display_name || 'Client User'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {contractDetail.client_profile.email}
                          </p>
                        </div>
                      </div>

                      {/* Company Information */}
                      {contractDetail.client_profile.company_name && (
                        <div>
                          <p className="text-xs text-muted-foreground">Company</p>
                          <p className="text-sm">{contractDetail.client_profile.company_name}</p>
                        </div>
                      )}

                      {/* Website */}
                      {contractDetail.client_profile.website && (
                        <div>
                          <p className="text-xs text-muted-foreground">Website</p>
                          <a 
                            href={contractDetail.client_profile.website.startsWith('http') ? contractDetail.client_profile.website : `https://${contractDetail.client_profile.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline truncate block"
                          >
                            {contractDetail.client_profile.website}
                          </a>
                        </div>
                      )}

                      {/* User Type */}
                      <div>
                        <p className="text-xs text-muted-foreground">Account Type</p>
                        <Badge variant="outline" className="text-xs">
                          {contractDetail.client_profile.user_type === 'both' ? 'Client & Freelancer' : 
                           contractDetail.client_profile.user_type === 'client' ? 'Client' : 
                           contractDetail.client_profile.user_type || 'User'}
                        </Badge>
                      </div>
                    </div>
                  ) : contractDetail.client_email ? (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <span className="text-sm font-medium text-muted-foreground">
                            {contractDetail.client_email.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">Client (No Account)</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {contractDetail.client_email}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Client will need to create an account to access the contract.
                      </p>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground">No client assigned</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Add a client email to send this contract.
                      </p>
                    </div>
                  )}
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
              <CardTitle>Freelancer Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Freelancer Information */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Freelancer Details</h3>
                  {contractDetail.freelancer_profile ? (
                    <div className="space-y-3">
                      {/* Freelancer Name and Avatar */}
                      <div className="flex items-center space-x-3">
                        {contractDetail.freelancer_profile.avatar_url ? (
                          <img
                            src={contractDetail.freelancer_profile.avatar_url}
                            alt={contractDetail.freelancer_profile.display_name || 'Freelancer'}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-sm font-medium text-muted-foreground">
                              {(contractDetail.freelancer_profile.display_name || contractDetail.freelancer_profile.email || 'F').charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {contractDetail.freelancer_profile.display_name || 'Freelancer User'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {contractDetail.freelancer_profile.email}
                          </p>
                        </div>
                      </div>

                      {/* Company Information */}
                      {contractDetail.freelancer_profile.company_name && (
                        <div>
                          <p className="text-xs text-muted-foreground">Company</p>
                          <p className="text-sm">{contractDetail.freelancer_profile.company_name}</p>
                        </div>
                      )}

                      {/* Website */}
                      {contractDetail.freelancer_profile.website && (
                        <div>
                          <p className="text-xs text-muted-foreground">Website</p>
                          <a 
                            href={contractDetail.freelancer_profile.website.startsWith('http') ? contractDetail.freelancer_profile.website : `https://${contractDetail.freelancer_profile.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline truncate block"
                          >
                            {contractDetail.freelancer_profile.website}
                          </a>
                        </div>
                      )}

                      {/* User Type */}
                      <div>
                        <p className="text-xs text-muted-foreground">Account Type</p>
                        <Badge variant="outline" className="text-xs">
                          {contractDetail.freelancer_profile.user_type === 'both' ? 'Client & Freelancer' : 
                           contractDetail.freelancer_profile.user_type === 'freelancer' ? 'Freelancer' : 
                           contractDetail.freelancer_profile.user_type || 'User'}
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground">No freelancer assigned</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Freelancer will be assigned when contract is accepted.
                      </p>
                    </div>
                  )}
                </div>
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
