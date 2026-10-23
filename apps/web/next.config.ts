import type { NextConfig } from "next";

const apiPort = process.env.API_PORT ?? "3001";

const nextConfig: NextConfig = {
  agentRules: false,
  // Dev only: Next.js 16 blocks dev-server requests (HMR, dev assets) from
  // origins other than localhost. The workspace is always opened through its
  // Replit dev URL, so allow exactly that hostname.
  allowedDevOrigins: process.env.REPLIT_DEV_DOMAIN
    ? [process.env.REPLIT_DEV_DOMAIN]
    : [],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `http://localhost:${apiPort}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
