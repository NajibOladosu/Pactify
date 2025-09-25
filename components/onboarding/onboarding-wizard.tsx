"use client";

import React, { useState } from "react";
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
  User as UserIcon, 
  Briefcase, 
  CreditCard, 
  Shield,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Target,
  Zap,
  Users2
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
  { 
    id: 1, 
    title: "Personal Info", 
    icon: UserIcon, 
    description: "Tell us about yourself",
    color: "from-primary-500 to-primary-600"
  },
  { 
    id: 2, 
    title: "Account Type", 
    icon: Target, 
    description: "How will you use Pactify?",
    color: "from-accent-500 to-accent-600"
  },
  { 
    id: 3, 
    title: "Profile Details", 
    icon: Sparkles, 
    description: "Complete your profile",
    color: "from-secondary-500 to-secondary-600"
  },
  { 
    id: 4, 
    title: "All Set!", 
    icon: Zap, 
    description: "Ready to start creating",
    color: "from-success-500 to-success-600"
  },
];

const COMMON_SKILLS = [
  "Web Development", "Mobile Development", "UI/UX Design", "Graphic Design",
  "Content Writing", "Digital Marketing", "SEO", "Social Media Management",
  "Data Analysis", "Consulting", "Project Management", "Translation",
  "Video Editing", "Photography", "Copywriting", "WordPress Development"
];

