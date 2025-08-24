import { Inter, Playfair_Display } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import LayoutShell from "@/components/LayoutShell";
import { Viewport } from "next";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' }
  ],
};

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Pactify | Smart Contracts for Freelancers",
  description: "Create legally binding contracts and secure escrow payments for freelancers and clients.",
  keywords: "contracts, freelancers, legal contracts, escrow payments, contract templates",
  authors: [{ name: "Pactify Team" }],
  category: 'business',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    title: "Pactify | Smart Contracts for Freelancers",
    description: "Create legally binding contracts and secure escrow payments for freelancers and clients.",
    images: ["/opengraph-image.png"],
    siteName: 'Pactify',
  },
  twitter: {
    card: "summary_large_image",
    site: '@pactify',
    creator: '@pactify',
    title: "Pactify | Smart Contracts for Freelancers",
    description: "Create legally binding contracts and secure escrow payments for freelancers and clients.",
    images: ["/twitter-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
};

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  preload: true,
  fallback: ['system-ui', 'arial'],
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-playfair",
  preload: false, // Only preload primary font
  fallback: ['serif'],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html 
      lang="en" 
      className={`${inter.variable} ${playfair.variable}`} 
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.stripe.com" />
        <link rel="dns-prefetch" href="https://js.stripe.com" />
      </head>
      <body className="bg-background text-foreground font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LayoutShell>
            {children}
          </LayoutShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
