import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckIcon } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Pricing | Pactify",
  description: "Choose the plan that works best for your freelance business. Upgrade or downgrade anytime as your needs change.",
};

export default function PricingPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-background to-primary-50 dark:from-background dark:to-primary-900/10 py-20">
        <div className="container mx-auto px-4 max-w-7xl text-center">
          <Badge className="mb-4 mx-auto">Pricing</Badge>
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-6">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-foreground/80 max-w-2xl mx-auto">
            Choose the plan that works best for your freelance business. Upgrade or downgrade anytime as your needs change.
          </p>
        </div>
        
        {/* Decorative Elements */}
        <div className="absolute top-1/4 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/4 w-32 h-32 bg-accent-500/10 rounded-full blur-2xl"></div>
      </section>
      
      {/* Annual/Monthly Toggle - To be implemented */}
      
      {/* Pricing Cards */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Free Plan */}
            <div className="bg-background border border-border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-8 border-b border-border">
                <h3 className="text-2xl font-semibold mb-2">Free</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">$0</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="mt-4 text-foreground/70">Perfect for freelancers just getting started.</p>
              </div>
              <div className="p-8">
                <ul className="space-y-4">
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Up to 3 contracts</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Basic contract templates</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Electronic signatures</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>10% escrow fee</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Basic support via email</span>
                  </li>
                </ul>
                <Button variant="outline" size="lg" className="w-full mt-8" asChild>
                  <Link href="/sign-up">Sign Up Free</Link>
                </Button>
              </div>
            </div>

            {/* Professional Plan */}
            <div className="bg-background border-2 border-primary-500 rounded-lg overflow-hidden shadow-lg relative">
              <div className="absolute top-0 right-0 bg-primary-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                MOST POPULAR
              </div>
              <div className="p-8 border-b border-border">
                <h3 className="text-2xl font-semibold mb-2">Professional</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">$19.99</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="mt-4 text-foreground/70">For growing freelance businesses.</p>
                <p className="mt-2 text-sm text-accent-500">Save 16% with annual billing</p>
              </div>
              <div className="p-8">
                <ul className="space-y-4">
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Unlimited contracts</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>All professional templates</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>E-signatures with audit trail</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>7.5% escrow fee</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Custom clauses library</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Priority email support</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Basic custom branding</span>
                  </li>
                </ul>
                <Button size="lg" className="w-full mt-8" asChild>
                  <Link href="/sign-up?plan=professional">Get Started</Link>
                </Button>
              </div>
            </div>

            {/* Business Plan */}
            <div className="bg-background border border-border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-8 border-b border-border">
                <h3 className="text-2xl font-semibold mb-2">Business</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">$49.99</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="mt-4 text-foreground/70">For established freelance businesses.</p>
                <p className="mt-2 text-sm text-accent-500">Save 16% with annual billing</p>
              </div>
              <div className="p-8">
                <ul className="space-y-4">
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>All Professional features</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Team collaboration (up to 5)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Advanced contract templates</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>5% escrow fee</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Full white-labeling</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Priority support</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>API access</span>
                  </li>
                </ul>
                <Button variant="outline" size="lg" className="w-full mt-8" asChild>
                  <Link href="/sign-up?plan=business">Get Started</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* FAQ Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-serif font-bold mb-6">Frequently Asked Questions</h2>
            <p className="text-foreground/70 text-lg max-w-3xl mx-auto">
              Have questions about our pricing or features? Find answers to common questions below.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div className="bg-background border border-border p-6 rounded-lg">
              <h3 className="text-xl font-semibold mb-3">Can I change plans later?</h3>
              <p className="text-foreground/70">
                Yes, you can upgrade or downgrade your plan at any time. Changes take effect on your next billing cycle.
              </p>
            </div>
            
            <div className="bg-background border border-border p-6 rounded-lg">
              <h3 className="text-xl font-semibold mb-3">What are the escrow fees?</h3>
              <p className="text-foreground/70">
                Escrow fees are a percentage of the transaction amount: 10% for Free plans, 7.5% for Professional, and 5% for Business.
              </p>
            </div>
            
            <div className="bg-background border border-border p-6 rounded-lg">
              <h3 className="text-xl font-semibold mb-3">Are contracts legally binding?</h3>
              <p className="text-foreground/70">
                Yes, all contracts created on Pactify meet legal requirements for electronic signatures and document validity in most jurisdictions.
              </p>
            </div>
            
            <div className="bg-background border border-border p-6 rounded-lg">
              <h3 className="text-xl font-semibold mb-3">Do you offer annual billing?</h3>
              <p className="text-foreground/70">
                Yes, we offer annual billing with a 16% discount compared to monthly billing for both Professional and Business plans.
              </p>
            </div>
            
            <div className="bg-background border border-border p-6 rounded-lg">
              <h3 className="text-xl font-semibold mb-3">What payment methods do you accept?</h3>
              <p className="text-foreground/70">
                We accept all major credit cards, including Visa, Mastercard, American Express, and Discover.
              </p>
            </div>
            
            <div className="bg-background border border-border p-6 rounded-lg">
              <h3 className="text-xl font-semibold mb-3">Do you offer a free trial?</h3>
              <p className="text-foreground/70">
                Our Free plan is available indefinitely with basic features. You can use it to test the platform before upgrading.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="py-20 bg-primary-500 text-white">
        <div className="container mx-auto px-4 max-w-7xl text-center">
          <h2 className="text-3xl md:text-4xl font-serif font-bold mb-6">Ready to get started with Pactify?</h2>
          <p className="text-primary-50 text-lg max-w-3xl mx-auto mb-8">
            Join thousands of freelancers and clients using Pactify to create legally binding contracts and secure payments.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" className="bg-white text-primary-500 hover:bg-white/90" asChild>
              <Link href="/sign-up">Create Your Free Account</Link>
            </Button>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10" asChild>
              <Link href="/contact">Contact Sales</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
