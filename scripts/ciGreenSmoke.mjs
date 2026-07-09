/**
 * Local CI green smoke — quick checks before push that complement `.github/workflows/ci.yml`.
 *
 * CI also runs `npm ci`, `npm run verify`, `npm run smoke`, `npm run smoke:backup`,
 * built-dist /health+/ready probes, and `npm audit --audit-level=moderate`
 * (includes devDependencies). This helper focuses on production dependency health
 * only so it stays fast for day-to-day use.
 *
 * Usage: node scripts/ciGreenSmoke.mjs
 *        npm run ci:green
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { npmSpawnSpec } from "./lib/processHelpers.mjs";

function readString(value, fallback) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Production-only audit args that mirror CI's moderate gate while omitting
 * devDependencies so the local helper stays fast.
 */
export const CI_GREEN_AUDIT_ARGS = ["audit", "--omit=dev", "--audit-level=moderate"];

export function createCiGreenAuditSpec({
  platform = process.platform,
  env = process.env
} = {}) {
  return npmSpawnSpec(CI_GREEN_AUDIT_ARGS, {
    comSpec: readString(env.ComSpec, "cmd.exe"),
    platform
  });
}

export function runCiGreenSmoke({
  platform = process.platform,
  env = process.env,
  spawnSyncFn = spawnSync,
  stderr = process.stderr
} = {}) {
  const npmSpec = createCiGreenAuditSpec({ platform, env });
  const result = spawnSyncFn(npmSpec.command, npmSpec.args, {
    stdio: "inherit",
    windowsHide: platform === "win32",
    env
  });

  const exitCode = result.status ?? 1;
  if (exitCode !== 0) {
    stderr.write("[ciGreenSmoke] production dependency audit failed\n");
  }

  return { exitCode, command: npmSpec.command, args: npmSpec.args };
}

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  const result = runCiGreenSmoke();
  process.exitCode = result.exitCode;
}
