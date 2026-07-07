import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBootstrapState } from "./bootstrap.js";
import { JsonStore } from "./store.js";

const currentFilePath = fileURLToPath(import.meta.url);
export const defaultSeedDbPath = resolve(dirname(currentFilePath), "..", "..", "..", "data", "local-db.json");

export function resolveSeedDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ASSINI_DB_PATH?.trim();
  return override ? resolve(override) : defaultSeedDbPath;
}

export const seedDbPath = resolveSeedDbPath();

const invokedFilePath = process.argv[1] ? resolve(process.argv[1]) : undefined;

if (invokedFilePath === currentFilePath) {
  const store = new JsonStore(seedDbPath);
  const state = createBootstrapState();
  await store.write(state);

  console.log(`Initialized empty workspace at ${seedDbPath}`);
  console.log(`Seeded ${state.users.length} local prototype users`);
  console.log("Create languages and import raw sources through the web console or API.");
}
