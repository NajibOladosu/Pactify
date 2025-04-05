"use client"

import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRightIcon, PlusIcon, FileTextIcon, FileIcon } from "lucide-react";
import Link from "next/link";

export default function NewContractPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [contractDetails, setContractDetails] = useState({
    title: "",
    description: "",
    clientEmail: "",
  });

  const handleNextStep = () => {
    if (step < 3) {
      setStep(step + 1);
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    handleNextStep();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setContractDetails((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // This functionality will be implemented in a future version
    // Currently just navigating to the contracts list
    router.push('/dashboard/contracts');
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold">Create New Contract</h1>
          <p className="text-muted-foreground mt-1">Follow the steps to create a legally binding contract.</p>
        </div>
      </div>

      {/* Progress steps */}
      <div className="flex justify-between">
        <div className="flex items-center gap-2 w-full">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-primary-500 text-white' : 'bg-muted text-muted-foreground'}`}>
            1
          </div>
          <div className="text-sm font-medium">Select Template</div>
          <div className="h-0.5 flex-1 bg-muted relative">
            <div className={`h-full bg-primary-500 absolute top-0 left-0 ${step > 1 ? 'w-full' : 'w-0'} transition-all`}></div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 w-full">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-primary-500 text-white' : 'bg-muted text-muted-foreground'}`}>
            2
          </div>
          <div className="text-sm font-medium">Contract Details</div>
          <div className="h-0.5 flex-1 bg-muted relative">
            <div className={`h-full bg-primary-500 absolute top-0 left-0 ${step > 2 ? 'w-full' : 'w-0'} transition-all`}></div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-primary-500 text-white' : 'bg-muted text-muted-foreground'}`}>
            3
          </div>
          <div className="text-sm font-medium">Review & Create</div>
        </div>
      </div>

      {/* Step content */}
      <Card className="mt-8">
        {step === 1 && (
          <>
            <CardHeader>
              <CardTitle>Select a Contract Template</CardTitle>
              <CardDescription>Choose a starting point for your contract.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div 
                  className="border rounded-lg p-4 cursor-pointer hover:border-primary-500 hover:bg-primary-500/5"
                  onClick={() => handleTemplateSelect('basic-freelance')}
                >
                  <div className="flex items-start gap-3">
                    <FileTextIcon className="h-6 w-6 text-primary-500 mt-1" />
                    <div>
                      <h3 className="font-medium">Basic Freelance Agreement</h3>
                      <p className="text-sm text-muted-foreground mt-1">A simple agreement for freelance work with basic terms and conditions.</p>
                    </div>
                  </div>
                </div>
                
                <div 
                  className="border rounded-lg p-4 cursor-pointer hover:border-primary-500 hover:bg-primary-500/5"
                  onClick={() => handleTemplateSelect('web-development')}
                >
                  <div className="flex items-start gap-3">
                    <FileTextIcon className="h-6 w-6 text-primary-500 mt-1" />
                    <div>
                      <h3 className="font-medium">Web Development Contract</h3>
                      <p className="text-sm text-muted-foreground mt-1">Comprehensive contract for website development projects.</p>
                    </div>
                  </div>
                </div>
                
                <div 
                  className="border rounded-lg p-4 cursor-pointer hover:border-primary-500 hover:bg-primary-500/5"
                  onClick={() => handleTemplateSelect('graphic-design')}
                >
                  <div className="flex items-start gap-3">
                    <FileTextIcon className="h-6 w-6 text-primary-500 mt-1" />
                    <div>
                      <h3 className="font-medium">Graphic Design Contract</h3>
                      <p className="text-sm text-muted-foreground mt-1">For design services including logo design, branding, and illustrations.</p>
                    </div>
                  </div>
                </div>
                
                <div 
                  className="border rounded-lg p-4 cursor-pointer hover:border-primary-500 hover:bg-primary-500/5"
                  onClick={() => handleTemplateSelect('custom')}
                >
                  <div className="flex items-start gap-3">
                    <PlusIcon className="h-6 w-6 text-primary-500 mt-1" />
                    <div>
                      <h3 className="font-medium">Start from Scratch</h3>
                      <p className="text-sm text-muted-foreground mt-1">Create a custom contract with your own terms and conditions.</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-between mt-8">
                <Button variant="outline" asChild>
                  <Link href="/dashboard/contracts">Cancel</Link>
                </Button>
                <Button type="button" onClick={handleNextStep} disabled>
                  Next <ChevronRightIcon className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </>
        )}
        
        {step === 2 && (
          <>
            <CardHeader>
              <CardTitle>Contract Details</CardTitle>
              <CardDescription>Fill in the basic information for your contract.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title">Contract Title</Label>
                    <Input 
                      id="title" 
                      name="title" 
                      value={contractDetails.title}
                      onChange={handleInputChange}
                      placeholder="e.g., Website Redesign Project for XYZ Company" 
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="description">Contract Description</Label>
                    <textarea 
                      id="description" 
                      name="description"
                      value={contractDetails.description}
                      onChange={handleInputChange}
                      placeholder="Brief description of the project and agreement" 
                      className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="clientEmail">Client's Email</Label>
                    <Input 
                      id="clientEmail" 
                      name="clientEmail" 
                      type="email"
                      value={contractDetails.clientEmail}
                      onChange={handleInputChange}
                      placeholder="client@example.com" 
                    />
                    <p className="text-xs text-muted-foreground mt-1">The client will receive an invitation to review and sign the contract.</p>
                  </div>
                </div>
                
                <div className="flex justify-between mt-8">
                  <Button type="button" variant="outline" onClick={handlePrevStep}>
                    Back
                  </Button>
                  <Button type="button" onClick={handleNextStep}>
                    Next <ChevronRightIcon className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </>
        )}
        
        {step === 3 && (
          <>
            <CardHeader>
              <CardTitle>Review & Create Contract</CardTitle>
              <CardDescription>Review your contract details before creating it.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="bg-muted/30 rounded-lg p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground">Contract Type</h4>
                      <p className="text-sm font-medium">
                        {selectedTemplate === 'basic-freelance' && 'Basic Freelance Agreement'}
                        {selectedTemplate === 'web-development' && 'Web Development Contract'}
                        {selectedTemplate === 'graphic-design' && 'Graphic Design Contract'}
                        {selectedTemplate === 'custom' && 'Custom Contract'}
                      </p>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground">Contract Title</h4>
                      <p className="text-sm font-medium">{contractDetails.title || "Not specified"}</p>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground">Client Email</h4>
                      <p className="text-sm font-medium">{contractDetails.clientEmail || "Not specified"}</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
                    <p className="text-sm">{contractDetails.description || "No description provided."}</p>
                  </div>
                </div>
                
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <FileTextIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium">What happens next?</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        After creating this contract, you'll be taken to the contract editor where you can customize the terms.
                        Once you're happy with the contract, you can send it to your client for review and signature.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-between mt-8">
                  <Button type="button" variant="outline" onClick={handlePrevStep}>
                    Back
                  </Button>
                  <Button onClick={handleSubmit}>
                    Create Contract
                  </Button>
                </div>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
