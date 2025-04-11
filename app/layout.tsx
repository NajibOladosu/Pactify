import { Inter, Playfair_Display } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import LayoutShell from "@/components/LayoutShell";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Pactify | Smart Contracts for Freelancers",
  description: "Create legally binding contracts and secure escrow payments for freelancers and clients.",
  keywords: "contracts, freelancers, legal contracts, escrow payments, contract templates",
  authors: [{ name: "Pactify Team" }],
  openGraph: {
    title: "Pactify | Smart Contracts for Freelancers",
    description: "Create legally binding contracts and secure escrow payments for freelancers and clients.",
    images: ["/opengraph-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pactify | Smart Contracts for Freelancers",
    description: "Create legally binding contracts and secure escrow payments for freelancers and clients.",
    images: ["/twitter-image.png"],
  },
};

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-playfair",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`} suppressHydrationWarning>
      <body className="bg-background text-foreground font-sans">
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
