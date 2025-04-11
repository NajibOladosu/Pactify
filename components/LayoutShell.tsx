"use client";

import { ReactNode, Suspense } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Toaster } from "@/components/ui/toaster";
import dynamic from "next/dynamic";

// Dynamically import AuthButton as a client component
const AuthButton = dynamic(() => import("./header-auth-client"), { ssr: false });

// Fallback header for client-only rendering (no auth)
function MinimalHeader() {
  return (
    <header className="w-full border-b border-b-foreground/10 bg-background/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto flex justify-between items-center p-4 max-w-7xl">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-primary-500 font-bold text-2xl font-serif">Pactify</span>
          </Link>
          <nav className="hidden md:flex items-center space-x-6 text-sm">
            <Link href="/templates" className="text-foreground/80 hover:text-primary-500 transition-colors">
              Templates
            </Link>
            <Link href="/pricing" className="text-foreground/80 hover:text-primary-500 transition-colors">
              Pricing
            </Link>
            <Link href="/features" className="text-foreground/80 hover:text-primary-500 transition-colors">
              Features
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <AuthButton />
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="w-full border-t border-t-border bg-background">
      <div className="container mx-auto py-12 px-4 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <span className="text-primary-500 font-bold text-xl font-serif">Pactify</span>
            </Link>
            <p className="text-sm text-foreground/70 mb-4">
              Create legally binding contracts and escrow payments for freelancers and clients.
            </p>
          </div>
          <div className="col-span-1">
            <h3 className="font-medium mb-4">Product</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/features" className="text-foreground/70 hover:text-primary-500 transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/templates" className="text-foreground/70 hover:text-primary-500 transition-colors">
                  Templates
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-foreground/70 hover:text-primary-500 transition-colors">
                  Pricing
                </Link>
              </li>
            </ul>
          </div>
          <div className="col-span-1">
            <h3 className="font-medium mb-4">Resources</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/blog" className="text-foreground/70 hover:text-primary-500 transition-colors">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/help" className="text-foreground/70 hover:text-primary-500 transition-colors">
                  Help Center
                </Link>
              </li>
              <li>
                <Link href="/legal" className="text-foreground/70 hover:text-primary-500 transition-colors">
                  Legal Resources
                </Link>
              </li>
            </ul>
          </div>
          <div className="col-span-1">
            <h3 className="font-medium mb-4">Company</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/about" className="text-foreground/70 hover:text-primary-500 transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-foreground/70 hover:text-primary-500 transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-foreground/70 hover:text-primary-500 transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-foreground/70 hover:text-primary-500 transition-colors">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-t-border mt-8 pt-8 flex flex-col md:flex-row md:items-center justify-between text-sm text-foreground/70">
          <p>&copy; {currentYear} Pactify. All rights reserved.</p>
          <div className="flex mt-4 md:mt-0 gap-6">
            <a href="#" className="hover:text-primary-500 transition-colors" aria-label="Twitter">
              Twitter
            </a>
            <a href="#" className="hover:text-primary-500 transition-colors" aria-label="LinkedIn">
              LinkedIn
            </a>
            <a href="#" className="hover:text-primary-500 transition-colors" aria-label="GitHub">
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function LayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  if (isDashboard) {
    // Only render children (no header/footer)
    return (
      <>
        <main className="min-h-screen flex flex-col">
          <div className="flex-1">{children}</div>
        </main>
        <Toaster />
      </>
    );
  }

  // Render header/footer for all other routes
  return (
    <>
      <main className="min-h-screen flex flex-col">
        <div className="flex-1 w-full flex flex-col min-h-screen">
          <MinimalHeader />
          <div className="flex-1">{children}</div>
          <Footer />
        </div>
      </main>
      <Toaster />
    </>
  );
}
