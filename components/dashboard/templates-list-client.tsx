"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { FileTextIcon, PlusIcon, SearchIcon, StarIcon, TagIcon } from "lucide-react";
import { TemplateWithData } from "@/app/(dashboard)/dashboard/templates/page";

interface TemplatesListClientProps {
  initialTemplates: TemplateWithData[];
  categories: string[];
}

export function TemplatesListClient({ initialTemplates, categories }: TemplatesListClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showPremiumOnly, setShowPremiumOnly] = useState(false);

  // Filter templates based on search query and filters
  const filteredTemplates = initialTemplates.filter((template) => {
    // Filter by search query
    const matchesSearch = 
      searchQuery === "" || 
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (template.description && template.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // Filter by category
    const matchesCategory = 
      selectedCategory === null || 
      template.category === selectedCategory;
    
    // Filter by premium status
    const matchesPremium = 
      !showPremiumOnly || 
      template.is_premium;
    
    return matchesSearch && matchesCategory && matchesPremium;
  });

  return (
    <>
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
                {template.is_premium && (
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
                    {template.category || 'General'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Created {template.created_at ? new Date(template.created_at).toLocaleDateString() : 'N/A'}
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
              : "No templates are available yet. Create your first custom template or contact support to add pre-made ones."}
          </p>
          <Button asChild>
            <Link href="/dashboard/templates/new">
              <PlusIcon className="mr-2 h-4 w-4" />
              Create Template
            </Link>
          </Button>
        </div>
      )}
    </>
  );
}