import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore } from "@assini/db";
import { buildSeedState } from "./loader";

const currentFilePath = fileURLToPath(import.meta.url);
export const seedDbPath = resolve(dirname(currentFilePath), "..", "..", "..", "data", "local-db.json");

const invokedFilePath = process.argv[1] ? resolve(process.argv[1]) : undefined;

if (invokedFilePath === currentFilePath) {
  const store = new JsonStore(seedDbPath);
  const state = buildSeedState();
  await store.write(state);

  console.log(`Seeded ${state.languages.length} synthetic languages`);
  console.log(`Seeded ${state.corpus.length} corpus passages`);
  console.log(`Seeded ${state.notes.length} draft notes`);
  console.log(`Seeded ${state.exercises.length} exercises`);
}
