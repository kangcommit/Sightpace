import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  distDir:
    process.env.TRAILPLAN_INTEGRATION === '1'
      ? '.next-integration'
      : process.env.TRAILPLAN_E2E === '1'
        ? '.next-e2e'
        : '.next',
  poweredByHeader: false,
  reactStrictMode: true,
}

export default nextConfig
