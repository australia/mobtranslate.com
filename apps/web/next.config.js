/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  transpilePackages: ["@ui", "@dictionaries"],
  compiler: {
    styledComponents: true
  },
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  // On memory-constrained build hosts (e.g. the shared box this deploys from) the
  // default per-CPU static-generation worker pool OOMs with a WorkerError. Cap it
  // by setting NEXT_BUILD_CPUS=2 at build time. Unset elsewhere → Next's default.
  ...(process.env.NEXT_BUILD_CPUS
    ? { experimental: { cpus: Number(process.env.NEXT_BUILD_CPUS) } }
    : {}),
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
  webpack: (config) => {
    // Add aliases for the root level packages
    config.resolve.alias = {
      ...config.resolve.alias,
      '@ui': path.resolve(__dirname, '../../ui'),
      '@ui/components': path.resolve(__dirname, '../../ui/components'),
      '@dictionaries': path.resolve(__dirname, '../../dictionaries')
    };
    return config;
  },
};

module.exports = nextConfig;
