const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

/** Prefix for pre-restore safety copies; must start with `backup-` so restore/prune can see them. */
const SAFETY_BACKUP_PREFIX = "backup-safety-before-restore";
/** Legacy prefix from before safety copies used the restorable `backup-` naming. */
const LEGACY_SAFETY_BACKUP_PREFIX = "safety-before-restore";

/**
 * Routine and safety desktop backups both use a `backup-` folder name so they
 * appear in the restorable set. Legacy `safety-before-restore-…` folders remain
 * restorable so older installs can still recover. Safety copies are retained
 * longer by prune.
 */
function isRestorableBackupName(name) {
  return typeof name === "string" && (
    name.startsWith("backup-") ||
    name.startsWith(`${LEGACY_SAFETY_BACKUP_PREFIX}-`)
  );
}

function isSafetyBackupName(name) {
  return typeof name === "string" && (
    name.startsWith(`${SAFETY_BACKUP_PREFIX}-`) ||
    name.startsWith(`${LEGACY_SAFETY_BACKUP_PREFIX}-`)
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
 * True when `candidate` is the same path as `parent`, or a path nested under it.
 */
function isPathInsideOrSame(parentPath, candidatePath) {
  const parent = path.resolve(parentPath);
  const candidate = path.resolve(candidatePath);
  if (parent === candidate) {
    return true;
  }
  const relative = path.relative(parent, candidate);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Refuse restore when the backup folder overlaps the live data directory
 * (same path, backup nested under live, or live nested under backup). That
 * would wipe the source while copying, or copy live onto itself.
 */
function assertBackupDistinctFromLive(backupDir, liveDataDir) {
  if (typeof backupDir !== "string" || !backupDir.trim()) {
    throw new Error("Backup folder path is required before restore.");
  }
  if (typeof liveDataDir !== "string" || !liveDataDir.trim()) {
    throw new Error("Live desktop data path is required before restore.");
  }

  const backupRoot = path.resolve(backupDir);
  const liveRoot = path.resolve(liveDataDir);
  const backupData = path.join(backupRoot, "data");

  if (
    isPathInsideOrSame(liveRoot, backupRoot) ||
    isPathInsideOrSame(liveRoot, backupData) ||
    isPathInsideOrSame(backupRoot, liveRoot) ||
    isPathInsideOrSame(backupData, liveRoot)
  ) {
    throw new Error(
      `Refusing restore: backup folder ${backupRoot} overlaps the live data directory ${liveRoot}.`
    );
  }

  return { backupRoot, liveRoot };
}

/**
 * Serialize desktop restore so a second "Restore latest" cannot interleave
 * after the first has wiped live data but before copy completes.
 */
function createDesktopRestoreLock() {
  let inFlight = false;
  return {
    get inFlight() {
      return inFlight;
    },
    async run(work) {
      if (typeof work !== "function") {
        throw new Error("Restore lock requires a work function.");
      }
      if (inFlight) {
        throw new Error(
          "Refusing restore: a restore is already in progress. Wait for it to finish before starting another."
        );
      }
      inFlight = true;
      try {
        return await work();
      } finally {
        inFlight = false;
      }
    }
  };
}

/**
 * Split a manifest path into segments using both `/` and `\` so Windows
 * absolute paths recorded on one machine still parse on Linux CI/hosts.
 */
function splitManifestPathSegments(rawPath) {
  return String(rawPath)
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0);
}

/**
 * Map a manifest `dbPath` onto a file under the backup package's `data/` folder.
 * Accepts relative `data/...` entries, bare filenames, and absolute paths
 * (including Windows) by remapping basename or a trailing `data/...` suffix.
 * Never returns a path outside `dataDir`.
 *
 * @returns {{ candidate: string, label: string } | null}
 */
function mapManifestDbPathToBackupData(dataDir, rawDbPath) {
  if (typeof rawDbPath !== "string" || !rawDbPath.trim()) {
    return null;
  }

  const trimmed = rawDbPath.trim();
  const segments = splitManifestPathSegments(trimmed);
  if (segments.length === 0) {
    return null;
  }

  const dataIndex = segments.lastIndexOf("data");
  /** @type {string[]} */
  let relativeSegments;
  if (dataIndex >= 0 && dataIndex < segments.length - 1) {
    // Prefer the trailing `data/<file>` (or nested) segment from absolute paths.
    relativeSegments = segments.slice(dataIndex + 1);
  } else if (!path.isAbsolute(trimmed) && !/^[A-Za-z]:[\\/]/.test(trimmed)) {
    // Relative path recorded in the manifest (e.g. `data/local-db.json` or `local-db.json`).
    relativeSegments = segments[0] === "data" ? segments.slice(1) : segments;
  } else {
    // Absolute path without a `data` segment — use the final filename only.
    relativeSegments = [segments[segments.length - 1]];
  }

  if (
    relativeSegments.length === 0 ||
    relativeSegments.some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }

  const candidate = path.resolve(dataDir, ...relativeSegments);
  if (!isPathInsideOrSame(dataDir, candidate)) {
    return null;
  }

  return {
    candidate,
    label: relativeSegments.join("/")
  };
}

/**
 * Resolve the database file inside a desktop backup folder.
 * Prefers the path recorded in backup-manifest.json, remapped into this
 * backup's `data/` directory so Windows absolute paths restore on Linux.
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
    const mapped = mapManifestDbPathToBackupData(dataDir, parsed.dbPath);
    if (mapped && existsSync(mapped.candidate)) {
      return mapped.candidate;
    }
    const label = mapped?.label
      ?? splitManifestPathSegments(parsed.dbPath).at(-1)
      ?? parsed.dbPath.trim();
    // Manifest named a database file that is missing — do not silently fall back
    // to local-db.* (that could restore the wrong workspace).
    throw new Error(
      `Backup at ${root} lists database ${label} in backup-manifest.json, but that file is missing under data/.`
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
 * Prefer including `backupPath` so a failed wipe/copy can recover from that folder.
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

/**
 * Replace live desktop data from a backup folder. If the wipe/copy fails and a
 * safety backup folder is available, attempt to put live data back from that
 * safety copy before surfacing the original failure.
 *
 * `copyTree(sourceDir, targetDir)` should recursively replace target with source
 * (typically rmSync + cpSync). Optional settings copy uses the same helper.
 */
function replaceLiveDesktopDataFromBackup({
  sourceBackupDir,
  targetDataDir,
  targetSettingsPath = null,
  safetyBackupDir = null,
  copyTree
} = {}) {
  if (typeof copyTree !== "function") {
    throw new Error("copyTree is required to replace live desktop data.");
  }
  if (typeof sourceBackupDir !== "string" || !sourceBackupDir.trim()) {
    throw new Error("sourceBackupDir is required to replace live desktop data.");
  }
  if (typeof targetDataDir !== "string" || !targetDataDir.trim()) {
    throw new Error("targetDataDir is required to replace live desktop data.");
  }

  const sourceDataDir = path.join(path.resolve(sourceBackupDir), "data");
  const sourceSettingsPath = path.join(path.resolve(sourceBackupDir), ".env");

  if (!existsSync(sourceDataDir)) {
    throw new Error(`Backup at ${sourceBackupDir} has no data/ folder to restore.`);
  }

  const applyFrom = (backupDir) => {
    const dataDir = path.join(path.resolve(backupDir), "data");
    const settingsPath = path.join(path.resolve(backupDir), ".env");
    copyTree(dataDir, targetDataDir);
    if (targetSettingsPath && existsSync(settingsPath)) {
      copyTree(settingsPath, targetSettingsPath);
    }
  };

  try {
    applyFrom(sourceBackupDir);
    return { recoveredFromSafety: false };
  } catch (error) {
    const original = error instanceof Error ? error.message : String(error);
    const safetyRoot = typeof safetyBackupDir === "string" && safetyBackupDir.trim()
      ? path.resolve(safetyBackupDir)
      : null;
    const safetyData = safetyRoot ? path.join(safetyRoot, "data") : null;

    if (safetyRoot && safetyData && existsSync(safetyData)) {
      try {
        applyFrom(safetyRoot);
        const recovered = new Error(
          `Restore failed after wiping live data; recovered from safety backup at ${safetyRoot}. Original error: ${original}`,
          { cause: error }
        );
        recovered.recoveredFromSafety = true;
        recovered.safetyBackupDir = safetyRoot;
        throw recovered;
      } catch (recoveryError) {
        if (recoveryError && recoveryError.recoveredFromSafety) {
          throw recoveryError;
        }
        const recoveryMessage = recoveryError instanceof Error
          ? recoveryError.message
          : String(recoveryError);
        throw new Error(
          `Restore failed after wiping live data, and safety recovery also failed. Original error: ${original}. Recovery error: ${recoveryMessage}`,
          { cause: error }
        );
      }
    }

    throw new Error(
      `Restore failed after wiping live data and no safety backup was available to recover from. ${original}`,
      { cause: error }
    );
  }
}

module.exports = {
  LEGACY_SAFETY_BACKUP_PREFIX,
  SAFETY_BACKUP_PREFIX,
  assertBackupDistinctFromLive,
  assertDesktopBackupReadable,
  assertDesktopLiveDbReadable,
  assertSafetyBackupBeforeRestore,
  createDesktopRestoreLock,
  isPathInsideOrSame,
  isRestorableBackupName,
  isSafetyBackupName,
  pickPreferredRestoreBackup,
  replaceLiveDesktopDataFromBackup,
  resolveBackupDbFile
};
