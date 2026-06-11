import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore } from "./store.js";

const currentFilePath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(currentFilePath), "..", "..", "..");
const dbPath = resolve(repoRoot, "data", "local-db.json");

export function defaultBackupPath(sourcePath: string, now = new Date()): string {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const extension = extname(sourcePath) || ".json";
  const stem = basename(sourcePath, extension);
  return resolve(repoRoot, "data", "backups", `${stem}-${timestamp}${extension}`);
}

const invokedFilePath = process.argv[1] ? resolve(process.argv[1]) : undefined;

if (invokedFilePath === currentFilePath) {
  const destinationArg = process.argv[2];
  const destination = destinationArg ? resolve(destinationArg) : defaultBackupPath(dbPath);

  const store = new JsonStore(dbPath);
  const written = await store.backupTo(destination);

  console.log(`Backed up local database at ${dbPath}`);
  console.log(`Backup written to ${written}`);
  console.log(`Restore with: new JsonStore(dbPath).restoreFrom("${written.replaceAll("\\", "\\\\")}")`);
}
