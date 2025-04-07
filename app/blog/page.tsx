import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Link from "next/link";

export const metadata = {
  title: "Blog | Pactify",
  description: "Stay updated with the latest insights, tips, and news about freelance contracts, legal considerations, and secure payments.",
};

export default function BlogPage() {
  // Mock blog posts data
  const blogPosts = [
    {
      id: 1,
      title: "5 Essential Clauses Every Freelance Contract Should Include",
      excerpt: "Learn about the key contract clauses that protect both freelancers and clients, ensuring clear expectations and preventing disputes.",
      author: "David Chen",
      role: "Chief Legal Officer",
      date: "June 20, 2024",
      category: "Contracts",
      image: null,
    },
    {
      id: 2,
      title: "The Beginner's Guide to Escrow Payments for Freelancers",
      excerpt: "Discover how escrow payments work, why they provide security for both parties, and how to implement them in your freelance business.",
      author: "Maya Rodriguez",
      role: "Co-Founder & CTO",
      date: "June 15, 2024",
      category: "Payments",
      image: null,
    },
    {
      id: 3,
      title: "How to Handle Contract Disputes Gracefully",
      excerpt: "Conflicts happen even with the best contracts. Learn proven strategies for resolving disputes while maintaining professional relationships.",
      author: "Alex Johnson",
      role: "Co-Founder & CEO",
      date: "June 7, 2024",
      category: "Best Practices",
      image: null,
    },
    {
      id: 4,
      title: "The Future of Digital Signatures and Blockchain Verification",
      excerpt: "Explore how emerging technologies are making digital contracts more secure, verifiable, and legally binding than ever before.",
      author: "Maya Rodriguez",
      role: "Co-Founder & CTO",
      date: "May 25, 2024",
      category: "Technology",
      image: null,
    },
    {
      id: 5,
      title: "Setting Milestone Payments: A Guide for Complex Projects",
      excerpt: "Breaking down large projects into manageable milestones benefits everyone. Learn how to structure payments fairly and effectively.",
      author: "David Chen",
      role: "Chief Legal Officer",
      date: "May 18, 2024",
      category: "Payments",
      image: null,
    },
    {
      id: 6,
      title: "Client Communication Best Practices for Freelancers",
      excerpt: "Effective communication is essential for successful freelance relationships. Discover tools and strategies to keep clients informed and happy.",
      author: "Alex Johnson",
      role: "Co-Founder & CEO",
      date: "May 10, 2024",
      category: "Best Practices",
      image: null,
    }
  ];

  // Categories for the filter
  const categories = ["All", "Contracts", "Payments", "Best Practices", "Technology", "Legal", "Industry News"];

  return (
    <>
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-background to-primary-50 dark:from-background dark:to-primary-900/10 py-20">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-16">
            <Badge className="mb-4">Resources</Badge>
            <h1 className="text-4xl md:text-5xl font-serif font-bold mb-6">
              Pactify Blog
            </h1>
            <p className="text-foreground/70 text-lg md:text-xl max-w-3xl mx-auto">
              Insights, tips, and news about freelance contracts, legal considerations, and secure payments.
            </p>
          </div>
        </div>
      </section>

      {/* Blog Content */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Filter categories */}
          <div className="mb-12 flex flex-wrap gap-2 justify-center">
            {categories.map((category, index) => (
              <Button 
                key={index} 
                variant={index === 0 ? "default" : "outline"} 
                size="sm"
              >
                {category}
              </Button>
            ))}
          </div>

          {/* Blog posts grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {blogPosts.map((post) => (
              <Card key={post.id} className="overflow-hidden flex flex-col h-full">
                <div className="aspect-video bg-muted flex items-center justify-center text-muted-foreground">
                  {post.image ? (
                    <img 
                      src={post.image} 
                      alt={post.title} 
                      className="w-full h-full object-cover" 
                    />
                  ) : (
                    <span>Featured Image</span>
                  )}
                </div>
                <div className="p-6 flex flex-col flex-grow">
                  <div className="flex items-center gap-2 mb-4">
                    <Badge variant="secondary" className="text-xs">
                      {post.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{post.date}</span>
                  </div>
                  <h2 className="text-xl font-bold mb-3">
                    <Link 
                      href={`/blog/${post.id}`} 
                      className="hover:text-primary-500 transition-colors"
                    >
                      {post.title}
                    </Link>
                  </h2>
                  <p className="text-foreground/70 mb-4 flex-grow">{post.excerpt}</p>
                  <div className="flex items-center mt-4">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-sm">
                      {post.author.charAt(0)}
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium">{post.author}</p>
                      <p className="text-xs text-muted-foreground">{post.role}</p>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-12 flex justify-center gap-2">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <Button variant="outline" size="sm" className="bg-primary-50 dark:bg-primary-900/20">
              1
            </Button>
            <Button variant="outline" size="sm">
              2
            </Button>
            <Button variant="outline" size="sm">
              3
            </Button>
            <Button variant="outline" size="sm">
              Next
            </Button>
          </div>
        </div>
      </section>

      {/* Newsletter Section */}
      <section className="py-16 bg-gradient-to-b from-background to-primary-50 dark:from-background dark:to-primary-900/10">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <h2 className="text-3xl font-serif font-bold mb-6">Stay Updated</h2>
          <p className="text-foreground/70 mb-8">
            Subscribe to our newsletter to receive the latest articles, tips, and updates directly in your inbox.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input 
              type="email" 
              placeholder="Your email address"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <Button>Subscribe</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            We respect your privacy. Unsubscribe at any time.
          </p>
        </div>
      </section>
    </>
  );
}
