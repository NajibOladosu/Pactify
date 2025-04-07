import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = {
  title: "About Us | Pactify",
  description: "Learn about Pactify's mission to simplify contract management and secure payments for freelancers and clients worldwide.",
};

export default function AboutPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-background to-primary-50 dark:from-background dark:to-primary-900/10 py-20">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-16">
            <Badge className="mb-4">Our Story</Badge>
            <h1 className="text-4xl md:text-5xl font-serif font-bold mb-6">
              About Pactify
            </h1>
            <p className="text-foreground/70 text-lg md:text-xl max-w-3xl mx-auto">
              We're on a mission to make freelance contracts and payments simple, secure, and stress-free.
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="prose prose-stone dark:prose-invert max-w-none">
            <h2>Our Mission</h2>
            <p>
              Pactify was founded with a singular vision: to create a platform that removes the friction, uncertainty, and risk from freelance contracts and payments. We believe that freelancers and clients deserve a transparent, efficient, and legally-sound way to work together.
            </p>
            <p>
              Our platform is designed to protect both parties, ensuring that freelancers get paid for their work and clients receive the deliverables they expect. By combining robust contract tools with secure escrow payments, we've created an end-to-end solution for successful freelance relationships.
            </p>

            <h2>Our Story</h2>
            <p>
              Pactify was born from the frustrations of our founders, who experienced firsthand the challenges of freelance work—unclear expectations, delayed payments, contract disputes, and the lack of standardized processes.
            </p>
            <p>
              In 2023, a team of freelancers, legal experts, and tech enthusiasts came together to solve these problems. After months of research, development, and user testing, Pactify launched with a suite of tools designed specifically for the unique needs of the freelance economy.
            </p>
            <p>
              Since then, we've helped thousands of freelancers and clients create clear agreements, secure payments, and build trusting professional relationships.
            </p>

            <h2>Our Values</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 not-prose my-8">
              <div className="bg-primary-50 dark:bg-primary-900/20 p-6 rounded-lg">
                <h3 className="text-xl font-bold mb-2">Trust & Transparency</h3>
                <p>We believe in complete transparency in all aspects of freelance relationships, from contract terms to payment structures.</p>
              </div>
              <div className="bg-primary-50 dark:bg-primary-900/20 p-6 rounded-lg">
                <h3 className="text-xl font-bold mb-2">Security & Protection</h3>
                <p>We prioritize the security of our users' information and payments, ensuring that both parties are protected throughout the process.</p>
              </div>
              <div className="bg-primary-50 dark:bg-primary-900/20 p-6 rounded-lg">
                <h3 className="text-xl font-bold mb-2">Simplicity & Efficiency</h3>
                <p>We strive to make complex legal and financial processes as simple and efficient as possible, saving our users time and effort.</p>
              </div>
              <div className="bg-primary-50 dark:bg-primary-900/20 p-6 rounded-lg">
                <h3 className="text-xl font-bold mb-2">Inclusivity & Accessibility</h3>
                <p>We're committed to making our platform accessible to freelancers and clients of all backgrounds, experience levels, and industries.</p>
              </div>
            </div>

            <h2>Our Team</h2>
            <p>
              Pactify is powered by a diverse team of professionals with backgrounds in law, finance, technology, and the freelance economy. We're united by our commitment to empowering freelancers and clients with the tools they need to succeed.
            </p>
            <p>
              Our team includes former freelancers who understand the challenges of independent work, legal experts who ensure our contracts are sound and enforceable, and technology specialists who build secure, user-friendly solutions.
            </p>

            <h2>Looking Forward</h2>
            <p>
              As the freelance economy continues to grow, so does our commitment to innovating and improving our platform. We're constantly gathering feedback from our users and developing new features to meet evolving needs.
            </p>
            <p>
              Our vision for the future includes expanding our template library, enhancing our payment systems, and creating more tools to help freelancers and clients build successful, lasting relationships.
            </p>
            <p>
              We invite you to join us on this journey as we work to transform the way freelancers and clients collaborate around the world.
            </p>
          </div>

          <div className="mt-12 text-center">
            <Button size="lg" asChild>
              <Link href="/sign-up">Join Pactify Today</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Team Section (Placeholder) */}
      <section className="py-16 bg-gradient-to-b from-background to-primary-50 dark:from-background dark:to-primary-900/10">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-3xl font-serif font-bold text-center mb-12">Meet Our Leadership</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Team Member 1 */}
            <div className="bg-background border border-border rounded-lg overflow-hidden">
              <div className="aspect-square bg-muted"></div>
              <div className="p-6">
                <h3 className="text-xl font-bold mb-1">Alex Johnson</h3>
                <p className="text-primary-500 mb-4">Co-Founder & CEO</p>
                <p className="text-foreground/70">
                  Former freelance developer who experienced payment issues firsthand. Alex leads our vision and strategy.
                </p>
              </div>
            </div>

            {/* Team Member 2 */}
            <div className="bg-background border border-border rounded-lg overflow-hidden">
              <div className="aspect-square bg-muted"></div>
              <div className="p-6">
                <h3 className="text-xl font-bold mb-1">Maya Rodriguez</h3>
                <p className="text-primary-500 mb-4">Co-Founder & CTO</p>
                <p className="text-foreground/70">
                  Experienced software architect with a background in fintech and secure payment systems.
                </p>
              </div>
            </div>

            {/* Team Member 3 */}
            <div className="bg-background border border-border rounded-lg overflow-hidden">
              <div className="aspect-square bg-muted"></div>
              <div className="p-6">
                <h3 className="text-xl font-bold mb-1">David Chen</h3>
                <p className="text-primary-500 mb-4">Chief Legal Officer</p>
                <p className="text-foreground/70">
                  Contract law specialist with 15+ years of experience in digital agreements and intellectual property.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary-500 text-white">
        <div className="container mx-auto px-4 max-w-5xl text-center">
          <h2 className="text-3xl md:text-4xl font-serif font-bold mb-6">
            Join us in transforming freelance work
          </h2>
          <p className="text-primary-50 text-lg max-w-3xl mx-auto mb-8">
            Whether you're a freelancer looking for security or a client seeking reliable talent, Pactify provides the platform you need to succeed.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" className="bg-white text-primary-500 hover:bg-white/90" asChild>
              <Link href="/sign-up">Get Started Free</Link>
            </Button>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10" asChild>
              <Link href="/contact">Contact Our Team</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
