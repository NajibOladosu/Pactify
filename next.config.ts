import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    // Only skip ESLint in development
    ignoreDuringBuilds: process.env.NODE_ENV === 'development',
  },
  typescript: {
    // Skip TypeScript checks in development, and also in CI builds (since we run separate tsc check)
    ignoreBuildErrors: process.env.NODE_ENV === 'development' || process.env.CI === 'true',
  },
};

export default nextConfig;
