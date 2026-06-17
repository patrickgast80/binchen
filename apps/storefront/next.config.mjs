import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Trace from the monorepo root so the standalone bundle resolves workspace
  // packages and hoisted pnpm node_modules correctly. Produces
  // .next/standalone/apps/storefront/server.js.
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../.."),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "binchen-backend.onrender.com",
      },
      {
        protocol: "https",
        hostname: "bilulu.de",
      },
      {
        protocol: "https",
        hostname: "binchen.vercel.app",
      },
    ],
  },
  async redirects() {
    if (process.env.BILULU_CANONICAL_REDIRECT !== "true") return [];
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "binchen.vercel.app" }],
        destination: "https://bilulu.de/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
