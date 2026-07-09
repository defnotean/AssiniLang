import { JsonStore } from "@assini/db";
import { applyLoopbackPrivateUrlDefault, readRuntimeConfig } from "./runtimeConfig.js";
import { bootstrapRuntimeEnvironment } from "./runtimeEnvLoader.js";
import { registerShutdownHandlers } from "./runtimeLifecycle.js";
import { resolveRuntimeDataDir, resolveRuntimeDbPath } from "./runtimePath.js";
import { createServer } from "./server.js";

const settingsPath = bootstrapRuntimeEnvironment({ moduleUrl: import.meta.url });

const config = readRuntimeConfig(process.env);
applyLoopbackPrivateUrlDefault(process.env, config.host);

const app = createServer({
  store: new JsonStore(resolveRuntimeDbPath({ moduleUrl: import.meta.url })),
  dataDir: resolveRuntimeDataDir({ moduleUrl: import.meta.url }),
  settingsPath,
  allowedOrigins: config.allowedOrigins,
  bodyLimitBytes: config.bodyLimitBytes,
  logger: config.logger
});
registerShutdownHandlers({ app });
await app.listen({ port: config.port, host: config.host });

console.log(`AssiniLang API listening at http://${config.host}:${config.port}`);
