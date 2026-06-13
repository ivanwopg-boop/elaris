import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow tunnel domains in dev mode
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "*.loca.lt",
    "localhost",
  ],

  // Proxy API requests to backend
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL || "http://localhost:8000"}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${process.env.BACKEND_URL || "http://localhost:8000"}/uploads/:path*`,
      },
    ];
  },

  // Increase超时 for long-running API requests (e.g. distillation)

  experimental: {
    proxyTimeout: 120 * 1000, // 120 seconds
  },
};

export default nextConfig;
