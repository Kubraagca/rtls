const isGitHubPages = process.env.GITHUB_PAGES === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep Next's tracing inside this project when the parent Desktop folder
  // contains another package-lock.json.
  outputFileTracingRoot: process.cwd(),
  output: 'export',
  images: { unoptimized: true },
  ...(isGitHubPages && {
    basePath: '/threejs-sims-house-builder',
    assetPrefix: '/threejs-sims-house-builder/',
  }),
};

export default nextConfig;
