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
