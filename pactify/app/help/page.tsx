import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Search, FileText, MessageSquare, Video, BookOpen, HelpCircle } from "lucide-react";

export const metadata = {
  title: "Help Center | Pactify",
  description: "Find answers to common questions and learn how to get the most out of Pactify's contract and payment platform.",
};

export default function HelpPage() {
  // Mock FAQ data
  const faqs = [
    {
      question: "How do I create my first contract?",
      answer: "Navigate to your dashboard and click 'New Contract.' You can start from scratch or choose a template, then fill in your specific requirements and send it to your client for review and signature."
    },
    {
      question: "What happens if a client doesn't sign the contract?",
      answer: "Contracts will remain in 'Pending' status until signed. You can send reminders directly through the platform or cancel the contract if needed."
    },
    {
      question: "How does the escrow payment system work?",
      answer: "When a milestone is created, the client funds the escrow. The money is held securely until you complete the work and the client approves it, at which point the funds are released to you."
    },
    {
      question: "What if there's a dispute about the completed work?",
      answer: "Both parties can raise a dispute through the platform. For Free and Professional plans, we offer mediation guidance. Business plans include direct dispute resolution support."
    },
    {
      question: "Can I upgrade or downgrade my subscription plan?",
      answer: "Yes, you can change your plan at any time from your account settings. Changes take effect at the beginning of your next billing cycle."
    },
    {
      question: "Are the contracts legally binding?",
      answer: "Yes, contracts created on Pactify are legally binding in most jurisdictions when properly executed with valid electronic signatures from all parties."
    }
  ];

  // Help Center categories
  const categories = [
    {
      icon: <FileText className="h-8 w-8 text-primary-500" />,
      title: "Contract Guides",
      description: "Step-by-step tutorials for creating and managing effective contracts",
      link: "/help/contracts"
    },
    {
      icon: <MessageSquare className="h-8 w-8 text-primary-500" />,
      title: "Communication",
      description: "Learn how to effectively communicate with clients and team members",
      link: "/help/communication"
    },
    {
      icon: <BookOpen className="h-8 w-8 text-primary-500" />,
      title: "Documentation",
      description: "Detailed documentation on all Pactify features and capabilities",
      link: "/help/docs"
    },
    {
      icon: <Video className="h-8 w-8 text-primary-500" />,
      title: "Video Tutorials",
      description: "Watch walkthrough videos on using the Pactify platform",
      link: "/help/videos"
    }
  ];

  return (
    <>
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-background to-primary-50 dark:from-background dark:to-primary-900/10 py-20">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-10">
            <Badge className="mb-4">Support</Badge>
            <h1 className="text-4xl md:text-5xl font-serif font-bold mb-6">
              Help Center
            </h1>
            <p className="text-foreground/70 text-lg md:text-xl max-w-3xl mx-auto mb-8">
              Find answers to common questions and learn how to get the most out of Pactify.
            </p>
            <div className="relative max-w-xl mx-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" />
              <input 
                type="search" 
                placeholder="Search for help articles..."
                className="flex h-12 w-full rounded-md border border-input bg-background pl-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-2xl font-serif font-bold text-center mb-10">Browse Help Categories</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
            {categories.map((category, index) => (
              <Card key={index} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <div className="mb-4 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-full">
                    {category.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-2">{category.title}</h3>
                  <p className="text-foreground/70 mb-4">{category.description}</p>
                  <Button variant="outline" asChild className="mt-auto">
                    <Link href={category.link}>Browse Articles</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-gradient-to-b from-background to-primary-50 dark:from-background dark:to-primary-900/10">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-3xl font-serif font-bold text-center mb-10">Frequently Asked Questions</h2>
          
          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <div key={index} className="border bg-background rounded-lg p-6">
                <h3 className="text-xl font-bold mb-3 flex items-start gap-3">
                  <HelpCircle className="h-6 w-6 text-primary-500 shrink-0 mt-1" />
                  <span>{faq.question}</span>
                </h3>
                <p className="text-foreground/70 pl-9">{faq.answer}</p>
              </div>
            ))}
          </div>
          
          <div className="mt-12 text-center">
            <p className="text-lg mb-6">Didn't find what you're looking for?</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild>
                <Link href="/contact">Contact Support</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/help/docs">Browse Documentation</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
