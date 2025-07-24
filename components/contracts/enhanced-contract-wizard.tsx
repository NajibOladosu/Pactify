"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { 
  ChevronRightIcon, 
  ChevronLeftIcon,
  PlusIcon, 
  FileTextIcon, 
  Loader2,
  CalendarIcon,
  DollarSignIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertCircleIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Milestone {
  id: string;
  title: string;
  description: string;
  amount: number;
  due_date: string;
  deliverables: string[];
}

interface ContractFormData {
  title: string;
  description: string;
  client_email: string;
  total_amount: number;
  currency: string;
  type: 'fixed' | 'milestone' | 'hourly';
  start_date: string;
  end_date: string;
  terms_and_conditions: string;
  template_id: string | null;
  milestones: Milestone[];
  user_role: 'freelancer' | 'client';
}

const TEMPLATES = [
  {
    id: 'web-development',
    name: 'Web Development Contract',
    description: 'Comprehensive contract for website development projects',
    category: 'Development',
    icon: '💻',
    suggested_type: 'milestone' as const,
    default_terms: `1. Project Scope: The freelancer will develop a website according to specifications provided by the client.
2. Timeline: Project timeline will be based on agreed milestones.
3. Revisions: Up to 3 rounds of revisions are included per milestone.
4. Intellectual Property: Upon final payment, all rights transfer to the client.
5. Support: 30 days of post-launch support included.`
  },
  {
    id: 'graphic-design',
    name: 'Graphic Design Contract',
    description: 'For design services including logo design, branding, and illustrations',
    category: 'Design',
    icon: '🎨',
    suggested_type: 'fixed' as const,
    default_terms: `1. Design Services: Creation of graphics as specified in project brief.
2. Deliverables: Final files in agreed formats (PNG, SVG, PDF, etc.).
3. Revisions: Up to 5 rounds of revisions included.
4. Usage Rights: Client receives full commercial usage rights upon payment.
5. Timeline: Standard delivery within agreed timeframe.`
  },
  {
    id: 'content-writing',
    name: 'Content Writing Contract',
    description: 'For blog posts, articles, and content creation services',
    category: 'Writing',
    icon: '✍️',
    suggested_type: 'hourly' as const,
    default_terms: `1. Content Creation: Original content written according to client guidelines.
2. Research: Thorough research included for all topics.
3. Revisions: Up to 2 rounds of revisions per piece.
4. Copyright: Client owns all rights to completed content.
5. Deadline: Content delivered according to agreed schedule.`
  },
  {
    id: 'consulting',
    name: 'Consulting Agreement',
    description: 'Professional consulting and advisory services',
    category: 'Consulting',
    icon: '🎯',
    suggested_type: 'hourly' as const,
    default_terms: `1. Consulting Services: Professional advice and guidance in agreed areas.
2. Confidentiality: All client information kept strictly confidential.
3. Deliverables: Reports and recommendations as agreed.
4. Meetings: Regular check-ins and progress updates.
5. Expertise: Services provided with professional expertise and best practices.`
  },
  {
    id: 'custom',
    name: 'Custom Contract',
    description: 'Start from scratch with your own terms',
    category: 'Custom',
    icon: '📄',
    suggested_type: 'fixed' as const,
    default_terms: `1. Project Description: [To be defined]
2. Deliverables: [To be specified]
3. Timeline: [To be agreed]
4. Payment Terms: [To be established]
5. Additional Terms: [To be added as needed]`
  }
];

const STEP_NAMES = [
  'Template',
  'Basic Info & Role',
  'Payment & Type',
  'Milestones',
  'Terms & Timeline',
  'Review'
];

