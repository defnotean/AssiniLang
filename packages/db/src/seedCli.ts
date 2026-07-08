import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBootstrapState } from "./bootstrap.js";
import { JsonStore } from "./store.js";
import { buildTestWorkspaceState } from "./testing.js";

const currentFilePath = fileURLToPath(import.meta.url);
export const defaultSeedDbPath = resolve(dirname(currentFilePath), "..", "..", "..", "data", "local-db.json");

export function resolveSeedDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ASSINI_DB_PATH?.trim();
  return override ? resolve(override) : defaultSeedDbPath;
}

function seedFixtureRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.ASSINI_SEED_FIXTURE?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export const seedDbPath = resolveSeedDbPath();

export async function runSeedCli({
  dbPath = resolveSeedDbPath(),
  env = process.env,
  stdout = console.log
}: {
  dbPath?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: (message?: unknown, ...optionalParams: unknown[]) => void;
} = {}) {
  const store = new JsonStore(dbPath);
  const useFixture = seedFixtureRequested(env);
  const state = useFixture ? buildTestWorkspaceState() : createBootstrapState();
  await store.write(state);

  if (useFixture) {
    stdout(`Initialized fixture workspace at ${dbPath}`);
    stdout(`Seeded ${state.languages.length} language(s), ${state.users.length} local prototype users`);
  } else {
    stdout(`Initialized empty workspace at ${dbPath}`);
    stdout(`Seeded ${state.users.length} local prototype users`);
    stdout("Create languages and import raw sources through the web console or API.");
  }
}

const invokedFilePath = process.argv[1] ? resolve(process.argv[1]) : undefined;

if (invokedFilePath === currentFilePath) {
  await runSeedCli();
}
