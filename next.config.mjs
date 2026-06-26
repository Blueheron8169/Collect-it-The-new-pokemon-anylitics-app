/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'Collect-it-The-new-pokemon-anylitics-app';
const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const basePath = isProd && (configuredBasePath || process.env.GITHUB_ACTIONS) ? `/${repoName}` : '';

const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
};

export default nextConfig;
