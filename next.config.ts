import type {NextConfig} from 'next';

// Subpath the app is served under behind nginx, e.g. BASE_PATH=/bozlablabelapp
// for sesame.bmi.emory.edu/bozlablabelapp/. Empty (the local terminal-launch
// workflow) serves at the domain root. Set this at BUILD time, since both
// `basePath` and the client-inlined NEXT_PUBLIC_BASE_PATH are baked into the
// build. Trailing slash is trimmed so the value is a clean '/foo'.
const basePath = (process.env.BASE_PATH || '').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  // Runs as a Node server (`next start`) so the app can persist a shared project
  // and per-user annotations in SQLite. Static export ('output: export') cannot
  // support cross-user collaboration.
  basePath: basePath || undefined,

  // Mirror the basePath to a public var so client-side fetch() calls (which
  // Next does NOT auto-prefix) can prepend it via src/lib/basePath.ts.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },

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
