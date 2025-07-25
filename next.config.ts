import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    // Only skip ESLint in development
    ignoreDuringBuilds: process.env.NODE_ENV === 'development',
  },
  typescript: {
    // Only skip TypeScript checks in development
    ignoreBuildErrors: process.env.NODE_ENV === 'development',
  },
};

export default nextConfig;
