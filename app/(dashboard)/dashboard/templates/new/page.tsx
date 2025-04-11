"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { ChevronRightIcon, ArrowLeftIcon, FileTextIcon } from "lucide-react";
import Link from "next/link";

export default function NewTemplatePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [templateDetails, setTemplateDetails] = useState({
    name: "",
    description: "",
    category: "",
  });

  const [templateSections, setTemplateSections] = useState<Array<{id: string, title: string, content: string}>>([
    { id: "section-1", title: "Introduction", content: "" },
    { id: "section-2", title: "Scope of Services", content: "" },
    { id: "section-3", title: "Payment Terms", content: "" },
  ]);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setTemplateDetails((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSectionChange = (id: string, field: 'title' | 'content', value: string) => {
    setTemplateSections(prevSections => 
      prevSections.map(section => 
        section.id === id ? { ...section, [field]: value } : section
      )
    );
  };

  const addSection = () => {
    const newId = `section-${templateSections.length + 1}`;
    setTemplateSections([...templateSections, { id: newId, title: "", content: "" }]);
  };

  const removeSection = (id: string) => {
    if (templateSections.length > 1) {
      setTemplateSections(templateSections.filter(section => section.id !== id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // This functionality will be implemented in a future version
    // For now, just navigate back to templates list
    router.push('/dashboard/templates');
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold">Create Contract Template</h1>
          <p className="text-muted-foreground mt-1">Build a reusable template for your contracts.</p>
        </div>
      </div>

      {/* Progress steps */}
      <div className="flex justify-between">
        <div className="flex items-center gap-2 w-full">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-primary-500 text-white' : 'bg-muted text-muted-foreground'}`}>
            1
          </div>
          <div className="text-sm font-medium">Template Info</div>
          <div className="h-0.5 flex-1 bg-muted relative">
            <div className={`h-full bg-primary-500 absolute top-0 left-0 ${step > 1 ? 'w-full' : 'w-0'} transition-all`}></div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 w-full">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-primary-500 text-white' : 'bg-muted text-muted-foreground'}`}>
            2
          </div>
          <div className="text-sm font-medium">Template Structure</div>
          <div className="h-0.5 flex-1 bg-muted relative">
            <div className={`h-full bg-primary-500 absolute top-0 left-0 ${step > 2 ? 'w-full' : 'w-0'} transition-all`}></div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-primary-500 text-white' : 'bg-muted text-muted-foreground'}`}>
            3
          </div>
          <div className="text-sm font-medium">Review & Save</div>
        </div>
      </div>

      {/* Step content */}
      <Card className="mt-8">
        {step === 1 && (
          <>
            <CardHeader>
              <CardTitle>Template Information</CardTitle>
              <CardDescription>Provide basic information about your template.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Template Name</Label>
                    <Input 
                      id="name" 
                      name="name" 
                      value={templateDetails.name}
                      onChange={handleInputChange}
                      placeholder="e.g., Web Development Agreement" 
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="description">Template Description</Label>
                    <textarea 
                      id="description" 
                      name="description"
                      value={templateDetails.description}
                      onChange={handleInputChange}
                      placeholder="Brief description of what this template is for" 
                      className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Input 
                      id="category" 
                      name="category" 
                      value={templateDetails.category}
                      onChange={handleInputChange}
                      placeholder="e.g., Web Development, Design, Writing" 
                      required
                    />
                  </div>
                </div>
                
                <div className="flex justify-between mt-8">
                  <Button variant="outline" asChild>
                    <Link href="/dashboard/templates">Cancel</Link>
                  </Button>
                  <Button 
                    type="button" 
                    onClick={handleNextStep}
                    disabled={!templateDetails.name || !templateDetails.description || !templateDetails.category}
                  >
                    Next <ChevronRightIcon className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </>
        )}
        
        {step === 2 && (
          <>
            <CardHeader>
              <CardTitle>Template Structure</CardTitle>
              <CardDescription>Define the sections and clauses of your contract template.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-4">
                  {templateSections.map((section, index) => (
                    <div key={section.id} className="border rounded-md p-4 space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="font-medium">Section {index + 1}</h3>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          onClick={() => removeSection(section.id)}
                          disabled={templateSections.length <= 1}
                        >
                          Remove
                        </Button>
                      </div>
                      
                      <div>
                        <Label htmlFor={`${section.id}-title`}>Section Title</Label>
                        <Input 
                          id={`${section.id}-title`}
                          value={section.title}
                          onChange={(e) => handleSectionChange(section.id, 'title', e.target.value)}
                          placeholder="e.g., Scope of Work"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor={`${section.id}-content`}>Content</Label>
                        <textarea 
                          id={`${section.id}-content`}
                          value={section.content}
                          onChange={(e) => handleSectionChange(section.id, 'content', e.target.value)}
                          placeholder="Enter text or use variables like {{client_name}}, {{project_description}}, etc."
                          className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </div>
                    </div>
                  ))}
                  
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full mt-4"
                    onClick={addSection}
                  >
                    Add Section
                  </Button>
                </div>
                
                <div className="flex justify-between mt-8">
                  <Button type="button" variant="outline" onClick={handlePrevStep}>
                    <ArrowLeftIcon className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button 
                    type="button" 
                    onClick={handleNextStep}
                    disabled={templateSections.some(section => !section.title || !section.content)}
                  >
                    Next <ChevronRightIcon className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </>
        )}
        
        {step === 3 && (
          <>
            <CardHeader>
              <CardTitle>Review & Save Template</CardTitle>
              <CardDescription>Review your template before saving it.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="bg-muted/30 rounded-lg p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground">Template Name</h4>
                      <p className="text-sm font-medium">{templateDetails.name}</p>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground">Category</h4>
                      <p className="text-sm font-medium">{templateDetails.category}</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
                    <p className="text-sm">{templateDetails.description}</p>
                  </div>
                </div>
                
                <div className="border rounded-lg">
                  <div className="p-4 border-b bg-muted/20">
                    <h3 className="font-medium">Template Preview</h3>
                  </div>
                  <div className="p-4 space-y-4">
                    {templateSections.map((section, index) => (
                      <div key={section.id} className="space-y-2">
                        <h4 className="font-medium">{section.title}</h4>
                        <p className="text-sm whitespace-pre-wrap">{section.content}</p>
                        {index < templateSections.length - 1 && <hr className="my-4" />}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <FileTextIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium">What happens next?</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          Once saved, this template will be available for you to use when creating new contracts.
                          Template variables will be replaced with actual values when creating a contract.
                        </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-between mt-8">
                  <Button type="button" variant="outline" onClick={handlePrevStep}>
                    <ArrowLeftIcon className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button onClick={handleSubmit}>
                    Save Template
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
