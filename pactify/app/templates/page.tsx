import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FileTextIcon, StarIcon, TagIcon, CheckIcon, ArrowRightIcon } from "lucide-react";

// This would come from an API or database in a real implementation
const TEMPLATES_CATEGORIES = [
  {
    name: "Popular Templates",
    templates: [
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
    ]
  },
  {
    name: "Premium Templates",
    description: "Available with Professional and Business plans",
    templates: [
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
    ]
  },
  {
    name: "Industry-Specific Templates",
    templates: [
      {
        id: "software-development",
        name: "Software Development Agreement",
        description: "Detailed contract for software development projects with milestones.",
        category: "Technology",
        premium: true,
        popularity: 85,
      },
      {
        id: "photography-contract",
        name: "Photography Service Contract",
        description: "For photography services including sessions, editing, and delivery.",
        category: "Photography",
        premium: true,
        popularity: 79,
      },
      {
        id: "coaching-agreement",
        name: "Coaching Services Agreement",
        description: "For life, business, or career coaching services.",
        category: "Coaching",
        premium: true,
        popularity: 71,
      },
    ]
  }
];

// This would come from an API call or database
const CATEGORIES = [
  "Web Development", 
  "Design", 
  "Writing", 
  "Consulting", 
  "Marketing", 
  "Technology", 
  "Photography", 
  "Coaching", 
  "Legal", 
  "Finance", 
  "E-commerce"
];

export const metadata = {
  title: "Contract Templates | Pactify",
  description: "Browse our library of contract templates for freelancers and clients",
};

export default function TemplatesPage() {
  return (
    <div className="flex-1">
      {/* Hero section */}
      <div className="w-full bg-gradient-to-r from-primary-500/10 via-background to-secondary-500/10 py-16">
        <div className="container mx-auto px-4 max-w-7xl text-center">
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">Contract Templates</h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Choose from our library of professional, legally-vetted contract templates designed for freelancers and clients.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Get Started for Free
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/pricing">
                View Pricing
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Categories section */}
      <div className="container mx-auto px-4 max-w-7xl py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-serif font-bold mb-4">Browse by Category</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Find the perfect template for your specific industry and project needs.
          </p>
        </div>
        
        <div className="flex flex-wrap justify-center gap-3">
          {CATEGORIES.map((category) => (
            <Badge 
              key={category}
              variant="outline" 
              className="px-4 py-2 text-sm cursor-pointer hover:bg-accent transition-colors"
            >
              {category}
            </Badge>
          ))}
        </div>
      </div>

      {/* Templates by category */}
      <div className="bg-muted/30 py-16">
        <div className="container mx-auto px-4 max-w-7xl">
          {TEMPLATES_CATEGORIES.map((categoryGroup, groupIndex) => (
            <div key={categoryGroup.name} className={`mb-16 ${groupIndex !== 0 ? 'pt-8' : ''}`}>
              <div className="flex justify-between items-end mb-8">
                <div>
                  <h2 className="text-2xl font-serif font-bold">{categoryGroup.name}</h2>
                  {categoryGroup.description && (
                    <p className="text-muted-foreground">{categoryGroup.description}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="gap-1" asChild>
                  <Link href={`/templates#${categoryGroup.name.toLowerCase().replace(/\s+/g, '-')}`}>
                    View all <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {categoryGroup.templates.map((template) => (
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
                          <Link href={template.premium ? "/pricing" : "/sign-up"}>
                            {template.premium ? "Upgrade to Use" : "Use Template"}
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Features section */}
      <div className="container mx-auto px-4 max-w-7xl py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-serif font-bold mb-4">Why Use Pactify Templates?</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Our templates are designed to make your freelance business more professional and secure.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="p-6 border rounded-lg">
            <div className="h-12 w-12 rounded-full bg-primary-500/10 flex items-center justify-center mb-4">
              <CheckIcon className="h-6 w-6 text-primary-500" />
            </div>
            <h3 className="text-xl font-medium mb-2">Legally Vetted</h3>
            <p className="text-muted-foreground">
              All templates are created and reviewed by legal professionals to ensure they're legally binding.
            </p>
          </div>
          
          <div className="p-6 border rounded-lg">
            <div className="h-12 w-12 rounded-full bg-primary-500/10 flex items-center justify-center mb-4">
              <CheckIcon className="h-6 w-6 text-primary-500" />
            </div>
            <h3 className="text-xl font-medium mb-2">Easy to Customize</h3>
            <p className="text-muted-foreground">
              Quickly customize any template to fit your specific needs with our intuitive contract editor.
            </p>
          </div>
          
          <div className="p-6 border rounded-lg">
            <div className="h-12 w-12 rounded-full bg-primary-500/10 flex items-center justify-center mb-4">
              <CheckIcon className="h-6 w-6 text-primary-500" />
            </div>
            <h3 className="text-xl font-medium mb-2">Industry Specific</h3>
            <p className="text-muted-foreground">
              Choose from templates designed for your specific industry and type of work.
            </p>
          </div>
          
          <div className="p-6 border rounded-lg">
            <div className="h-12 w-12 rounded-full bg-primary-500/10 flex items-center justify-center mb-4">
              <CheckIcon className="h-6 w-6 text-primary-500" />
            </div>
            <h3 className="text-xl font-medium mb-2">Digital Signatures</h3>
            <p className="text-muted-foreground">
              Get contracts signed quickly with our secure digital signature system.
            </p>
          </div>
          
          <div className="p-6 border rounded-lg">
            <div className="h-12 w-12 rounded-full bg-primary-500/10 flex items-center justify-center mb-4">
              <CheckIcon className="h-6 w-6 text-primary-500" />
            </div>
            <h3 className="text-xl font-medium mb-2">Secure Storage</h3>
            <p className="text-muted-foreground">
              All your contracts are securely stored in your account for easy access anytime.
            </p>
          </div>
          
          <div className="p-6 border rounded-lg">
            <div className="h-12 w-12 rounded-full bg-primary-500/10 flex items-center justify-center mb-4">
              <CheckIcon className="h-6 w-6 text-primary-500" />
            </div>
            <h3 className="text-xl font-medium mb-2">Integrated Payments</h3>
            <p className="text-muted-foreground">
              Connect contracts to our escrow payment system for secure transactions.
            </p>
          </div>
        </div>
      </div>
      
      {/* CTA section */}
      <div className="bg-primary-500 text-white py-16">
        <div className="container mx-auto px-4 max-w-7xl text-center">
          <h2 className="text-3xl font-serif font-bold mb-4">Ready to create professional contracts?</h2>
          <p className="text-xl opacity-90 max-w-2xl mx-auto mb-8">
            Join thousands of freelancers and clients who use Pactify to create legally binding contracts.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button size="lg" variant="secondary" asChild>
              <Link href="/sign-up">
                Get Started for Free
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="bg-transparent border-white hover:bg-white/10" asChild>
              <Link href="/pricing">
                View Pricing Plans
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
