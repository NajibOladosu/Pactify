import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  
  // Performance optimizations
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
  
  // Experimental features for performance
  experimental: {
    optimizeServerReact: true,
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  
  // Bundle optimization
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{member}}',
    },
    '@radix-ui/react-icons': {
      transform: '@radix-ui/react-icons/dist/{{member}}.js',
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
