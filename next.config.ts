import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
