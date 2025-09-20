"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle, 
  User, 
  Briefcase, 
  CreditCard, 
  Shield,
  ArrowRight,
  ArrowLeft 
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

interface OnboardingWizardProps {
  user: User;
  profile: any;
}

interface OnboardingData {
  display_name: string;
  user_type: 'freelancer' | 'client' | 'both';
  business_name?: string;
  skills?: string[];
  bio?: string;
  website?: string;
  phone?: string;
}

const STEPS = [
  { id: 1, title: "Personal Info", icon: User, description: "Tell us about yourself" },
  { id: 2, title: "Account Type", icon: Briefcase, description: "How will you use Pactify?" },
  { id: 3, title: "Profile Details", icon: Shield, description: "Complete your profile" },
  { id: 4, title: "Payment Setup", icon: CreditCard, description: "Set up your payments" },
];

const COMMON_SKILLS = [
  "Web Development", "Mobile Development", "UI/UX Design", "Graphic Design",
  "Content Writing", "Digital Marketing", "SEO", "Social Media Management",
  "Data Analysis", "Consulting", "Project Management", "Translation",
  "Video Editing", "Photography", "Copywriting", "WordPress Development"
];

export default function OnboardingWizard({ user, profile }: OnboardingWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    display_name: profile?.display_name || user.user_metadata?.full_name || '',
    user_type: profile?.user_type || 'both',
    business_name: profile?.business_name || '',
    skills: profile?.skills || [],
    bio: profile?.bio || '',
    website: profile?.website || '',
    phone: profile?.phone || ''
  });

  const progress = (currentStep / STEPS.length) * 100;

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkillToggle = (skill: string) => {
    const skills = data.skills || [];
    if (skills.includes(skill)) {
      setData({ ...data, skills: skills.filter(s => s !== skill) });
    } else {
      setData({ ...data, skills: [...skills, skill] });
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    
    try {
      // Save onboarding data
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString()
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to complete onboarding');
      }

      // Redirect to dashboard
      router.push('/dashboard?welcome=true');
    } catch (error) {
      console.error('Onboarding error:', error);
      alert('Failed to complete onboarding. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="display_name">Display Name *</Label>
              <Input
                id="display_name"
                value={data.display_name}
                onChange={(e) => setData({ ...data, display_name: e.target.value })}
                placeholder="How should we display your name?"
                required
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={data.phone}
                onChange={(e) => setData({ ...data, phone: e.target.value })}
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div>
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                value={data.website}
                onChange={(e) => setData({ ...data, website: e.target.value })}
                placeholder="https://yourwebsite.com"
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium">How will you use Pactify?</Label>
              <RadioGroup
                value={data.user_type}
                onValueChange={(value) => setData({ ...data, user_type: value as any })}
                className="mt-3"
              >
                <div className="space-y-3">
                  <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50">
                    <RadioGroupItem value="freelancer" id="freelancer" />
                    <div className="flex-1">
                      <Label htmlFor="freelancer" className="font-medium">
                        🎯 Freelancer
                      </Label>
                      <p className="text-sm text-gray-600">
                        I provide services and want to receive payments
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50">
                    <RadioGroupItem value="client" id="client" />
                    <div className="flex-1">
                      <Label htmlFor="client" className="font-medium">
                        💼 Client
                      </Label>
                      <p className="text-sm text-gray-600">
                        I hire freelancers and want to manage projects
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50">
                    <RadioGroupItem value="both" id="both" />
                    <div className="flex-1">
                      <Label htmlFor="both" className="font-medium">
                        🔄 Both
                      </Label>
                      <p className="text-sm text-gray-600">
                        I both hire freelancers and provide services
                      </p>
                    </div>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {(data.user_type === 'client' || data.user_type === 'both') && (
              <div>
                <Label htmlFor="business_name">Business/Company Name</Label>
                <Input
                  id="business_name"
                  value={data.business_name}
                  onChange={(e) => setData({ ...data, business_name: e.target.value })}
                  placeholder="Your company name"
                />
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="bio">Bio/Description</Label>
              <Textarea
                id="bio"
                value={data.bio}
                onChange={(e) => setData({ ...data, bio: e.target.value })}
                placeholder="Tell us about yourself and what you do..."
                rows={4}
              />
            </div>

            {(data.user_type === 'freelancer' || data.user_type === 'both') && (
              <div>
                <Label className="text-base font-medium">Skills & Services</Label>
                <p className="text-sm text-gray-600 mb-3">
                  Select skills that match your expertise (optional)
                </p>
                <div className="flex flex-wrap gap-2">
                  {COMMON_SKILLS.map((skill) => (
                    <Badge
                      key={skill}
                      variant={data.skills?.includes(skill) ? "default" : "outline"}
                      className="cursor-pointer hover:bg-primary-100"
                      onClick={() => handleSkillToggle(skill)}
                    >
                      {skill}
                    </Badge>
                  ))}
                </div>
                {data.skills && data.skills.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-gray-700">
                      Selected: {data.skills.length} skills
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">You're Almost Ready!</h3>
              <p className="text-gray-600 mb-6">
                Your profile is set up. You can configure payment methods later when you need them.
              </p>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Next Steps:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Set up payment methods when you're ready to transact</li>
                <li>• Complete KYC verification for higher transaction limits</li>
                <li>• Create your first contract or browse available opportunities</li>
                <li>• Explore templates to get started quickly</li>
              </ul>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Profile Summary:</h4>
              <div className="text-sm text-gray-700 space-y-1">
                <p><strong>Name:</strong> {data.display_name}</p>
                <p><strong>Type:</strong> {data.user_type}</p>
                {data.business_name && <p><strong>Business:</strong> {data.business_name}</p>}
                {data.skills && data.skills.length > 0 && (
                  <p><strong>Skills:</strong> {data.skills.join(', ')}</p>
                )}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between mb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              {React.createElement(STEPS[currentStep - 1].icon, { className: "w-5 h-5" })}
              {STEPS[currentStep - 1].title}
            </CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              {STEPS[currentStep - 1].description}
            </p>
          </div>
          <div className="text-sm text-gray-500">
            Step {currentStep} of {STEPS.length}
          </div>
        </div>
        <Progress value={progress} className="h-2" />
      </CardHeader>

      <CardContent>
        <div className="mb-8">
          {renderStepContent()}
        </div>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          {currentStep < STEPS.length ? (
            <Button
              onClick={handleNext}
              disabled={!data.display_name && currentStep === 1}
              className="flex items-center gap-2"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleComplete}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              {isLoading ? 'Completing...' : 'Complete Setup'}
              <CheckCircle className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}