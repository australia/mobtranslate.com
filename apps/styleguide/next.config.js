/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  transpilePackages: ['@mobtranslate/ui'],
  reactStrictMode: true,
  turbopack: { root: path.resolve(__dirname, '../..') },
  experimental: { cpus: 1 },
};

module.exports = nextConfig;
