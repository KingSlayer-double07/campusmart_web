import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  // D1: the browser only talks to this origin; /api/* is proxied to the NestJS server.
  // API_ORIGIN is server-only. Never add pages under app/api/, they would shadow this rewrite.
  async rewrites() {
    if (!process.env.API_ORIGIN) {
      throw new Error("API_ORIGIN is not set (e.g. http://localhost:4000); see .env.example");
    }
    return [{ source: "/api/:path*", destination: `${process.env.API_ORIGIN}/api/:path*` }];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  turbopack: {},
};

export default withSerwist(nextConfig);
