import type { NextConfig } from "next";

/**
 * L'output di build resta in `web/.next` (default). Non impostare `distDir` fuori
 * dalla cartella dell'app (es. `../.next`): Next.js lo rifiuta e il build su Vercel fallisce.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
