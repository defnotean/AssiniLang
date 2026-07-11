import { resolve as resolvePath } from "node:path";
import type { Env } from "./llmEnvShared.js";
import { loadRuntimeEnvFile } from "./runtimeEnv.js";
import { resolveRuntimeSettingsPath } from "./runtimePath.js";

export type RuntimeEnvLoadOptions = {
  moduleUrl?: string;
  cwd?: string;
  env?: Env;
  settingsPath?: string;
};

function tryLoadEnvFile(path: string): void {
  try {
    process.loadEnvFile(path);
  } catch {
    // Missing or unreadable file; rely on other sources.
  }
}

/**
 * Loads runtime LLM and API configuration with documented precedence
 * (highest wins; existing non-blank values are never overwritten):
 *
 * 1. Existing shell/process environment
 * 2. Repo-root `.env` (resolved from the API package location)
 * 3. Current working directory `.env`
 *
 * The repo-root file is parsed twice when needed so quoted values are handled.
 */
export function bootstrapRuntimeEnvironment(options: RuntimeEnvLoadOptions = {}): string {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const settingsPath =
    options.settingsPath ??
    resolveRuntimeSettingsPath({
      moduleUrl: options.moduleUrl ?? import.meta.url
    });
  const cwdEnvPath = resolvePath(cwd, ".env");

  if (env === process.env) {
    tryLoadEnvFile(settingsPath);
    tryLoadEnvFile(cwdEnvPath);
  } else {
    loadRuntimeEnvFile(settingsPath, env);
    loadRuntimeEnvFile(cwdEnvPath, env);
  }

  loadRuntimeEnvFile(settingsPath, env);

  return settingsPath;
}
