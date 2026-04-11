import type { NextConfig } from "next";

/** Monorepo: on Vercel the project root is the git root, so place `.next` there. Locally keep `web/.next`. */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(process.env.VERCEL ? { distDir: "../.next" } : {}),
};

export default nextConfig;
