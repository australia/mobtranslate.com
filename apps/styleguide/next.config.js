/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  transpilePackages: ['@mobtranslate/ui'],
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@mobtranslate/ui': path.resolve(__dirname, '../../packages/ui/src'),
    };
    return config;
  },
};

module.exports = nextConfig;
