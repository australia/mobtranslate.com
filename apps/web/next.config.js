/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Build releases beside the live tree, then atomically swap them at deploy.
  // `next start` keeps the normal .next default when NEXT_DIST_DIR is unset.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@mobtranslate/ui'],
  turbopack: {
    // The app lives two levels below the pnpm workspace root. Pinning this
    // keeps file discovery and module resolution inside this repository.
    root: path.resolve(__dirname, '../..'),
  },
  compiler: {
    styledComponents: true
  },
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  // Keep ISR's bounded memory cache, but never write regenerated pages into an
  // immutable release. A restart may discard warm cache entries; source data and
  // build output remain unchanged and Next regenerates them on demand.
  experimental: {
    isrFlushToDisk: false,
    // On memory-constrained build hosts the default static-generation worker
    // pool OOMs. NEXT_BUILD_CPUS=2 caps it only where explicitly configured.
    ...(process.env.NEXT_BUILD_CPUS
      ? { cpus: Number(process.env.NEXT_BUILD_CPUS) }
      : {}),
  },
  // Monorepo root is two levels up; pin it so Next 16 doesn't infer the wrong
  // workspace root from a stray parent lockfile.
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  // Permanent (308) redirects from the retired standalone routes into the
  // unified atlas. Old URLs stay alive forever for historian citations.
  // NOTE: /dictionaries is deliberately NOT redirected — it is a distinct,
  // valuable feature (the 220 live dictionaries) and stays live.
  async redirects() {
    return [
      { source: '/spread', destination: '/atlas/spread', permanent: true },
      { source: '/map', destination: '/atlas', permanent: true },
      { source: '/languages', destination: '/atlas/directory', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
