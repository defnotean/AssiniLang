import { stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSeedDbPath } from "./seedCli.js";
import { JsonStore, pathsReferToSameFile } from "./store.js";

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

/** Escape a filesystem path for embedding in a double-quoted JS string literal. */
export function escapePathForJsString(path: string): string {
  return path.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

/** Operator-facing restore recipe printed after a successful backup. */
export function formatBackupRestoreHint(dbPath: string, backupPath: string): string {
  return `Restore with: new JsonStore("${escapePathForJsString(dbPath)}").restoreFrom("${escapePathForJsString(backupPath)}")`;
}

export type BackupCliArgs = {
  dryRun: boolean;
  force: boolean;
  destinationArg?: string;
};

export function parseBackupCliArgs(argv: string[] = process.argv.slice(2)): BackupCliArgs {
  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");
  const destinationArg = argv.find((arg) => !arg.startsWith("-"));
  return { dryRun, force, destinationArg };
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
  const { dryRun, force, destinationArg } = parseBackupCliArgs(argv);
  const dbPath = resolveBackupDbPath(env);
  const destination = destinationArg ? resolve(destinationArg) : defaultBackupPath(dbPath, now);

  try {
    await stat(dbPath);
  } catch {
    throw new Error(
      `Cannot back up: local database not found at ${dbPath}. Run \`npm run seed -w @assini/db\` to initialize the workspace first.`
    );
  }

  if (pathsReferToSameFile(dbPath, destination)) {
    throw new Error(
      `Cannot back up: destination ${destination} is the same as the live database. Choose a different path under data/backups/ or pass an explicit backup file.`
    );
  }

  let destinationExists = false;
  try {
    const destinationStat = await stat(destination);
    if (destinationStat.isDirectory()) {
      throw new Error(
        `Cannot back up: destination ${destination} is a directory. Pass a file path (for example ${join(destination, basename(dbPath))}) or omit the path to use data/backups/.`
      );
    }
    destinationExists = true;
    // Dry-run only previews paths; refuse overwrite on a real write unless --force.
    if (!force && !dryRun) {
      throw new Error(
        `Cannot back up: destination ${destination} already exists. Pass a new path or --force to overwrite.`
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  // Validate the live database against the current schema before copying so
  // operators never archive an unreadable/corrupt workspace as a "backup".
  const store = new JsonStore(dbPath);
  try {
    await store.read();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot back up: local database at ${dbPath} is not a valid workspace: ${message}`,
      { cause: error }
    );
  }

  if (dryRun) {
    stdout(`Dry run: would back up local database at ${dbPath}`);
    stdout(`Dry run: backup destination would be ${destination}`);
    if (destinationExists && !force) {
      stdout(
        `Dry run: destination already exists; a real backup would need --force to overwrite ${destination}`
      );
    }
    return { dryRun: true, dbPath, destination };
  }

  const written = await store.backupTo(destination, { force });

  stdout(`Backed up local database at ${dbPath}`);
  stdout(`Backup written to ${written}`);
  stdout(formatBackupRestoreHint(dbPath, written));
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
