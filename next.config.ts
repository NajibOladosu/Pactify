import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  
  // Performance optimizations (simplified)
  poweredByHeader: false,
  generateEtags: false,
  compress: true,
  
  // Image optimization
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60,
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  
  // Simplified experimental features
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  
  // Simplified modular imports
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{member}}',
    },
  },
  
  eslint: {
    // Skip ESLint in development and production builds (since we run separate lint check)
    ignoreDuringBuilds: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'production' || process.env.CI === 'true',
  },
  typescript: {
    // Skip TypeScript checks in development and production builds (since we run separate tsc check)
    ignoreBuildErrors: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'production' || process.env.CI === 'true',
  },
};

export default nextConfig;
