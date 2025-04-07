import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneIcon, MailIcon, Building2Icon, MessageSquareIcon, CheckIcon } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Contact Sales | Pactify",
  description: "Contact our sales team for enterprise solutions, custom pricing, and personalized demos of the Pactify platform.",
};

export default function ContactSalesPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-background to-primary-50 dark:from-background dark:to-primary-900/10 py-20">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-16">
            <Badge className="mb-4">Contact Us</Badge>
            <h1 className="text-4xl md:text-5xl font-serif font-bold mb-6">
              Get in Touch with Our Sales Team
            </h1>
            <p className="text-foreground/70 text-lg md:text-xl max-w-3xl mx-auto">
              Have questions about enterprise pricing, custom features, or want a personalized demo? Our team is ready to help.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Form & Details Section */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <div>
              <h2 className="text-2xl font-serif font-bold mb-6">Send us a message</h2>
              <form className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" placeholder="John" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" placeholder="Doe" required />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Work Email</Label>
                  <Input id="email" type="email" placeholder="john.doe@company.com" required />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="company">Company Name</Label>
                  <Input id="company" placeholder="Acme Inc." required />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number (Optional)</Label>
                  <Input id="phone" type="tel" placeholder="+1 (555) 123-4567" />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="teamSize">Team Size</Label>
                  <select id="teamSize" className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm">
                    <option value="" disabled selected>Select team size</option>
                    <option value="1-5">1-5</option>
                    <option value="6-20">6-20</option>
                    <option value="21-50">21-50</option>
                    <option value="51-200">51-200</option>
                    <option value="201+">201+</option>
                  </select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="message">How can we help?</Label>
                  <Textarea 
                    id="message" 
                    placeholder="Tell us about your requirements and what you're looking for..." 
                    className="min-h-32"
                    required
                  />
                </div>
                
                <Button type="submit" size="lg" className="w-full">
                  Submit Request
                </Button>
                
                <p className="text-xs text-muted-foreground text-center">
                  By submitting this form, you agree to our{" "}
                  <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>
                  {" "}and{" "}
                  <Link href="/terms" className="underline underline-offset-2">Terms of Service</Link>.
                </p>
              </form>
            </div>
            
            {/* Sales Information */}
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-serif font-bold mb-6">Enterprise Solutions</h2>
                <p className="text-foreground/70 mb-6">
                  Pactify offers tailored solutions for enterprises with specialized needs. Our enterprise plan includes:
                </p>
                
                <ul className="space-y-4">
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Dedicated account manager</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Custom contract workflows</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Enhanced security features</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Volume discounts on escrow fees</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>API access for integration</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckIcon className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <span>Custom onboarding and training</span>
                  </li>
                </ul>
              </div>
              
              <div className="border-t pt-8">
                <h3 className="text-xl font-medium mb-6">Contact Information</h3>
                
                <div className="space-y-4">
                  <Card>
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="bg-primary-50 dark:bg-primary-900/20 p-3 rounded-full">
                        <PhoneIcon className="h-5 w-5 text-primary-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Phone</p>
                        <p className="text-foreground/70">+1 (555) 123-4567</p>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="bg-primary-50 dark:bg-primary-900/20 p-3 rounded-full">
                        <MailIcon className="h-5 w-5 text-primary-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Email</p>
                        <p className="text-foreground/70">sales@pactify.io</p>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="bg-primary-50 dark:bg-primary-900/20 p-3 rounded-full">
                        <Building2Icon className="h-5 w-5 text-primary-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Headquarters</p>
                        <p className="text-foreground/70">123 Market Street, San Francisco, CA 94105</p>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="bg-primary-50 dark:bg-primary-900/20 p-3 rounded-full">
                        <MessageSquareIcon className="h-5 w-5 text-primary-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Chat</p>
                        <p className="text-foreground/70">Live chat available Monday-Friday, 9am-5pm PT</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-gradient-to-b from-background to-primary-50 dark:from-background dark:to-primary-900/10">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-3xl font-serif font-bold mb-10 text-center">Frequently Asked Questions</h2>
          
          <div className="space-y-6">
            <div className="border bg-background rounded-lg p-6">
              <h3 className="text-xl font-medium mb-3">Do you offer custom pricing?</h3>
              <p className="text-foreground/70">
                Yes, for enterprise customers or teams larger than 10 people, we offer custom pricing packages tailored to your specific needs and usage volume.
              </p>
            </div>
            
            <div className="border bg-background rounded-lg p-6">
              <h3 className="text-xl font-medium mb-3">Can I get a personalized demo?</h3>
              <p className="text-foreground/70">
                Absolutely! Fill out the contact form on this page or email sales@pactify.io to schedule a personalized demo with one of our product specialists.
              </p>
            </div>
            
            <div className="border bg-background rounded-lg p-6">
              <h3 className="text-xl font-medium mb-3">What kind of support is included?</h3>
              <p className="text-foreground/70">
                Enterprise customers receive priority support with dedicated account managers, custom onboarding, and training for your team. We also offer SLA guarantees for enterprise plans.
              </p>
            </div>
            
            <div className="border bg-background rounded-lg p-6">
              <h3 className="text-xl font-medium mb-3">Can Pactify integrate with our existing systems?</h3>
              <p className="text-foreground/70">
                Yes, Pactify offers API access and can integrate with many popular CRM, accounting, and project management tools. For enterprise customers, we also offer custom integration services.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
