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
        // /api/proxy/* is handled by our local Route Handler (for streaming passthrough)
        // so exclude it from the rewrite-to-backend.
        source: "/api/:path((?!proxy/).*)",
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
    proxyTimeout: 200 * 1000, // 120 seconds
  },
};

export default nextConfig;
