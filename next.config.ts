import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingExcludes: { '/*': ['.env*'] },
  logging: { incomingRequests: false },
  devIndicators: false,
  turbopack: { root: process.cwd() },
};
export default nextConfig;
