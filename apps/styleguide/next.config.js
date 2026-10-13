/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  transpilePackages: ['@mobtranslate/ui'],
  reactStrictMode: true,
  turbopack: { root: path.resolve(__dirname, '../..') },
  experimental: { cpus: 1 },
};

module.exports = nextConfig;
