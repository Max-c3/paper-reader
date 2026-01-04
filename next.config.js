/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  // External packages for server components
  serverExternalPackages: ['pdfjs-dist'],
};

module.exports = nextConfig;

