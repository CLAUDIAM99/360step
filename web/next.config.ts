import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * L'output di build resta in `web/.next` (default). Non impostare `distDir` fuori
 * dalla cartella dell'app (es. `../.next`): Next.js lo rifiuta e il build su Vercel fallisce.
 */
// #region agent log
console.log(
  `[debug-next-config] cwd=${process.cwd()} rootManifest=${existsSync(resolve(process.cwd(), ".next/routes-manifest.json"))} webManifest=${existsSync(resolve(process.cwd(), "web/.next/routes-manifest.json"))} parentManifest=${existsSync(resolve(process.cwd(), "../.next/routes-manifest.json"))}`
);
void fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Debug-Session-Id": "8b394e",
  },
  body: JSON.stringify({
    sessionId: "8b394e",
    runId: "pre-fix",
    hypothesisId: "H8-H10",
    location: "web/next.config.ts:10",
    message: "next-config-evaluated",
    data: {
      cwd: process.cwd(),
      rootManifestExists: existsSync(resolve(process.cwd(), ".next/routes-manifest.json")),
      webManifestExists: existsSync(resolve(process.cwd(), "web/.next/routes-manifest.json")),
      parentManifestExists: existsSync(resolve(process.cwd(), "../.next/routes-manifest.json")),
    },
    timestamp: Date.now(),
  }),
}).catch(() => {});
// #endregion

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
