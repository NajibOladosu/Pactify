"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";

interface ProfileUpdateFormProps {
  user: {
    id: string;
    email: string | null;
  };
  profile: {
    display_name: string | null;
    company_name: string | null;
    website: string | null;
    bio: string | null;
  } | null;
}

export function ProfileUpdateForm({ user, profile }: ProfileUpdateFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState({
    display_name: profile?.display_name || "",
    company_name: profile?.company_name || "",
    website: profile?.website || "",
    bio: profile?.bio || "",
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    startTransition(async () => {
      try {
        const response = await fetch('/api/profile/update-secure', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            display_name: formData.display_name.trim() || null,
            company_name: formData.company_name.trim() || null,
            website: formData.website.trim() || null,
            bio: formData.bio.trim() || null,
            user_id: user.id, // Include user ID for verification
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          toast({
            title: "Error",
            description: result.error || "Failed to update profile",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Success",
          description: "Profile updated successfully!",
        });
        
        // Force a hard refresh to ensure updated data is shown
        window.location.reload();
        
      } catch (error: any) {
        console.error("Error updating profile:", error);
        toast({
          title: "Error",
          description: "An unexpected error occurred",
          variant: "destructive",
        });
      }
    });
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <Label htmlFor="display_name">Full Name</Label>
          <Input
            id="display_name"
            value={formData.display_name}
            onChange={(e) => handleInputChange("display_name", e.target.value)}
            placeholder="Your name"
          />
        </div>
        <div>
          <Label htmlFor="email">Email Address</Label>
          <Input 
            id="email" 
            type="email" 
            value={user.email || ""}
            disabled
          />
          <p className="text-xs text-muted-foreground mt-1">Email address cannot be changed</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <Label htmlFor="company">Company Name</Label>
          <Input
            id="company"
            value={formData.company_name}
            onChange={(e) => handleInputChange("company_name", e.target.value)}
            placeholder="Your company name"
          />
        </div>
        <div>
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            value={formData.website}
            onChange={(e) => handleInputChange("website", e.target.value)}
            placeholder="https://your-website.com"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="bio">Bio</Label>
        <textarea
          id="bio"
          value={formData.bio}
          onChange={(e) => handleInputChange("bio", e.target.value)}
          className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Tell others about yourself or your business..."
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}