import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { rename, unlink } from "node:fs/promises";
import { basename, dirname, resolve, join } from "node:path";

/**
 * Strips Windows extended-length path prefixes so realpath (`\\?\...`) and
 * resolve(...) paths compare equal. `\\?\UNC\server\share` -> `\\server\share`;
 * `\\?\C:\foo` -> `C:\foo`. Always applied (not platform-gated) so Linux CI can
 * still validate Windows path strings.
 */
export function stripWindowsExtendedPrefix(pathValue: string): string {
  if (pathValue.startsWith("\\\\?\\UNC\\")) {
    return `\\\\${pathValue.slice("\\\\?\\UNC\\".length)}`;
  }
  if (pathValue.startsWith("\\\\?\\")) {
    return pathValue.slice("\\\\?\\".length);
  }
  return pathValue;
}

function normalizeWindowsPathForIdentity(pathValue: string): string {
  return stripWindowsExtendedPrefix(pathValue).replace(/\//g, "\\").toLowerCase();
}

/**
 * Canonicalize a path for same-file checks. Prefer realpath so a symlink alias
 * of the live database is treated as the same file; fall back to resolve when
 * the path does not exist yet (typical for a new backup destination). Strip
 * Windows `\\?\` prefixes first â€” Node's realpath/resolve leave them intact and
 * string compares would otherwise miss same-file aliases.
 */
function canonicalizePathForIdentity(pathValue: string): string {
  const resolved = resolve(stripWindowsExtendedPrefix(pathValue));
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

/**
 * True when two filesystem paths refer to the same location after resolve +
 * realpath (case-insensitive on Windows, including `\\?\` extended prefixes),
 * or when both exist as the same inode/device (hard-link aliases). Catches
 * symlink and hard-link aliases of the live database so backup/restore cannot
 * overwrite the source through a different path string.
 */
export function pathsReferToSameFile(left: string, right: string): boolean {
  const normalizedLeft = canonicalizePathForIdentity(left);
  const normalizedRight = canonicalizePathForIdentity(right);
  const sameResolvedPath =
    process.platform === "win32"
      ? normalizeWindowsPathForIdentity(normalizedLeft) === normalizeWindowsPathForIdentity(normalizedRight)
      : normalizedLeft === normalizedRight;
  if (sameResolvedPath) {
    return true;
  }

  // Hard links share device+inode while keeping distinct path strings (realpath
  // does not collapse them the way it collapses symlink aliases).
  try {
    const leftStat = statSync(normalizedLeft);
    const rightStat = statSync(normalizedRight);
    if (
      leftStat.isFile() &&
      rightStat.isFile() &&
      leftStat.dev === rightStat.dev &&
      leftStat.ino === rightStat.ino &&
      leftStat.ino !== 0
    ) {
      return true;
    }
  } catch {
    // One or both paths may not exist yet (typical for a new backup destination).
  }

  return false;
}

/**
 * Replaces `destPath` with `tempPath`. Prefers a single rename; on platforms
 * that cannot rename over an existing file (Windows), moves the live file
 * aside first and restores it if the final rename fails.
 */
export async function replaceFileAtomically(tempPath: string, destPath: string): Promise<void> {
  try {
    await rename(tempPath, destPath);
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST" && code !== "EPERM" && code !== "EACCES") {
      throw error;
    }
  }

  const previousPath = join(dirname(destPath), `.${basename(destPath)}.${randomUUID()}.prev`);
  await rename(destPath, previousPath);
  try {
    await rename(tempPath, destPath);
  } catch (error) {
    await rename(previousPath, destPath).catch(() => undefined);
    throw error;
  }
  await unlink(previousPath).catch(() => undefined);
}
