import { existsSync, lstatSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";

const rootNextDir = resolve(".next");
const webNextDir = resolve("web/.next");
const rootRoutesManifest = resolve(".next/routes-manifest.json");

function debugLog(runId, hypothesisId, location, message, data) {
  // #region agent log
  void fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "8b394e",
    },
    body: JSON.stringify({
      sessionId: "8b394e",
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

debugLog("pre-fix", "H1-H3", "scripts/sync-next-output.mjs:30", "sync-start", {
  cwd: process.cwd(),
  webNextExists: existsSync(webNextDir),
  rootNextExists: existsSync(rootNextDir),
});
console.log(
  `[sync-next-output] start cwd=${process.cwd()} webNextExists=${existsSync(webNextDir)} rootNextExists=${existsSync(rootNextDir)}`
);

if (!existsSync(webNextDir)) {
  debugLog("pre-fix", "H1-H3", "scripts/sync-next-output.mjs:38", "web-next-missing", {
    webNextDir,
  });
  throw new Error(`Missing expected Next build output at ${webNextDir}`);
}

rmSync(rootNextDir, { recursive: true, force: true });
symlinkSync("web/.next", rootNextDir, "dir");

debugLog("pre-fix", "H1-H3", "scripts/sync-next-output.mjs:47", "sync-done", {
  rootNextExists: existsSync(rootNextDir),
  rootRoutesManifestExists: existsSync(rootRoutesManifest),
  rootRoutesManifest,
});
const rootNextIsSymlink = lstatSync(rootNextDir).isSymbolicLink();
const rootNextTarget = rootNextIsSymlink ? readlinkSync(rootNextDir) : null;
debugLog("pre-fix", "H5", "scripts/sync-next-output.mjs:57", "symlink-status", {
  rootNextIsSymlink,
  rootNextTarget,
});
console.log(
  `[sync-next-output] done rootNextExists=${existsSync(rootNextDir)} routesManifestExists=${existsSync(rootRoutesManifest)} symlink=${rootNextIsSymlink} target=${rootNextTarget ?? "n/a"}`
);
