import { JsonStore } from "@assini/db";
import { readRuntimeConfig } from "./runtimeConfig.js";
import { registerShutdownHandlers } from "./runtimeLifecycle.js";
import { resolveRuntimeDataDir, resolveRuntimeDbPath } from "./runtimePath.js";
import { createServer } from "./server.js";

// Load a repo-root `.env` (e.g. ASSINI_LLM_* config) before reading any env so
// users can keep settings in a file instead of re-exporting every shell.
// process.loadEnvFile (Node >=20.12) throws when no `.env` exists; that is fine.
try {
  process.loadEnvFile();
} catch {
  // No .env file present (or unreadable); rely on the ambient environment.
}

const config = readRuntimeConfig(process.env);

const app = createServer({
  store: new JsonStore(resolveRuntimeDbPath({ moduleUrl: import.meta.url })),
  dataDir: resolveRuntimeDataDir({ moduleUrl: import.meta.url }),
  allowedOrigins: config.allowedOrigins,
  bodyLimitBytes: config.bodyLimitBytes,
  logger: config.logger
});
registerShutdownHandlers({ app });
await app.listen({ port: config.port, host: config.host });

console.log(`AssiniLang API listening at http://${config.host}:${config.port}`);
