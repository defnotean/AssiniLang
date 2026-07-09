const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

/** Prefix for pre-restore safety copies; must start with `backup-` so restore/prune can see them. */
const SAFETY_BACKUP_PREFIX = "backup-safety-before-restore";

/**
 * Routine and safety desktop backups both use a `backup-` folder name so they
 * appear in the restorable set. Safety copies are retained longer by prune.
 */
function isRestorableBackupName(name) {
  return typeof name === "string" && name.startsWith("backup-");
}

function isSafetyBackupName(name) {
  return typeof name === "string" && (
    name.startsWith(`${SAFETY_BACKUP_PREFIX}-`) ||
    // Legacy prefix from before safety copies were restorable.
    name.startsWith("safety-before-restore-")
  );
}

/**
 * Prefer the newest routine backup for "restore latest" / "open latest".
 * Safety-before-restore copies stay restorable (and are kept by prune) but must
 * not become the default target after a successful restore — otherwise a second
 * "Restore latest" would undo the restore by applying the pre-restore snapshot.
 * Falls back to a safety backup only when no routine backup exists.
 *
 * @param {Array<{ name: string }>} backups Newest-first restorable list.
 */
function pickPreferredRestoreBackup(backups) {
  if (!Array.isArray(backups) || backups.length === 0) {
    return null;
  }
  const routine = backups.find((entry) => entry && !isSafetyBackupName(entry.name));
  return routine ?? backups[0] ?? null;
}

/**
 * Resolve the database file inside a desktop backup folder.
 * Prefers the basename recorded in backup-manifest.json when present.
 */
function resolveBackupDbFile(backupDir, manifest = null) {
  const root = path.resolve(backupDir);
  const dataDir = path.join(root, "data");
  let parsed = manifest;
  if (!parsed) {
    try {
      parsed = JSON.parse(readFileSync(path.join(root, "backup-manifest.json"), "utf8"));
    } catch {
      parsed = {};
    }
  }

  if (parsed && typeof parsed.dbPath === "string" && parsed.dbPath.trim()) {
    const basename = path.basename(parsed.dbPath);
    const candidate = path.join(dataDir, basename);
    if (existsSync(candidate)) {
      return candidate;
    }
    // Manifest named a database file that is missing — do not silently fall back
    // to local-db.* (that could restore the wrong workspace).
    throw new Error(
      `Backup at ${root} lists database ${basename} in backup-manifest.json, but that file is missing under data/.`
    );
  }

  for (const name of ["local-db.json", "local-db.sqlite"]) {
    const candidate = path.join(dataDir, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Backup at ${root} has no readable database under data/.`);
}

/**
 * Schema-validate the live desktop database before creating a backup.
 * Matches CLI `npm run db:backup`, which refuses to archive an invalid workspace.
 * `readWorkspace(dbPath)` should parse/validate the file (e.g. JsonStore.read).
 */
async function assertDesktopLiveDbReadable(dbPath, { readWorkspace } = {}) {
  if (typeof readWorkspace !== "function") {
    throw new Error("readWorkspace is required to validate the live desktop database.");
  }
  if (typeof dbPath !== "string" || !dbPath.trim()) {
    throw new Error("Desktop database path is not configured.");
  }
  if (!existsSync(dbPath)) {
    throw new Error(`Cannot create backup: live database is missing at ${dbPath}.`);
  }
  try {
    await readWorkspace(dbPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot create backup: live database at ${dbPath} is not a valid workspace: ${message}`,
      { cause: error }
    );
  }
  return dbPath;
}

/**
 * Schema-validate a desktop backup database before replacing live data.
 * `readWorkspace(dbPath)` should parse/validate the file (e.g. JsonStore.read).
 */
async function assertDesktopBackupReadable(backupDir, { readWorkspace } = {}) {
  if (typeof readWorkspace !== "function") {
    throw new Error("readWorkspace is required to validate a desktop backup.");
  }

  const dbPath = resolveBackupDbFile(backupDir);
  try {
    await readWorkspace(dbPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Backup database is not a valid workspace: ${message}`, { cause: error });
  }
  return dbPath;
}

/**
 * Gate desktop restore on a successful safety backup.
 * `createSafetyBackup` should return `{ ok: true }` or `{ ok: false, message? }`.
 */
async function assertSafetyBackupBeforeRestore(createSafetyBackup) {
  if (typeof createSafetyBackup !== "function") {
    throw new Error("createSafetyBackup is required before replacing live desktop data.");
  }
  const safety = await createSafetyBackup();
  if (!safety || safety.ok !== true) {
    const detail = safety && typeof safety.message === "string" && safety.message.trim()
      ? ` ${safety.message.trim()}`
      : "";
    throw new Error(
      `Refusing restore: could not create a safety backup before replacing live data.${detail}`
    );
  }
  return safety;
}

module.exports = {
  SAFETY_BACKUP_PREFIX,
  assertDesktopBackupReadable,
  assertDesktopLiveDbReadable,
  assertSafetyBackupBeforeRestore,
  isRestorableBackupName,
  isSafetyBackupName,
  pickPreferredRestoreBackup,
  resolveBackupDbFile
};
