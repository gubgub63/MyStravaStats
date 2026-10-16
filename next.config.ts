import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'standalone',
  distDir: process.env.MYSTATS_DIST_DIR || '.next',
  poweredByHeader: false,
  outputFileTracingExcludes: { '/*': ['.env*'] },
  logging: { incomingRequests: false },
  devIndicators: false,
  turbopack: { root: process.cwd() },
};
export default nextConfig;
