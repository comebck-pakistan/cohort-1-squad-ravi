import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ehjvfpltmhyjnqpstqbk.supabase.co',
        pathname: '/**',
      },
    ],
  },
  experimental: {},
};

export default nextConfig;
