"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { ArrowLeftIcon, PrinterIcon, PenIcon, CheckCircleIcon, XCircleIcon, DownloadIcon, SendIcon } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";

// Contract interface (matches the one in the contracts page)
interface Contract {
  id: string;
  title: string;
  description: string;
  clientEmail: string;
  price?: string;
  currency?: string;
  paymentType?: string;
  status: "draft" | "sent" | "signed" | "completed" | "cancelled";
  createdAt: string;
  template: string;
}

// This would normally come from a database query, but for this example, we'll pull from localStorage
export default function ContractDetailPage({ params }: { params: { id: string } }) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    // Load contract from localStorage
    const loadContract = () => {
      setLoading(true);
      try {
        const savedContracts = localStorage.getItem('contracts');
        if (savedContracts) {
          const contracts = JSON.parse(savedContracts);
          const foundContract = contracts.find((c: Contract) => c.id === params.id);
          
          if (foundContract) {
            setContract(foundContract);
          } else {
            setNotFound(true);
          }
        } else {
          setNotFound(true);
        }
      } catch (e) {
        console.error("Failed to load contract", e);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    loadContract();
  }, [params.id]);

  const handleChangeStatus = (newStatus: "draft" | "sent" | "signed" | "completed" | "cancelled") => {
    if (!contract) return;
    
    try {
      const savedContracts = localStorage.getItem('contracts');
      if (savedContracts) {
        const contracts = JSON.parse(savedContracts);
        const updatedContracts = contracts.map((c: Contract) => 
          c.id === contract.id ? { ...c, status: newStatus } : c
        );
        
        localStorage.setItem('contracts', JSON.stringify(updatedContracts));
        setContract({ ...contract, status: newStatus });
        
        toast({
          title: "Status updated",
          description: `Contract status changed to ${newStatus}.`,
          variant: "default",
        });
      }
    } catch (e) {
      console.error("Failed to update contract status", e);
      toast({
        title: "Error",
        description: "Failed to update contract status.",
        variant: "destructive",
      });
    }
  };

  const templateSample = {
    "basic-freelance": `
# Freelance Service Agreement

## 1. Parties
This Freelance Service Agreement (the "Agreement") is entered into between the undersigned freelancer ("Freelancer") and the client identified below ("Client").

## 2. Scope of Work
The Freelancer agrees to provide the following services to the Client:
- ${contract?.description || "Services as described in project specifications"}

## 3. Compensation
The Client agrees to pay the Freelancer the agreed sum for the completion of the services described above.

## 4. Intellectual Property
Upon full payment, the Client will own all rights to the deliverables provided by the Freelancer.

## 5. Confidentiality
The Freelancer agrees to keep confidential all information provided by the Client.

## 6. Term and Termination
This Agreement will begin on the effective date and continue until the services are completed or the Agreement is terminated.

## 7. Independent Contractor
The Freelancer is an independent contractor and not an employee of the Client.
`,
    "web-development": `
# Web Development Contract

## 1. Parties
This Web Development Agreement (the "Agreement") is entered into between the developer ("Developer") and the client identified below ("Client").

## 2. Services
The Developer agrees to design, develop, and implement a website for the Client as described below:
- ${contract?.description || "Website development as per project specifications"}

## 3. Development Timeline
The Developer will complete the project according to the agreed timeline.

## 4. Payment Terms
The Client agrees to pay the Developer the agreed sum according to the following schedule:
- 50% deposit upon signing this Agreement
- 50% upon completion and delivery of the website

## 5. Hosting and Domain
The Client is responsible for obtaining and maintaining website hosting and domain name unless otherwise specified.

## 6. Browser Compatibility
The website will be compatible with the current versions of major browsers.

## 7. Ownership and Rights
Upon final payment, the Client will own all rights to the custom elements of the website.
`,
    "graphic-design": `
# Graphic Design Service Agreement

## 1. Parties
This Graphic Design Agreement (the "Agreement") is entered into between the designer ("Designer") and the client identified below ("Client").

## 2. Design Services
The Designer agrees to provide the following design services:
- ${contract?.description || "Design services as per project specifications"}

## 3. Revisions
The Designer will provide up to three (3) rounds of revisions based on the Client's feedback.

## 4. Payment
The Client agrees to pay the Designer the agreed sum according to the following schedule:
- 50% deposit upon signing this Agreement
- 50% upon delivery of final design files

## 5. Copyright and Ownership
Upon final payment, the Client will own all rights to the final design files.

## 6. Timeline
The Designer will complete the project according to the agreed timeline.

## 7. Credit and Portfolio
Designer reserves the right to display the work in their portfolio as an example of their work.
`,
    "custom": `
# Custom Contract Agreement

## 1. Parties
This Agreement is entered into between the service provider and the client identified below.

## 2. Services
The service provider agrees to deliver the following:
- ${contract?.description || "Services as described in project specifications"}

## 3. Term
This Agreement will begin on the effective date and continue until the services are completed.

## 4. Payment
Payment details to be specified by parties.

## 5. Confidentiality
Both parties agree to keep confidential all information shared during the course of this Agreement.

## 6. Termination
This Agreement may be terminated by either party with written notice.

## 7. Governing Law
This Agreement shall be governed by the laws of [Jurisdiction].
`
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="bg-muted text-muted-foreground">Draft</Badge>;
      case "sent":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-200">Sent</Badge>;
      case "signed":
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-200">Signed</Badge>;
      case "completed":
        return <Badge variant="outline" className="bg-green-500/20 text-green-600 border-green-300">Completed</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-200">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (notFound || !contract) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <XCircleIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">Contract Not Found</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-md">
          The contract you're looking for doesn't exist or might have been deleted.
        </p>
        <Button asChild>
          <Link href="/dashboard/contracts">
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Back to Contracts
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <Link href="/dashboard/contracts" className="flex items-center text-sm text-muted-foreground mb-2 hover:underline">
            <ArrowLeftIcon className="h-3 w-3 mr-1" />
            Back to contracts
          </Link>
          <h1 className="text-3xl font-serif font-bold">{contract.title}</h1>
          <div className="flex items-center gap-3 mt-2">
            {getStatusBadge(contract.status)}
            <span className="text-sm text-muted-foreground">
              Created on {new Date(contract.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm">
            <PrinterIcon className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" size="sm">
            <DownloadIcon className="h-4 w-4 mr-2" />
            Download
          </Button>
          
          {contract.status === "draft" && (
            <Button 
              size="sm" 
              onClick={() => handleChangeStatus("sent")}
            >
              <SendIcon className="h-4 w-4 mr-2" />
              Send to Client
            </Button>
          )}
          
          {contract.status === "sent" && (
            <Button 
              size="sm" 
              onClick={() => handleChangeStatus("signed")}
            >
              <CheckCircleIcon className="h-4 w-4 mr-2" />
              Mark as Signed
            </Button>
          )}
          
          {contract.status === "signed" && (
            <Button 
              size="sm" 
              onClick={() => handleChangeStatus("completed")}
            >
              <CheckCircleIcon className="h-4 w-4 mr-2" />
              Complete Contract
            </Button>
          )}
        </div>
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
                  <p>{contract.description || "No description provided."}</p>
                </div>

                <Separator />
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Payment Details</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">
                      {contract.price ? `${contract.currency || 'USD'} ${parseFloat(contract.price).toFixed(2)}` : "Not specified"}
                    </span>
                    {contract.paymentType && (
                      <Badge variant="outline" className="ml-2">
                        {contract.paymentType === "hourly" ? "Hourly Rate" : "Fixed Price"}
                      </Badge>
                    )}
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Contract Template</h3>
                  <p>{
                    contract.template === 'basic-freelance' ? 'Basic Freelance Agreement' :
                    contract.template === 'web-development' ? 'Web Development Contract' :
                    contract.template === 'graphic-design' ? 'Graphic Design Contract' :
                    'Custom Contract'
                  }</p>
                </div>
                
                <Separator />
                
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap bg-muted p-4 rounded-md text-sm overflow-auto">
                    {templateSample[contract.template as keyof typeof templateSample] || templateSample['custom']}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Email</h3>
                  <p>{contract.clientEmail || "Not specified"}</p>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Contract Status</h3>
                  <div className="flex items-center mt-1">
                    {getStatusBadge(contract.status)}
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Actions</h3>
                  <div className="space-y-2 mt-2">
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      <PenIcon className="h-4 w-4 mr-2" />
                      Edit Contract
                    </Button>
                    
                    {contract.status === "draft" && (
                      <Button 
                        size="sm" 
                        className="w-full justify-start" 
                        onClick={async () => {
                          try {
                            // Send the contract via email
                            const response = await fetch('/api/contracts/send', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({
                                contractId: contract.id,
                                contractTitle: contract.title,
                                senderName: "Your Name", // This would come from the user profile
                                recipientEmail: contract.clientEmail,
                              }),
                            });
                            
                            const result = await response.json();
                            
                            if (result.success) {
                              // Update the contract status
                              handleChangeStatus("sent");
                              
                              toast({
                                title: "Contract sent",
                                description: `The contract has been sent to ${contract.clientEmail}.`,
                                variant: "default",
                              });
                            } else {
                              toast({
                                title: "Error",
                                description: result.error || "Failed to send the contract.",
                                variant: "destructive",
                              });
                            }
                          } catch (error) {
                            console.error("Failed to send contract:", error);
                            toast({
                              title: "Error",
                              description: "Failed to send the contract. Please try again later.",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        <SendIcon className="h-4 w-4 mr-2" />
                        Send to Client
                      </Button>
                    )}
                    
                    {contract.status !== "cancelled" && contract.status !== "completed" && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full justify-start text-red-500 hover:text-red-600" 
                        onClick={() => handleChangeStatus("cancelled")}
                      >
                        <XCircleIcon className="h-4 w-4 mr-2" />
                        Cancel Contract
                      </Button>
                    )}
                    
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full justify-start"
                      onClick={() => {
                        const savedContracts = localStorage.getItem('contracts');
                        if (savedContracts) {
                          const contracts = JSON.parse(savedContracts);
                          const updatedContracts = contracts.filter((c: Contract) => c.id !== contract.id);
                          localStorage.setItem('contracts', JSON.stringify(updatedContracts));
                          router.push('/dashboard/contracts');
                        }
                      }}
                    >
                      Delete Contract
                    </Button>
                  </div>
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
