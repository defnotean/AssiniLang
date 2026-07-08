import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { npmSpawnSpec, run } from "./lib/processHelpers.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD_EXTENSIONS = new Set([".cjs", ".css", ".html", ".js", ".json", ".mjs", ".ts", ".tsx"]);
const IGNORED_DIRECTORIES = new Set([".git", "coverage", "dist", "dist-desktop", "node_modules"]);

export const defaultBuildOutputs = [
  "apps/api/dist/index.js",
  "apps/api/dist/runtimeEnvLoader.js",
  "apps/api/dist/runtimePath.js",
  "apps/api/dist/server.js",
  "apps/web/dist/index.html",
  "packages/api-contract/dist/index.js",
  "packages/db/dist/index.js",
  "packages/eval/dist/index.js"
];

export const defaultBuildSources = [
  "apps/api/package.json",
  "apps/api/src",
  "apps/web/index.html",
  "apps/web/package.json",
  "apps/web/src",
  "apps/web/vite.config.ts",
  "package-lock.json",
  "package.json",
  "packages/api-contract/package.json",
  "packages/api-contract/src",
  "packages/db/package.json",
  "packages/db/src",
  "packages/eval/package.json",
  "packages/eval/src",
  "tsconfig.base.json",
  "vitest.config.ts"
];

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function collectSourceFiles(entry, files = []) {
  if (!(await exists(entry))) return files;
  const entryStat = await stat(entry);
  if (entryStat.isFile()) {
    if (BUILD_EXTENSIONS.has(extname(entry))) {
      files.push(entry);
    }
    return files;
  }

  if (!entryStat.isDirectory()) return files;

  const children = await readdir(entry, { withFileTypes: true });
  for (const child of children) {
    if (child.isDirectory() && IGNORED_DIRECTORIES.has(child.name)) continue;
    await collectSourceFiles(join(entry, child.name), files);
  }
  return files;
}

async function newestMtimeMs(paths) {
  let newest = 0;
  for (const path of paths) {
    const pathStat = await stat(path);
    newest = Math.max(newest, pathStat.mtimeMs);
  }
  return newest;
}

async function oldestMtimeMs(paths) {
  let oldest = Number.POSITIVE_INFINITY;
  for (const path of paths) {
    const pathStat = await stat(path);
    oldest = Math.min(oldest, pathStat.mtimeMs);
  }
  return oldest;
}

export async function desktopBuildStatus({
  outputs = defaultBuildOutputs,
  root = repoRoot,
  sources = defaultBuildSources
} = {}) {
  const outputPaths = outputs.map((path) => resolve(root, path));
  const missingOutputs = [];
  for (const outputPath of outputPaths) {
    if (!(await exists(outputPath))) {
      missingOutputs.push(outputPath);
    }
  }

  if (missingOutputs.length > 0) {
    return {
      missingOutputs,
      needsBuild: true,
      reason: `missing ${missingOutputs.length} build output${missingOutputs.length === 1 ? "" : "s"}`
    };
  }

  const sourceFiles = [];
  for (const source of sources) {
    await collectSourceFiles(resolve(root, source), sourceFiles);
  }

  if (sourceFiles.length === 0) {
    return {
      missingOutputs: [],
      needsBuild: false,
      reason: "no source files found to compare"
    };
  }

  const newestSourceMs = await newestMtimeMs(sourceFiles);
  const oldestOutputMs = await oldestMtimeMs(outputPaths);
  const needsBuild = newestSourceMs > oldestOutputMs;

  return {
    missingOutputs: [],
    needsBuild,
    newestSourceMs,
    oldestOutputMs,
    reason: needsBuild ? "source files changed since the last build" : "existing build is current"
  };
}

async function main(argv = process.argv.slice(2)) {
  const forceBuild = argv.includes("--force-build") || process.env.ASSINI_DESKTOP_FORCE_BUILD === "1";
  const status = forceBuild ? { needsBuild: true, reason: "forced build requested" } : await desktopBuildStatus();

  if (status.needsBuild) {
    console.log(`[desktop] Build required: ${status.reason}.`);
    const build = npmSpawnSpec(["run", "build"]);
    await run(build.command, build.args, { cwd: repoRoot });
  } else {
    console.log(`[desktop] Skipping build: ${status.reason}.`);
  }

  const start = npmSpawnSpec(["--workspace", "@assini/desktop", "run", "start"]);
  await run(start.command, start.args, { cwd: repoRoot });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
