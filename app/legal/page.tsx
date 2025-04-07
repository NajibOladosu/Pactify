import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { FileText, Scale, Shield, Download } from "lucide-react";

export const metadata = {
  title: "Legal Resources | Pactify",
  description: "Access legal resources, templates, and guides to help you navigate contract law for freelancers and clients.",
};

export default function LegalResourcesPage() {
  // Mock legal resources data
  const resources = [
    {
      icon: <FileText className="h-6 w-6 text-primary-500" />,
      title: "Contract Template Library",
      description: "Access our full library of legally-vetted contract templates for various industries and use cases.",
      link: "/templates"
    },
    {
      icon: <Scale className="h-6 w-6 text-primary-500" />,
      title: "Legal Guides",
      description: "Comprehensive guides on contract law, intellectual property rights, and legal considerations for freelancers.",
      link: "/legal/guides"
    },
    {
      icon: <Shield className="h-6 w-6 text-primary-500" />,
      title: "Compliance Resources",
      description: "Resources to help you ensure your contracts comply with relevant regulations and laws.",
      link: "/legal/compliance"
    },
    {
      icon: <Download className="h-6 w-6 text-primary-500" />,
      title: "Downloadable Documents",
      description: "Additional legal documents and forms you may need in your freelance business.",
      link: "/legal/documents"
    }
  ];

  // Mock legal articles data
  const articles = [
    {
      title: "Understanding Intellectual Property Rights in Freelance Contracts",
      excerpt: "Learn about the different types of intellectual property and how to properly address ownership in your contracts.",
      readTime: "7 min read",
      link: "/legal/guides/intellectual-property"
    },
    {
      title: "Force Majeure Clauses in the Post-Pandemic Era",
      excerpt: "How to craft effective force majeure clauses that protect both parties in unforeseen circumstances.",
      readTime: "5 min read",
      link: "/legal/guides/force-majeure"
    },
    {
      title: "International Contract Considerations",
      excerpt: "Key legal points to consider when entering into contracts with clients in different countries.",
      readTime: "8 min read",
      link: "/legal/guides/international-contracts"
    },
    {
      title: "Non-Disclosure Agreements: When and How to Use Them",
      excerpt: "Best practices for incorporating NDAs into your freelance workflow to protect sensitive information.",
      readTime: "6 min read",
      link: "/legal/guides/ndas"
    }
  ];

  return (
    <>
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-background to-primary-50 dark:from-background dark:to-primary-900/10 py-20">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-16">
            <Badge className="mb-4">Legal Resources</Badge>
            <h1 className="text-4xl md:text-5xl font-serif font-bold mb-6">
              Legal Tools for Freelancers and Clients
            </h1>
            <p className="text-foreground/70 text-lg md:text-xl max-w-3xl mx-auto">
              Access expert legal resources, templates, and guides to help you create secure and enforceable contracts.
            </p>
          </div>
        </div>
      </section>

      {/* Resources Section */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-3xl font-serif font-bold text-center mb-12">Legal Resource Center</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
            {resources.map((resource, index) => (
              <Card key={index} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="mb-4 p-3 w-fit bg-primary-50 dark:bg-primary-900/20 rounded-full">
                    {resource.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-2">{resource.title}</h3>
                  <p className="text-foreground/70 mb-4">{resource.description}</p>
                  <Button variant="outline" asChild>
                    <Link href={resource.link}>Access Resources</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Legal Articles Section */}
      <section className="py-16 bg-gradient-to-b from-background to-primary-50 dark:from-background dark:to-primary-900/10">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-3xl font-serif font-bold text-center mb-12">Featured Legal Articles</h2>
          
          <div className="space-y-6">
            {articles.map((article, index) => (
              <Card key={index} className="overflow-hidden hover:shadow-md transition-shadow">
                <Link href={article.link}>
                  <CardContent className="p-6">
                    <h3 className="text-xl font-bold mb-2 hover:text-primary-500 transition-colors">
                      {article.title}
                    </h3>
                    <p className="text-foreground/70 mb-4">{article.excerpt}</p>
                    <p className="text-sm text-muted-foreground">{article.readTime}</p>
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div>
          
          <div className="mt-10 text-center">
            <Button asChild>
              <Link href="/legal/guides">View All Articles</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Legal Services Section */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-3xl font-serif font-bold mb-6">Need Personalized Legal Advice?</h2>
          <p className="text-foreground/70 text-lg mb-8 max-w-3xl mx-auto">
            While Pactify provides resources to help you understand contract law, sometimes you need specific legal advice 
            tailored to your situation. Our partner network of legal professionals specializes in freelance and contract law.
          </p>
          
          <Card className="mb-8 bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800">
            <CardContent className="p-8">
              <h3 className="text-xl font-bold mb-4">Disclaimer</h3>
              <p className="text-foreground/70">
                The resources provided on Pactify are for informational purposes only and do not constitute legal advice. 
                For specific legal questions, please consult with a qualified attorney licensed in your jurisdiction.
              </p>
            </CardContent>
          </Card>
          
          <Button size="lg" asChild>
            <Link href="/contact">Connect With Legal Experts</Link>
          </Button>
        </div>
      </section>

      {/* Terms & Privacy Section */}
      <section className="py-16 bg-gradient-to-b from-background to-primary-50 dark:from-background dark:to-primary-900/10">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-3xl font-serif font-bold text-center mb-12">Pactify Legal Documents</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-xl font-bold mb-4">Terms of Service</h3>
                <p className="text-foreground/70 mb-4">
                  Our Terms of Service outline the rules, guidelines, and obligations that govern the use of the Pactify platform.
                </p>
                <Button variant="outline" asChild>
                  <Link href="/terms">Read Terms of Service</Link>
                </Button>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <h3 className="text-xl font-bold mb-4">Privacy Policy</h3>
                <p className="text-foreground/70 mb-4">
                  Our Privacy Policy explains how we collect, use, and protect your personal information when you use Pactify.
                </p>
                <Button variant="outline" asChild>
                  <Link href="/privacy">Read Privacy Policy</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </>
  );
}