const USER_TYPES = [
  {
    value: 'freelancer',
    title: 'Freelancer',
    description: 'I provide services and want to create contracts for clients',
    icon: UserIcon,
    gradient: 'from-primary-500 to-primary-600'
  },
  {
    value: 'client',
    title: 'Client',
    description: 'I hire freelancers and want to manage contracts',
    icon: Briefcase,
    gradient: 'from-accent-500 to-accent-600'
  },
  {
    value: 'both',
    title: 'Both',
    description: 'I both hire others and work as a freelancer',
    icon: Users2,
    gradient: 'from-secondary-500 to-secondary-600'
  }
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
      const payload = {
        ...data,
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString()
      };

      console.log('Sending onboarding data:', payload);

      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();
      console.log('Onboarding response:', responseData);

      if (!response.ok) {
        console.error('Onboarding failed:', responseData);
        throw new Error(responseData.error || 'Failed to complete onboarding');
      }

      // Force a full page refresh to ensure server-side layout gets updated profile
      window.location.href = '/dashboard?welcome=true';
    } catch (error: any) {
      console.error('Onboarding error:', error);
      alert(`Failed to complete onboarding: ${error.message}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return data.display_name.trim().length > 0;
      case 2:
        return data.user_type !== undefined;
      case 3:
        return true; // Optional fields
      case 4:
        return true;
      default:
        return false;
    }
  };

  const renderStepIndicator = () => (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        {STEPS.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const StepIcon = step.icon;
          
          return (
            <div key={step.id} className="flex items-center">
              <div className={`
                relative flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300
                ${isCompleted 
                  ? 'bg-gradient-to-r from-success-500 to-success-600 text-white shadow-lg' 
                  : isCurrent 
                    ? `bg-gradient-to-r ${step.color} text-white shadow-lg scale-110` 
                    : 'bg-muted text-muted-foreground'
                }
              `}>
                {isCompleted ? (
                  <CheckCircle className="w-6 h-6" />
                ) : (
                  <StepIcon className="w-6 h-6" />
                )}
              </div>
              {index < STEPS.length - 1 && (
                <div className={`
                  w-16 h-1 mx-2 rounded-full transition-all duration-300
                  ${isCompleted ? 'bg-success-500' : 'bg-muted'}
                `} />
              )}
            </div>
          );
        })}
      </div>
      
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-2">{STEPS[currentStep - 1].title}</h2>
        <p className="text-muted-foreground">{STEPS[currentStep - 1].description}</p>
      </div>
      
      <div className="mt-6">
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
          <span>Progress</span>
          <span>{Math.round(progress)}% complete</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>
    </div>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <Card className="border-0 shadow-lg bg-background/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center shadow-lg">
                <UserIcon className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-xl">Let's get to know you</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="display_name" className="text-sm font-medium">Display Name *</Label>
                <Input
                  id="display_name"
                  value={data.display_name}
                  onChange={(e) => setData({ ...data, display_name: e.target.value })}
                  placeholder="How should we display your name?"
                  className="mt-2"
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={data.phone}
                  onChange={(e) => setData({ ...data, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="website" className="text-sm font-medium">Website</Label>
                <Input
                  id="website"
                  type="url"
                  value={data.website}
                  onChange={(e) => setData({ ...data, website: e.target.value })}
                  placeholder="https://yourwebsite.com"
                  className="mt-2"
                />
              </div>
            </CardContent>
          </Card>
        );

      case 2:
        return (
          <Card className="border-0 shadow-lg bg-background/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-accent-500 to-accent-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Target className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-xl">How will you use Pactify?</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={data.user_type}
                onValueChange={(value: 'freelancer' | 'client' | 'both') => 
                  setData({ ...data, user_type: value })
                }
                className="space-y-4"
              >
                {USER_TYPES.map((type) => {
                  const TypeIcon = type.icon;
                  return (
                    <div key={type.value} className="relative">
                      <RadioGroupItem
                        value={type.value}
                        id={type.value}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={type.value}
                        className={`
                          flex items-center p-6 rounded-xl border-2 cursor-pointer transition-all duration-200
                          hover:border-primary-300 hover:shadow-md
                          peer-checked:border-primary-500 peer-checked:bg-primary-50 peer-checked:shadow-lg
                          dark:peer-checked:bg-primary-950/50
                        `}
                      >
                        <div className={`
                          w-12 h-12 rounded-lg bg-gradient-to-br ${type.gradient} 
                          flex items-center justify-center mr-4 shadow-md
                        `}>
                          <TypeIcon className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{type.title}</h3>
                          <p className="text-muted-foreground">{type.description}</p>
                        </div>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </CardContent>
          </Card>
        );

      case 3:
        return (
          <Card className="border-0 shadow-lg bg-background/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-secondary-500 to-secondary-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-xl">Tell us more about yourself</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {(data.user_type === 'client' || data.user_type === 'both') && (
                <div>
                  <Label htmlFor="business_name" className="text-sm font-medium">Business Name</Label>
                  <Input
                    id="business_name"
                    value={data.business_name}
                    onChange={(e) => setData({ ...data, business_name: e.target.value })}
                    placeholder="Your company or business name"
                    className="mt-2"
                  />
                </div>
              )}
              
              {(data.user_type === 'freelancer' || data.user_type === 'both') && (
                <>
                  <div>
                    <Label className="text-sm font-medium">Your Skills</Label>
                    <p className="text-sm text-muted-foreground mb-3">Select skills that match your expertise</p>
                    <div className="flex flex-wrap gap-2">
                      {COMMON_SKILLS.map((skill) => (
                        <Badge
                          key={skill}
                          variant={data.skills?.includes(skill) ? "default" : "outline"}
                          className={`
                            cursor-pointer transition-all duration-200 hover:scale-105
                            ${data.skills?.includes(skill) 
                              ? 'bg-primary-500 hover:bg-primary-600 text-white' 
                              : 'hover:bg-primary-50 hover:border-primary-300'
                            }
                          `}
                          onClick={() => handleSkillToggle(skill)}
                        >
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="bio" className="text-sm font-medium">Bio</Label>
                    <Textarea
                      id="bio"
                      value={data.bio}
                      onChange={(e) => setData({ ...data, bio: e.target.value })}
                      placeholder="Tell potential clients about yourself and your experience..."
                      className="mt-2 min-h-[100px]"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );

      case 4:
        return (
          <Card className="border-0 shadow-lg bg-background/80 backdrop-blur-sm text-center">
            <CardContent className="pt-12 pb-8">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-success-500 to-success-600 rounded-3xl flex items-center justify-center shadow-xl">
                <Zap className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl font-serif font-bold mb-4">You're all set!</h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto">
                Welcome to Pactify! You can now start creating contracts, managing payments, and building successful business relationships.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 text-sm">
                <div className="p-4 rounded-lg bg-primary-50 dark:bg-primary-950/20">
                  <div className="w-8 h-8 mx-auto mb-2 bg-primary-500 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-white" />
                  </div>
                  <p className="font-medium">Profile Complete</p>
                </div>
                <div className="p-4 rounded-lg bg-accent-50 dark:bg-accent-950/20">
                  <div className="w-8 h-8 mx-auto mb-2 bg-accent-500 rounded-lg flex items-center justify-center">
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <p className="font-medium">Secure & Protected</p>
                </div>
                <div className="p-4 rounded-lg bg-success-50 dark:bg-success-950/20">
                  <div className="w-8 h-8 mx-auto mb-2 bg-success-500 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-white" />
                  </div>
                  <p className="font-medium">Ready for Payments</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {renderStepIndicator()}
      
      <div className="mb-8">
        {renderStepContent()}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
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
            disabled={!isStepValid()}
            className="flex items-center gap-2 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            onClick={handleComplete}
            disabled={isLoading || !isStepValid()}
            className="flex items-center gap-2 bg-gradient-to-r from-success-500 to-success-600 hover:from-success-600 hover:to-success-700"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Setting up...
              </>
            ) : (
              <>
                Get Started
                <Zap className="w-4 h-4" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}