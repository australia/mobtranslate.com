/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  transpilePackages: ["@ui", "@dictionaries"],
  compiler: {
    styledComponents: true
  },
  reactStrictMode: true,
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
