import { JsonStore } from "@assini/db";
import { resolveRuntimeDataDir, resolveRuntimeDbPath } from "./runtimePath";
import { createServer } from "./server";

// Load a repo-root `.env` (e.g. ASSINI_LLM_* config) before reading any env so
// users can keep settings in a file instead of re-exporting every shell.
// process.loadEnvFile (Node >=20.12) throws when no `.env` exists; that is fine.
try {
  process.loadEnvFile();
} catch {
  // No .env file present (or unreadable); rely on the ambient environment.
}

const port = Number(process.env.PORT ?? 4321);
const host = process.env.HOST ?? "127.0.0.1";

const app = createServer({
  store: new JsonStore(resolveRuntimeDbPath({ moduleUrl: import.meta.url })),
  dataDir: resolveRuntimeDataDir({ moduleUrl: import.meta.url })
});
await app.listen({ port, host });

console.log(`AssiniLang API listening at http://${host}:${port}`);
