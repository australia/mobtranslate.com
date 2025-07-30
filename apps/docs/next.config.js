const withMarkdoc = require('@markdoc/next.js')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ui', '@dictionaries'],
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx']
}

module.exports = withMarkdoc()(nextConfig)