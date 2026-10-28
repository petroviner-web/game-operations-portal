import type { NextConfig } from 'next';

const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:4000';
const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` }];
  },
};
export default config;
