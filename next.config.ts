import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * PGlite ships a WASM binary and must stay outside the server bundle so the
   * runtime can resolve its .wasm/.data assets from node_modules.
   */
  serverExternalPackages: ['@electric-sql/pglite'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
};

export default nextConfig;
