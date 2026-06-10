import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type RuntimeDbPathOptions = {
  env?: Record<string, string | undefined>;
  moduleUrl?: string;
};

export function resolveRuntimeDbPath(options: RuntimeDbPathOptions = {}) {
  const env = options.env ?? process.env;
  const override = env.ASSINI_DB_PATH?.trim();
  if (override) {
    return resolve(override);
  }

  const moduleDir = dirname(fileURLToPath(options.moduleUrl ?? import.meta.url));
  return resolve(moduleDir, "..", "..", "..", "data", "local-db.json");
}

/**
 * Directory that holds the local database and uploaded source-asset
 * files. Kept next to the resolved database path so uploads land in
 * the repository data folder regardless of the process working directory.
 */
export function resolveRuntimeDataDir(options: RuntimeDbPathOptions = {}) {
  return dirname(resolveRuntimeDbPath(options));
}
