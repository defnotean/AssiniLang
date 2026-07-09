/**
 * Local CI green smoke — quick checks before push that complement `.github/workflows/ci.yml`.
 *
 * CI also runs `npm ci`, `npm run verify`, `npm run smoke`, built-dist /health+/ready probes,
 * and `npm audit --audit-level=moderate` (includes devDependencies). This helper focuses on
 * production dependency health only so it stays fast for day-to-day use.
 *
 * Usage: node scripts/ciGreenSmoke.mjs
 */
import { spawnSync } from "node:child_process";
import { npmSpawnSpec } from "./lib/processHelpers.mjs";

const npmSpec = npmSpawnSpec(["audit", "--omit=dev", "--audit-level=moderate"], {
  comSpec: process.env.ComSpec ?? "cmd.exe",
  platform: process.platform
});

const result = spawnSync(npmSpec.command, npmSpec.args, {
  stdio: "inherit",
  windowsHide: process.platform === "win32"
});

if (result.status !== 0) {
  process.stderr.write("[ciGreenSmoke] production dependency audit failed\n");
}

process.exitCode = result.status ?? 1;
