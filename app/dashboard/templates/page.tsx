"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { FileTextIcon, PlusIcon, SearchIcon, FilterIcon, StarIcon, TagIcon } from "lucide-react";

// This would come from an API or database in a real implementation
const TEMPLATES = [
  {
    id: "basic-freelance",
    name: "Basic Freelance Agreement",
    description: "A simple agreement for freelance work with basic terms and conditions.",
    category: "General",
    premium: false,
    popularity: 87,
  },
  {
    id: "web-development",
    name: "Web Development Contract",
    description: "Comprehensive contract for website development projects.",
    category: "Web Development",
    premium: false,
    popularity: 92,
  },
  {
    id: "graphic-design",
    name: "Graphic Design Contract",
    description: "For design services including logo design, branding, and illustrations.",
    category: "Design",
    premium: false,
    popularity: 78,
  },
  {
    id: "consulting-agreement",
    name: "Consulting Agreement",
    description: "Professional consulting services agreement with detailed terms.",
    category: "Consulting",
    premium: true,
    popularity: 65,
  },
  {
    id: "social-media-management",
    name: "Social Media Management Contract",
    description: "Agreement for managing social media accounts and content creation.",
    category: "Marketing",
    premium: true,
    popularity: 74,
  },
  {
    id: "content-writing",
    name: "Content Writing Agreement",
    description: "Contract for blog posts, articles, and other written content.",
    category: "Writing",
    premium: true,
    popularity: 61,
  },
];

export default function TemplatesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showPremiumOnly, setShowPremiumOnly] = useState(false);

  // Filter templates based on search query and filters
  const filteredTemplates = TEMPLATES.filter((template) => {
    // Filter by search query
    const matchesSearch = 
      searchQuery === "" || 
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Filter by category
    const matchesCategory = 
      selectedCategory === null || 
      template.category === selectedCategory;
    
    // Filter by premium status
    const matchesPremium = 
      !showPremiumOnly || 
      template.premium;
    
    return matchesSearch && matchesCategory && matchesPremium;
  });

  // Get unique categories for filter
  const categories = Array.from(new Set(TEMPLATES.map(t => t.category)));

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold">Contract Templates</h1>
          <p className="text-muted-foreground mt-1">Browse and manage your contract templates.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/templates/new">
            <PlusIcon className="mr-2 h-4 w-4" />
            Create Template
          </Link>
        </Button>
      </div>

      {/* Search and Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search templates..." 
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Filter by:</span>
            <div className="flex flex-wrap gap-2">
              <Badge 
                variant={selectedCategory === null ? "default" : "outline"} 
                className="rounded-full px-3 cursor-pointer"
                onClick={() => setSelectedCategory(null)}
              >
                All
              </Badge>
              
              {categories.map((category) => (
                <Badge 
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"} 
                  className="rounded-full px-3 cursor-pointer"
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </Badge>
              ))}
              
              <Badge 
                variant={showPremiumOnly ? "default" : "outline"} 
                className="rounded-full px-3 cursor-pointer"
                onClick={() => setShowPremiumOnly(!showPremiumOnly)}
              >
                Premium Only
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Templates Grid */}
      {filteredTemplates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardHeader className="pb-3 relative">
                {template.premium && (
                  <div className="absolute top-4 right-4">
                    <Badge className="bg-primary-500">
                      <StarIcon className="h-3 w-3 mr-1" />
                      Premium
                    </Badge>
                  </div>
                )}
                <CardTitle className="text-lg">{template.name}</CardTitle>
                <CardDescription className="line-clamp-2">{template.description}</CardDescription>
              </CardHeader>
              <CardContent className="pb-6">
                <div className="flex items-center justify-between mb-4">
                  <Badge variant="outline" className="flex items-center gap-1">
                    <TagIcon className="h-3 w-3" />
                    {template.category}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center">
                    <StarIcon className="h-3 w-3 mr-1 fill-amber-400 stroke-amber-400" />
                    {template.popularity}% popularity
                  </span>
                </div>
                
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" size="sm">Preview</Button>
                  <Button size="sm" asChild>
                    <Link href={`/dashboard/contracts/new?template=${template.id}`}>
                      Use Template
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg bg-muted/30">
          <FileTextIcon className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium mb-2">No templates found</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            {searchQuery || selectedCategory || showPremiumOnly
              ? "No templates match your current search and filters. Try adjusting your criteria."
              : "You don't have any templates yet. Create your first custom template or use one of our pre-made ones."}
          </p>
          <Button asChild>
            <Link href="/dashboard/templates/new">
              <PlusIcon className="mr-2 h-4 w-4" />
              Create Template
            </Link>
          </Button>
        </div>
      )}

      {/* Template Gallery Promo */}
      <Card className="bg-gradient-to-r from-primary-500/10 to-secondary-500/10 border-0 shadow-md mt-12">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-xl font-medium mb-2">Need more templates?</h3>
              <p className="text-muted-foreground">
                Explore our template gallery for industry-specific contracts and agreements.
                Upgrade to a paid plan to access premium templates.
              </p>
            </div>
            <Button asChild>
              <Link href="/templates">
                View Template Gallery
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
