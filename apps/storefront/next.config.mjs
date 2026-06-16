/** @type {import('next').NextConfig} */
const nextConfig = {
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
