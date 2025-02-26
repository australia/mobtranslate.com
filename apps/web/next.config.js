/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ui"],
  compiler: {
    styledComponents: true
  },
  reactStrictMode: true,
};

module.exports = nextConfig;
