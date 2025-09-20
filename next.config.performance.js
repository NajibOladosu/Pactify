// Next.js performance optimizations
// Use this as reference for updating next.config.ts

const nextConfig = {
  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
    reactRemoveProperties: process.env.NODE_ENV === 'production',
  },
  
  // Experimental features for performance
  experimental: {
    // Enable server components cache
    serverComponentsExternalPackages: ['@supabase/supabase-js'],
    
    // Optimize CSS
    optimizeCss: true,
    
    // Enable new JSX transform
    esmExternals: true,
    
    // Optimize server-side rendering
    serverActions: true,
    
    // Enable partial prerendering
    ppr: true,
  },
  
  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000, // 1 year
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  
  // Bundle optimization
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Production optimizations
    if (!dev) {
      // Enable tree shaking
      config.optimization.usedExports = true;
      
      // Split chunks for better caching
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            priority: 10,
            enforce: true,
          },
          ui: {
            test: /[\\/]components[\\/]ui[\\/]/,
            name: 'ui',
            priority: 20,
            enforce: true,
          },
          common: {
            name: 'common',
            minChunks: 2,
            priority: 5,
            enforce: true,
          },
        },
      };
      
      // Optimize bundle size
      config.optimization.minimize = true;
    }
    
    // Module resolution optimizations
    config.resolve.modules = ['node_modules'];
    config.resolve.cacheWithContext = false;
    
    // Ignore unused modules
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/,
      })
    );
    
    return config;
  },
  
  // Output optimizations
  output: 'standalone',
  
  // Headers for performance
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=60, stale-while-revalidate=300',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
      {
        source: '/dashboard/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        source: '/((?!api).*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'Server',
            value: 'Pactify',
          },
        ],
      },
    ];
  },
  
  // Compression
  compress: true,
  
  // Performance budgets
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  
  // Memory optimizations
  generateBuildId: async () => {
    // Use short build IDs for better caching
    return process.env.BUILD_ID || 'build-' + Date.now();
  },
  
  // TypeScript optimizations
  typescript: {
    // Skip type checking during build (run separately)
    ignoreBuildErrors: process.env.CI === 'true',
  },
  
  // ESLint optimizations
  eslint: {
    // Skip ESLint during build (run separately)
    ignoreDuringBuilds: process.env.CI === 'true',
  },
  
  // Logging
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === 'development',
    },
  },
  
  // PoweredBy header removal
  poweredByHeader: false,
  
  // Rewrites for API optimization
  async rewrites() {
    return {
      beforeFiles: [
        // API versioning
        {
          source: '/api/v1/:path*',
          destination: '/api/:path*',
        },
      ],
      afterFiles: [
        // Fallback rewrites
      ],
      fallback: [
        // Fallback rewrites
      ],
    };
  },
  
  // Redirects for SEO and performance
  async redirects() {
    return [
      {
        source: '/dashboard/withdrawal',
        destination: '/dashboard/withdrawals',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;