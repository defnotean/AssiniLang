import { stat } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSeedDbPath } from "./seedCli.js";
import { JsonStore } from "./store.js";

const currentFilePath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(currentFilePath), "..", "..", "..");

export function resolveBackupDbPath(env: NodeJS.ProcessEnv = process.env): string {
  return resolveSeedDbPath(env);
}

export function defaultBackupPath(sourcePath: string, now = new Date()): string {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const extension = extname(sourcePath) || ".json";
  const stem = basename(sourcePath, extension);
  return resolve(repoRoot, "data", "backups", `${stem}-${timestamp}${extension}`);
}

export type BackupCliArgs = {
  dryRun: boolean;
  destinationArg?: string;
};

export function parseBackupCliArgs(argv: string[] = process.argv.slice(2)): BackupCliArgs {
  const dryRun = argv.includes("--dry-run");
  const destinationArg = argv.find((arg) => !arg.startsWith("-"));
  return { dryRun, destinationArg };
}

export type BackupCliResult = {
  dryRun: boolean;
  dbPath: string;
  destination: string;
  written?: string;
};

export async function runBackupCli({
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date(),
  stdout = console.log
}: {
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  now?: Date;
  stdout?: (message?: unknown, ...optionalParams: unknown[]) => void;
} = {}): Promise<BackupCliResult> {
  const { dryRun, destinationArg } = parseBackupCliArgs(argv);
  const dbPath = resolveBackupDbPath(env);
  const destination = destinationArg ? resolve(destinationArg) : defaultBackupPath(dbPath, now);

  try {
    await stat(dbPath);
  } catch {
    throw new Error(
      `Cannot back up: local database not found at ${dbPath}. Run \`npm run seed -w @assini/db\` to initialize the workspace first.`
    );
  }

  if (dryRun) {
    stdout(`Dry run: would back up local database at ${dbPath}`);
    stdout(`Dry run: backup destination would be ${destination}`);
    return { dryRun: true, dbPath, destination };
  }

  const store = new JsonStore(dbPath);
  const written = await store.backupTo(destination);

  stdout(`Backed up local database at ${dbPath}`);
  stdout(`Backup written to ${written}`);
  stdout(`Restore with: new JsonStore(dbPath).restoreFrom("${written.replaceAll("\\", "\\\\")}")`);
  return { dryRun: false, dbPath, destination, written };
}

const invokedFilePath = process.argv[1] ? resolve(process.argv[1]) : undefined;

if (invokedFilePath === currentFilePath) {
  try {
    await runBackupCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
