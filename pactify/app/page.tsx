import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { CheckIcon, ChevronRightIcon, FileTextIcon, ShieldCheckIcon, CreditCardIcon, UsersIcon } from "lucide-react";

export default function Home() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-background to-primary-50 dark:from-background dark:to-primary-900/10">
        <div className="container mx-auto px-4 py-20 md:py-32 max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="flex flex-col gap-6">
              <Badge className="w-fit bg-primary-500 hover:bg-primary-600 text-white">Freelancer Friendly</Badge>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold leading-tight">
                Legally Binding <span className="text-primary-500">Contracts</span> & <span className="text-primary-500">Secure Payments</span>
              </h1>
              <p className="text-lg text-foreground/80 md:text-xl md:pr-10">
                Pactify streamlines contract creation and payments for freelancers and clients. Create, sign, and manage contracts with confidence.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mt-4">
                <Button size="lg" asChild>
                  <Link href="/sign-up">Get Started for Free</Link>
                </Button>
                <Button size="lg" variant="outline" className="group" asChild>
                  <Link href="/templates" className="flex items-center">
                    Explore Templates
                    <ChevronRightIcon className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              </div>
              <div className="flex flex-wrap gap-8 mt-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckIcon className="h-4 w-4 text-primary-500" />
                  <span>Legally binding contracts</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckIcon className="h-4 w-4 text-primary-500" />
                  <span>Secure escrow payments</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckIcon className="h-4 w-4 text-primary-500" />
                  <span>3 flexible pricing tiers</span>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-500 to-accent-500 rounded-lg blur-xl opacity-30 animate-pulse"></div>
              <div className="relative bg-background rounded-lg shadow-xl border border-primary-100 dark:border-primary-900/20 overflow-hidden">
                <div className="p-6 md:p-8">
                  <div className="aspect-video bg-muted rounded-md flex items-center justify-center">
                    {/* This would be an actual mockup image in production */}
                    <div className="text-center">
                      <h3 className="text-lg font-medium mb-2">Contract Dashboard</h3>
                      <p className="text-sm text-muted-foreground">Manage your contracts, signings, and payments</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/4 w-32 h-32 bg-accent-500/10 rounded-full blur-2xl"></div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="text-center mb-16">
            <Badge className="mb-4">Features</Badge>
            <h2 className="text-3xl md:text-4xl font-serif font-bold mb-6">Everything You Need for Freelance Contracts</h2>
            <p className="text-foreground/70 text-lg max-w-3xl mx-auto">
              Pactify provides all the tools freelancers and clients need to create, manage, and fulfill contracts with ease and confidence.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-background border border-border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-primary-500/10 rounded-lg flex items-center justify-center mb-4">
                <FileTextIcon className="h-6 w-6 text-primary-500" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Contract Builder</h3>
              <p className="text-foreground/70 mb-4">
                Create professional contracts with our easy-to-use drag-and-drop builder. Choose from templates or start from scratch.
              </p>
              <Link href="/features/contract-builder" className="text-primary-500 hover:underline font-medium flex items-center">
                Learn more <ChevronRightIcon className="ml-1 h-4 w-4" />
              </Link>
            </div>

            {/* Feature 2 */}
            <div className="bg-background border border-border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-secondary-500/10 rounded-lg flex items-center justify-center mb-4">
                <ShieldCheckIcon className="h-6 w-6 text-secondary-500" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Digital Signatures</h3>
              <p className="text-foreground/70 mb-4">
                Legally binding electronic signatures with audit trails. Sign contracts securely from any device.
              </p>
              <Link href="/features/digital-signatures" className="text-primary-500 hover:underline font-medium flex items-center">
                Learn more <ChevronRightIcon className="ml-1 h-4 w-4" />
              </Link>
            </div>

            {/* Feature 3 */}
            <div className="bg-background border border-border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-accent-500/10 rounded-lg flex items-center justify-center mb-4">
                <CreditCardIcon className="h-6 w-6 text-accent-500" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Escrow Payments</h3>
              <p className="text-foreground/70 mb-4">
                Secure milestone-based payments that protect both freelancers and clients throughout the project lifecycle.
              </p>
              <Link href="/features/escrow-payments" className="text-primary-500 hover:underline font-medium flex items-center">
                Learn more <ChevronRightIcon className="ml-1 h-4 w-4" />
              </Link>
            </div>

            {/* Feature 4 */}
            <div className="bg-background border border-border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-success">
                  <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"></path>
                  <path d="m9 12 2 2 4-4"></path>
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Legal Templates</h3>
              <p className="text-foreground/70 mb-4">
                Access a library of professionally crafted contract templates for various industries and use cases.
              </p>
              <Link href="/templates" className="text-primary-500 hover:underline font-medium flex items-center">
                Browse templates <ChevronRightIcon className="ml-1 h-4 w-4" />
              </Link>
            </div>

            {/* Feature 5 */}
            <div className="bg-background border border-border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-warning">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <path d="M15 3h6v6"></path>
                  <path d="m10 14 11-11"></path>
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Contract Tracking</h3>
              <p className="text-foreground/70 mb-4">
                Monitor contract status, milestone progress, and payment releases in real-time from your dashboard.
              </p>
              <Link href="/features/contract-tracking" className="text-primary-500 hover:underline font-medium flex items-center">
                Learn more <ChevronRightIcon className="ml-1 h-4 w-4" />
              </Link>
            </div>

            {/* Feature 6 */}
            <div className="bg-background border border-border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-primary-500/10 rounded-lg flex items-center justify-center mb-4">
                <UsersIcon className="h-6 w-6 text-primary-500" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Client Management</h3>
              <p className="text-foreground/70 mb-4">
                Organize your clients, contract history, and communications in one secure platform.
              </p>
              <Link href="/features/client-management" className="text-primary-500 hover:underline font-medium flex items-center">
                Learn more <ChevronRightIcon className="ml-1 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 bg-gradient-to-b from-background to-accent-50 dark:from-background dark:to-accent-900/10">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-accent-500 hover:bg-accent-600 text-white">Simple Process</Badge>
            <h2 className="text-3xl md:text-4xl font-serif font-bold mb-6">How Pactify Works</h2>
            <p className="text-foreground/70 text-lg max-w-3xl mx-auto">
              Our streamlined process makes contract creation, signing, and payment management simple and secure.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="relative">
              <div className="text-4xl font-bold text-accent-200 dark:text-accent-800 absolute -top-6 -left-2">01</div>
              <div className="bg-background border border-border rounded-lg p-6 relative z-10">
                <h3 className="text-xl font-semibold mb-3">Create Contract</h3>
                <p className="text-foreground/70">
                  Choose a template or build a custom contract using our intuitive contract builder. Add your terms, scope, and payment milestones.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative">
              <div className="text-4xl font-bold text-accent-200 dark:text-accent-800 absolute -top-6 -left-2">02</div>
              <div className="bg-background border border-border rounded-lg p-6 relative z-10">
                <h3 className="text-xl font-semibold mb-3">Sign & Approve</h3>
                <p className="text-foreground/70">
                  Send contracts for electronic signatures with a complete audit trail. Both parties receive signed copies.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative">
              <div className="text-4xl font-bold text-accent-200 dark:text-accent-800 absolute -top-6 -left-2">03</div>
              <div className="bg-background border border-border rounded-lg p-6 relative z-10">
                <h3 className="text-xl font-semibold mb-3">Payment & Completion</h3>
                <p className="text-foreground/70">
                  Fund escrow for milestone payments. Release funds when work is completed to ensure security for both parties.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12 text-center">
            <Button size="lg" asChild>
              <Link href="/sign-up">Get Started Today</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-background">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="text-center mb-16">
            <Badge className="mb-4">Pricing</Badge>
            <h2 className="text-3xl md:text-4xl font-serif font-bold mb-6">Plans for Every Freelancer</h2>
            <p className="text-foreground/70 text-lg max-w-3xl mx-auto">
              Choose the plan that works best for your freelance business. Upgrade or downgrade anytime as your needs change.
            </p>
          </div>

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

      {/* CTA Section */}
      <section className="py-20 bg-primary-500 text-white">
        <div className="container mx-auto px-4 max-w-7xl text-center">
          <h2 className="text-3xl md:text-4xl font-serif font-bold mb-6">Ready to streamline your contract process?</h2>
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
