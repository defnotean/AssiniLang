const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

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
    const candidate = path.join(dataDir, path.basename(parsed.dbPath));
    if (existsSync(candidate)) {
      return candidate;
    }
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

module.exports = {
  assertDesktopBackupReadable,
  resolveBackupDbFile
};
