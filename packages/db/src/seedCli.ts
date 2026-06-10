import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBootstrapState } from "./bootstrap";
import { JsonStore } from "./store";

const currentFilePath = fileURLToPath(import.meta.url);
export const seedDbPath = resolve(dirname(currentFilePath), "..", "..", "..", "data", "local-db.json");

const invokedFilePath = process.argv[1] ? resolve(process.argv[1]) : undefined;

if (invokedFilePath === currentFilePath) {
  const store = new JsonStore(seedDbPath);
  const state = createBootstrapState();
  await store.write(state);

  console.log(`Initialized empty workspace at ${seedDbPath}`);
  console.log(`Seeded ${state.users.length} local prototype users`);
  console.log("Create languages and import raw sources through the web console or API.");
}