export default function EnhancedContractWizard() {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof TEMPLATES[0] | null>(null);
  const [formData, setFormData] = useState<ContractFormData>({
    title: '',
    description: '',
    client_email: '',
    total_amount: 0,
    currency: 'USD',
    type: 'fixed',
    start_date: '',
    end_date: '',
    terms_and_conditions: '',
    template_id: null,
    milestones: [],
    user_role: 'freelancer'
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    switch (step) {
      case 0: // Template selection
        if (!selectedTemplate) {
          newErrors.template = 'Please select a template';
        }
        break;
      case 1: // Basic info
        if (!formData.title.trim()) {
          newErrors.title = 'Contract title is required';
        }
        if (!formData.description.trim()) {
          newErrors.description = 'Description is required';
        }
        if (!formData.user_role) {
          newErrors.user_role = 'Please select your role in this contract';
        }
        if (!formData.client_email.trim()) {
          newErrors.client_email = formData.user_role === 'freelancer' ? 'Client email is required' : 'Freelancer email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.client_email)) {
          newErrors.client_email = 'Please enter a valid email address';
        }
        break;
      case 2: // Payment & Type
        if (!formData.total_amount || formData.total_amount <= 0) {
          newErrors.total_amount = 'Amount must be greater than 0';
        }
        break;
      case 3: // Milestones (only for milestone contracts)
        if (formData.type === 'milestone') {
          if (formData.milestones.length === 0) {
            newErrors.milestones = 'At least one milestone is required for milestone contracts';
          } else {
            const totalMilestoneAmount = formData.milestones.reduce((sum, m) => sum + m.amount, 0);
            if (Math.abs(totalMilestoneAmount - formData.total_amount) > 0.01) {
              newErrors.milestones = 'Total milestone amount must equal contract amount';
            }
          }
        }
        break;
      case 4: // Terms & Timeline
        if (!formData.terms_and_conditions.trim()) {
          newErrors.terms_and_conditions = 'Terms and conditions are required';
        }
        if (formData.start_date && formData.end_date) {
          if (new Date(formData.end_date) <= new Date(formData.start_date)) {
            newErrors.end_date = 'End date must be after start date';
          }
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      if (currentStep < STEP_NAMES.length - 1) {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleTemplateSelect = (template: typeof TEMPLATES[0]) => {
    setSelectedTemplate(template);
    setFormData(prev => ({
      ...prev,
      template_id: template.id,
      type: template.suggested_type,
      terms_and_conditions: template.default_terms
    }));
  };

  const addMilestone = () => {
    const newMilestone: Milestone = {
      id: `milestone-${Date.now()}`,
      title: '',
      description: '',
      amount: 0,
      due_date: '',
      deliverables: []
    };
    setFormData(prev => ({
      ...prev,
      milestones: [...prev.milestones, newMilestone]
    }));
  };

  const updateMilestone = (id: string, updates: Partial<Milestone>) => {
    setFormData(prev => ({
      ...prev,
      milestones: prev.milestones.map(m => 
        m.id === id ? { ...m, ...updates } : m
      )
    }));
  };

  const removeMilestone = (id: string) => {
    setFormData(prev => ({
      ...prev,
      milestones: prev.milestones.filter(m => m.id !== id)
    }));
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;

    startTransition(async () => {
      try {
        const response = await fetch('/api/contracts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            content: {
              template: selectedTemplate?.name,
              created_with_wizard: true
            }
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to create contract');
        }

        toast({
          title: "Contract Created Successfully!",
          description: "Your contract has been created and saved as a draft.",
        });

        router.push(`/dashboard/contracts/${result.contract.id}`);
      } catch (error) {
        toast({
          title: "Error Creating Contract",
          description: error instanceof Error ? error.message : "An unexpected error occurred",
          variant: "destructive",
        });
      }
    });
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Template Selection
        return (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-serif font-bold mb-4">Choose Your Contract Template</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Select a pre-designed template that best matches your project type. Each template includes 
                optimized terms and suggested contract structure for your industry.
              </p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
              {TEMPLATES.map(template => (
                <Card 
                  key={template.id}
                  className={cn(
                    "cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02]",
                    selectedTemplate?.id === template.id 
                      ? "border-primary bg-primary/5 shadow-lg ring-2 ring-primary/20" 
                      : "hover:border-primary/50"
                  )}
                  onClick={() => handleTemplateSelect(template)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="text-4xl p-3 rounded-lg bg-muted/50">
                        {template.icon}
                      </div>
                      <div className="flex-1 space-y-3">
                        <div>
                          <h3 className="text-xl font-semibold">{template.name}</h3>
                          <p className="text-muted-foreground mt-1 leading-relaxed">
                            {template.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary" className="px-3 py-1">
                            {template.category}
                          </Badge>
                          <Badge variant="outline" className="px-3 py-1 capitalize">
                            {template.suggested_type} Rate
                          </Badge>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {selectedTemplate?.id === template.id ? (
                          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                            <CheckCircleIcon className="h-5 w-5 text-primary-foreground" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/20" />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            {selectedTemplate && (
              <div className="mt-8 p-6 bg-muted/30 rounded-lg max-w-4xl mx-auto">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <FileTextIcon className="h-5 w-5" />
                  Preview: Default Terms for {selectedTemplate.name}
                </h4>
                <div className="text-sm text-muted-foreground whitespace-pre-line bg-background p-4 rounded border">
                  {selectedTemplate.default_terms}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  * These terms can be customized in the next steps
                </p>
              </div>
            )}
            
            {errors.template && (
              <div className="flex items-center gap-2 text-destructive justify-center">
                <XCircleIcon className="h-4 w-4" />
                <span className="text-sm">{errors.template}</span>
              </div>
            )}
          </div>
        );

      case 1: // Basic Info
        return (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-serif font-bold mb-4">Contract Information & Your Role</h2>
              <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
                Let's establish the basic details of your contract and clarify your role in this agreement.
              </p>
            </div>

            <div className="max-w-4xl mx-auto space-y-8">
              {/* Role Selection */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-semibold mb-2">Your Role</h3>
                  <p className="text-muted-foreground">Are you the one providing services or hiring someone?</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                  {[
                    { 
                      value: 'freelancer', 
                      label: 'Freelancer/Service Provider', 
                      desc: 'I am providing services to a client',
                      icon: '👨‍💻',
                      details: 'You will be delivering work or services'
                    },
                    { 
                      value: 'client', 
                      label: 'Client/Buyer', 
                      desc: 'I am hiring a freelancer for services',
                      icon: '🏢',
                      details: 'You will be receiving work or services'
                    }
                  ].map(role => (
                    <Card 
                      key={role.value}
                      className={cn(
                        "cursor-pointer transition-all duration-200 hover:shadow-lg relative",
                        formData.user_role === role.value 
                          ? "border-primary bg-primary/5 shadow-lg ring-2 ring-primary/20" 
                          : "hover:border-primary/50",
                        errors.user_role ? "border-destructive" : ""
                      )}
                      onClick={() => setFormData(prev => ({ ...prev, user_role: role.value as any }))}
                    >
                      <CardContent className="p-6 text-center">
                        <div className="text-4xl mb-4 p-3 rounded-lg bg-muted/30 inline-block">{role.icon}</div>
                        <h4 className="text-lg font-semibold mb-2">{role.label}</h4>
                        <p className="text-muted-foreground text-sm mb-2">{role.desc}</p>
                        <p className="text-xs text-muted-foreground">{role.details}</p>
                        {formData.user_role === role.value && (
                          <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                            <CheckCircleIcon className="h-4 w-4 text-primary-foreground" />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {errors.user_role && (
                  <div className="flex items-center gap-2 text-destructive justify-center">
                    <XCircleIcon className="h-4 w-4" />
                    <span className="text-sm">{errors.user_role}</span>
                  </div>
                )}
              </div>

              {/* Contract Details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-4">Contract Details</h3>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="title" className="text-base font-medium">Contract Title *</Label>
                        <Input
                          id="title"
                          value={formData.title}
                          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="e.g., Website Redesign for ABC Company"
                          className={cn("mt-2 h-12", errors.title ? "border-destructive" : "")}
                        />
                        {errors.title && (
                          <div className="flex items-center gap-2 text-destructive mt-2">
                            <XCircleIcon className="h-4 w-4" />
                            <span className="text-sm">{errors.title}</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="client_email" className="text-base font-medium">
                          {formData.user_role === 'freelancer' ? 'Client Email Address' : 'Freelancer Email Address'} *
                        </Label>
                        <Input
                          id="client_email"
                          type="email"
                          value={formData.client_email}
                          onChange={(e) => setFormData(prev => ({ ...prev, client_email: e.target.value }))}
                          placeholder={formData.user_role === 'freelancer' ? 'client@company.com' : 'freelancer@email.com'}
                          className={cn("mt-2 h-12", errors.client_email ? "border-destructive" : "")}
                        />
                        <p className="text-sm text-muted-foreground mt-2">
                          {formData.user_role === 'freelancer' 
                            ? 'The client will receive an invitation to review and sign the contract.'
                            : 'The freelancer will receive an invitation to review and sign the contract.'
                          }
                        </p>
                        {errors.client_email && (
                          <div className="flex items-center gap-2 text-destructive mt-2">
                            <XCircleIcon className="h-4 w-4" />
                            <span className="text-sm">{errors.client_email}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-4">Project Description</h3>
                    <div>
                      <Label htmlFor="description" className="text-base font-medium">Describe the Project *</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Describe the project scope, objectives, key requirements, and expected deliverables..."
                        rows={8}
                        className={cn("mt-2 resize-none", errors.description ? "border-destructive" : "")}
                      />
                      <p className="text-sm text-muted-foreground mt-2">
                        Be as detailed as possible to avoid misunderstandings later.
                      </p>
                      {errors.description && (
                        <div className="flex items-center gap-2 text-destructive mt-2">
                          <XCircleIcon className="h-4 w-4" />
                          <span className="text-sm">{errors.description}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 2: // Payment & Type
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Payment Structure</h3>
              <p className="text-muted-foreground">Define how you'll be paid for this project.</p>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Contract Type</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                  {[
                    { value: 'fixed', label: 'Fixed Price', desc: 'One-time payment for the entire project' },
                    { value: 'milestone', label: 'Milestone-based', desc: 'Split into multiple payments based on deliverables' },
                    { value: 'hourly', label: 'Hourly Rate', desc: 'Payment based on time worked' }
                  ].map(type => (
                    <Card 
                      key={type.value}
                      className={cn(
                        "cursor-pointer transition-all hover:border-primary p-3",
                        formData.type === type.value ? "border-primary bg-primary/5" : ""
                      )}
                      onClick={() => setFormData(prev => ({ ...prev, type: type.value as any }))}
                    >
                      <div className="text-center">
                        <h4 className="font-medium text-sm">{type.label}</h4>
                        <p className="text-xs text-muted-foreground mt-1">{type.desc}</p>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="total_amount">
                    {formData.type === 'hourly' ? 'Hourly Rate' : 'Total Amount'} *
                  </Label>
                  <div className="relative">
                    <DollarSignIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="total_amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.total_amount || ''}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        total_amount: parseFloat(e.target.value) || 0 
                      }))}
                      placeholder="0.00"
                      className={cn("pl-10", errors.total_amount ? "border-destructive" : "")}
                    />
                  </div>
                  {errors.total_amount && <p className="text-sm text-destructive mt-1">{errors.total_amount}</p>}
                </div>

                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <select
                    id="currency"
                    value={formData.currency}
                    onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                    <option value="CAD">CAD - Canadian Dollar</option>
                    <option value="AUD">AUD - Australian Dollar</option>
                  </select>
                </div>
              </div>

              {formData.type === 'milestone' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircleIcon className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-blue-900">Milestone-based Contract</h4>
                      <p className="text-xs text-blue-700 mt-1">
                        You'll be able to define specific milestones and their amounts in the next step. 
                        This helps ensure payment is tied to deliverables.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 3: // Milestones (only shown for milestone contracts)
        if (formData.type !== 'milestone') {
          // Skip this step for non-milestone contracts
          return null;
        }

        const totalMilestoneAmount = formData.milestones.reduce((sum, m) => sum + m.amount, 0);
        const remaining = formData.total_amount - totalMilestoneAmount;

        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold mb-2">Project Milestones</h3>
                <p className="text-muted-foreground">Break down your project into manageable milestones.</p>
              </div>
              <Button onClick={addMilestone} variant="outline" size="sm">
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Milestone
              </Button>
            </div>

            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex justify-between text-sm">
                <span>Total Contract Amount:</span>
                <span className="font-medium">${formData.total_amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Milestones Total:</span>
                <span className="font-medium">${totalMilestoneAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-2 mt-2">
                <span>Remaining:</span>
                <span className={cn(
                  "font-medium",
                  remaining === 0 ? "text-green-600" : remaining < 0 ? "text-red-600" : "text-orange-600"
                )}>
                  ${remaining.toFixed(2)}
                </span>
              </div>
            </div>

            {formData.milestones.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-muted-foreground/25 rounded-lg">
                <h4 className="text-sm font-medium text-muted-foreground">No milestones added yet</h4>
                <p className="text-xs text-muted-foreground mt-1">Add milestones to structure your project payments</p>
                <Button onClick={addMilestone} variant="outline" size="sm" className="mt-3">
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add First Milestone
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {formData.milestones.map((milestone, index) => (
                  <Card key={milestone.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Milestone {index + 1}</CardTitle>
                        <Button
                          onClick={() => removeMilestone(milestone.id)}
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <XCircleIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`milestone-title-${milestone.id}`}>Milestone Title</Label>
                          <Input
                            id={`milestone-title-${milestone.id}`}
                            value={milestone.title}
                            onChange={(e) => updateMilestone(milestone.id, { title: e.target.value })}
                            placeholder="e.g., Design Mockups"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`milestone-amount-${milestone.id}`}>Amount</Label>
                          <div className="relative">
                            <DollarSignIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id={`milestone-amount-${milestone.id}`}
                              type="number"
                              step="0.01"
                              min="0"
                              value={milestone.amount || ''}
                              onChange={(e) => updateMilestone(milestone.id, { 
                                amount: parseFloat(e.target.value) || 0 
                              })}
                              placeholder="0.00"
                              className="pl-10"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <Label htmlFor={`milestone-description-${milestone.id}`}>Description</Label>
                        <Textarea
                          id={`milestone-description-${milestone.id}`}
                          value={milestone.description}
                          onChange={(e) => updateMilestone(milestone.id, { description: e.target.value })}
                          placeholder="Describe what will be delivered in this milestone..."
                          rows={2}
                        />
                      </div>

                      <div>
                        <Label htmlFor={`milestone-due-${milestone.id}`}>Due Date (Optional)</Label>
                        <Input
                          id={`milestone-due-${milestone.id}`}
                          type="date"
                          value={milestone.due_date}
                          onChange={(e) => updateMilestone(milestone.id, { due_date: e.target.value })}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {errors.milestones && (
              <p className="text-sm text-destructive">{errors.milestones}</p>
            )}
          </div>
        );

      case 4: // Terms & Timeline
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Contract Terms & Timeline</h3>
              <p className="text-muted-foreground">Define the terms and timeline for your project.</p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start_date">Project Start Date (Optional)</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="end_date">Expected Completion Date (Optional)</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                    className={errors.end_date ? "border-destructive" : ""}
                  />
                  {errors.end_date && <p className="text-sm text-destructive mt-1">{errors.end_date}</p>}
                </div>
              </div>

              <div>
                <Label htmlFor="terms_and_conditions">Terms and Conditions *</Label>
                <Textarea
                  id="terms_and_conditions"
                  value={formData.terms_and_conditions}
                  onChange={(e) => setFormData(prev => ({ ...prev, terms_and_conditions: e.target.value }))}
                  placeholder="Enter the terms and conditions for this contract..."
                  rows={8}
                  className={errors.terms_and_conditions ? "border-destructive" : ""}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  These terms have been pre-filled based on your selected template. You can modify them as needed.
                </p>
                {errors.terms_and_conditions && <p className="text-sm text-destructive mt-1">{errors.terms_and_conditions}</p>}
              </div>
            </div>
          </div>
        );

      case 5: // Review
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Review Your Contract</h3>
              <p className="text-muted-foreground">Please review all details before creating your contract.</p>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Contract Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Template:</span>
                      <p className="text-muted-foreground">{selectedTemplate?.name}</p>
                    </div>
                    <div>
                      <span className="font-medium">Type:</span>
                      <p className="text-muted-foreground capitalize">{formData.type}</p>
                    </div>
                    <div>
                      <span className="font-medium">Title:</span>
                      <p className="text-muted-foreground">{formData.title}</p>
                    </div>
                    <div>
                      <span className="font-medium">Client:</span>
                      <p className="text-muted-foreground">{formData.client_email}</p>
                    </div>
                    <div>
                      <span className="font-medium">Amount:</span>
                      <p className="text-muted-foreground">
                        {formData.currency} ${formData.total_amount.toFixed(2)}
                        {formData.type === 'hourly' && ' per hour'}
                      </p>
                    </div>
                    {(formData.start_date || formData.end_date) && (
                      <div>
                        <span className="font-medium">Timeline:</span>
                        <p className="text-muted-foreground">
                          {formData.start_date || 'TBD'} - {formData.end_date || 'TBD'}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {formData.description && (
                    <div>
                      <span className="font-medium text-sm">Description:</span>
                      <p className="text-muted-foreground text-sm mt-1">{formData.description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {formData.type === 'milestone' && formData.milestones.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Milestones</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {formData.milestones.map((milestone, index) => (
                        <div key={milestone.id} className="flex justify-between items-start p-3 border rounded-lg">
                          <div>
                            <h4 className="font-medium text-sm">
                              {index + 1}. {milestone.title || `Milestone ${index + 1}`}
                            </h4>
                            {milestone.description && (
                              <p className="text-xs text-muted-foreground mt-1">{milestone.description}</p>
                            )}
                            {milestone.due_date && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Due: {new Date(milestone.due_date).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          <span className="font-medium text-sm">
                            ${milestone.amount.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">What happens next?</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>• Your contract will be created and saved as a draft</p>
                    <p>• You can further customize it in the contract editor</p>
                    <p>• When ready, send it to your client for review and signature</p>
                    <p>• Both parties must sign before the contract becomes active</p>
                    {formData.type === 'milestone' && (
                      <p>• Milestone payments will be managed through our escrow system</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Skip milestone step for non-milestone contracts
  const effectiveSteps = formData.type === 'milestone' 
    ? STEP_NAMES 
    : STEP_NAMES.filter((_, index) => index !== 3);

  const currentStepIndex = formData.type === 'milestone' 
    ? currentStep 
    : currentStep >= 3 ? currentStep + 1 : currentStep;

  return (
    <div className="min-h-screen bg-background">
      {/* Header Section */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-serif font-bold tracking-tight">Create New Contract</h1>
              <p className="text-muted-foreground mt-2 text-lg">
                Follow our guided wizard to create a comprehensive, legally-binding contract.
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Step</div>
              <div className="text-2xl font-bold">{currentStep + 1} of {effectiveSteps.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-center space-x-8">
            {effectiveSteps.map((stepName, index) => {
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;
              const stepNumber = formData.type === 'milestone' ? index : (index >= 3 ? index + 1 : index);
              
              return (
                <div key={stepName} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "flex items-center justify-center w-12 h-12 rounded-full text-sm font-medium transition-all",
                      isCompleted ? "bg-primary text-primary-foreground shadow-lg" :
                      isActive ? "bg-primary text-primary-foreground shadow-lg scale-110" :
                      "bg-muted text-muted-foreground border-2 border-muted-foreground/20"
                    )}>
                      {isCompleted ? <CheckCircleIcon className="w-6 h-6" /> : stepNumber + 1}
                    </div>
                    <div className={cn(
                      "mt-2 text-sm font-medium text-center min-w-[100px]",
                      isActive ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {stepName}
                    </div>
                  </div>
                  {index < effectiveSteps.length - 1 && (
                    <div className={cn(
                      "mx-6 h-0.5 w-16 transition-colors",
                      isCompleted ? "bg-primary" : "bg-muted-foreground/20"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="container mx-auto px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <Card className="shadow-lg border-0 bg-card">
            <CardContent className="p-8 md:p-12">
              <div className="min-h-[600px]">
                {renderStepContent()}
              </div>
              
              {/* Navigation */}
              <div className="flex justify-between items-center mt-12 pt-8 border-t border-border">
                <Button 
                  onClick={prevStep} 
                  variant="outline"
                  size="lg"
                  disabled={currentStep === 0 || isPending}
                  className="px-8"
                >
                  <ChevronLeftIcon className="w-5 h-5 mr-2" />
                  Back
                </Button>
                
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <span>Step {currentStep + 1} of {effectiveSteps.length}</span>
                </div>
                
                {currentStep === effectiveSteps.length - 1 ? (
                  <Button 
                    onClick={handleSubmit} 
                    size="lg"
                    disabled={isPending}
                    className="px-8 bg-primary hover:bg-primary/90"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Creating Contract...
                      </>
                    ) : (
                      <>
                        <FileTextIcon className="w-5 h-5 mr-2" />
                        Create Contract
                      </>
                    )}
                  </Button>
                ) : (
                  <Button 
                    onClick={nextStep}
                    size="lg"
                    disabled={isPending}
                    className="px-8"
                  >
                    Continue
                    <ChevronRightIcon className="w-5 h-5 ml-2" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}