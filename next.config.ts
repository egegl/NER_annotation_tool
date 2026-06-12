import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // Runs as a Node server (`next start`) so the app can persist a shared project
  // and per-user annotations in SQLite. Static export ('output: export') cannot
  // support cross-user collaboration. If served under a subpath behind nginx, set
  // `basePath` below instead of re-enabling static export.

  // basePath: '/SarkerlabLLM/NER_annotation_tool',

  // better-sqlite3 is a native module; keep it external to the server bundle.
  serverExternalPackages: ['better-sqlite3'],

  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
