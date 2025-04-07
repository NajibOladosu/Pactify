import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { 
  FileTextIcon, 
  ShieldCheckIcon, 
  CreditCardIcon, 
  UsersIcon, 
  ClockIcon, 
  BellIcon, 
  BarChartIcon,
  CheckIcon,
  ArrowRightIcon
} from "lucide-react";

export const metadata = {
  title: "Features | Pactify",
  description: "Discover the features that make Pactify the best platform for freelancers and clients to create, manage, and sign legally binding contracts.",
};

export default function FeaturesPage() {
  const features = [
    {
      icon: <FileTextIcon className="h-8 w-8 text-primary-500" />,
      title: "Contract Builder",
      description: "Create professional contracts with our easy-to-use builder. Choose from templates or start from scratch, customizing every part to fit your specific needs.",
      detailsList: [
        "Drag-and-drop interface",
        "Save custom templates",
        "Version tracking",
        "Export to PDF, Word, or HTML"
      ],
      link: "/features/contract-builder"
    },
    {
      icon: <ShieldCheckIcon className="h-8 w-8 text-primary-500" />,
      title: "Digital Signatures",
      description: "Legally binding electronic signatures with complete audit trails. Send, sign, and store contracts securely, all in one platform.",
      detailsList: [
        "Legally binding e-signatures",
        "Signature audit trails",
        "Multi-party signing",
        "Email notifications"
      ],
      link: "/features/digital-signatures"
    },
    {
      icon: <CreditCardIcon className="h-8 w-8 text-primary-500" />,
      title: "Escrow Payments",
      description: "Secure milestone-based payments that protect both freelancers and clients throughout the project lifecycle.",
      detailsList: [
        "Multiple payment milestones",
        "Funds verification",
        "Dispute resolution",
        "Automated invoice generation"
      ],
      link: "/features/escrow-payments"
    },
    {
      icon: <UsersIcon className="h-8 w-8 text-primary-500" />,
      title: "Client Management",
      description: "Organize your clients, contract history, and communications in one secure platform for better relationship management.",
      detailsList: [
        "Client profiles and history",
        "Segmentation and tagging",
        "Contract templates by client",
        "Activity tracking"
      ],
      link: "/features/client-management"
    },
    {
      icon: <ClockIcon className="h-8 w-8 text-primary-500" />,
      title: "Contract Tracking",
      description: "Monitor contract status, milestone progress, and payment releases in real-time from your dashboard.",
      detailsList: [
        "Status tracking dashboard",
        "Automated reminders",
        "Timeline visualization",
        "Contract stage notifications"
      ],
      link: "/features/contract-tracking"
    },
    {
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-primary-500">
        <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"></path>
        <path d="m9 12 2 2 4-4"></path>
      </svg>,
      title: "Legal Templates",
      description: "Access a library of professionally crafted contract templates for various industries and use cases.",
      detailsList: [
        "Industry-specific templates",
        "Customizable clauses",
        "Legal compliance by region",
        "Regular updates with new templates"
      ],
      link: "/templates"
    },
    {
      icon: <BellIcon className="h-8 w-8 text-primary-500" />,
      title: "Notifications & Reminders",
      description: "Stay on top of contract deadlines, payment milestones, and signature requests with customizable notifications.",
      detailsList: [
        "Email notifications",
        "In-app alerts",
        "Deadline reminders",
        "Custom notification settings"
      ],
      link: "/features/notifications"
    },
    {
      icon: <BarChartIcon className="h-8 w-8 text-primary-500" />,
      title: "Analytics & Reporting",
      description: "Gain insights into your freelance business with detailed reports on contracts, payments, and client relationships.",
      detailsList: [
        "Contract performance tracking",
        "Financial reporting",
        "Client value analysis",
        "Customizable dashboards"
      ],
      link: "/features/analytics"
    }
  ];

  return (
    <>
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-background to-primary-50 dark:from-background dark:to-primary-900/10 py-20">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-16">
            <Badge className="mb-4">All Features</Badge>
            <h1 className="text-4xl md:text-5xl font-serif font-bold mb-6">
              Powerful Features for Freelancers and Clients
            </h1>
            <p className="text-foreground/70 text-lg md:text-xl max-w-3xl mx-auto">
              Discover the tools that help you create professional contracts, secure payments, and manage client relationships with ease.
            </p>
          </div>
        </div>
      </section>

      {/* Main Features Grid */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {features.map((feature, index) => (
              <div key={index} className="flex flex-col space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-primary-50 dark:bg-primary-900/20 rounded-lg flex items-center justify-center">
                    {feature.icon}
                  </div>
                  <h2 className="text-2xl font-serif font-bold">{feature.title}</h2>
                </div>

                <p className="text-foreground/70 text-lg">
                  {feature.description}
                </p>

                <ul className="space-y-3">
                  {feature.detailsList.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <Button variant="outline" className="w-fit" asChild>
                  <Link href={feature.link} className="flex items-center">
                    Learn more
                    <ArrowRightIcon className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-b from-background to-primary-50 dark:from-background dark:to-primary-900/10">
        <div className="container mx-auto px-4 max-w-5xl text-center">
          <h2 className="text-3xl md:text-4xl font-serif font-bold mb-6">
            Ready to try Pactify for yourself?
          </h2>
          <p className="text-foreground/70 text-lg max-w-3xl mx-auto mb-10">
            Join thousands of freelancers and clients who use Pactify to create professional contracts and secure their business relationships.
          </p>
          
          <div className="flex flex-wrap gap-4 justify-center">
            <Button size="lg" asChild>
              <Link href="/sign-up">Get Started Free</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/contact">Contact Sales</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
