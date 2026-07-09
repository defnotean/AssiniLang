import { realpath as fsRealpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve as resolvePath, sep } from "node:path";

type Env = Record<string, string | undefined>;
type RealpathFn = (path: string) => Promise<string>;

export type VaultPathSafetyOptions = {
  env?: Env;
  realpathFn?: RealpathFn;
};

export const VAULT_ROOTS_UNSET_MESSAGE =
  "Obsidian vault import is disabled until ASSINI_OBSIDIAN_VAULT_ROOTS is set to one or more semicolon-separated absolute directory roots.";

export const VAULT_ROOTS_MUST_BE_ABSOLUTE_MESSAGE =
  "ASSINI_OBSIDIAN_VAULT_ROOTS entries must be absolute directory paths; relative roots are ignored.";

export const VAULT_ROOTS_MUST_NOT_BE_FILESYSTEM_ROOT_MESSAGE =
  "ASSINI_OBSIDIAN_VAULT_ROOTS entries must be directories below a drive or volume root; filesystem roots like C:\\ or / are ignored.";

export const VAULT_PATH_OUTSIDE_ALLOWLIST_MESSAGE =
  "Obsidian vault path is outside the configured ASSINI_OBSIDIAN_VAULT_ROOTS allowlist.";

export const VAULT_PATH_NOT_DIRECTORY_MESSAGE = "Obsidian vault path is not a directory.";

export const VAULT_PATH_UNREADABLE_MESSAGE = "Obsidian vault path could not be read.";

/** Maps vault allowlist / path-safety English errors to web i18n keys. */
export function i18nKeyForVaultPathError(message: string): string | undefined {
  switch (message) {
    case VAULT_ROOTS_UNSET_MESSAGE:
      return "ingest.errorVaultRootsUnset";
    case VAULT_ROOTS_MUST_BE_ABSOLUTE_MESSAGE:
      return "ingest.errorVaultRootsMustBeAbsolute";
    case VAULT_ROOTS_MUST_NOT_BE_FILESYSTEM_ROOT_MESSAGE:
      return "ingest.errorVaultRootsMustNotBeFilesystemRoot";
    case VAULT_PATH_OUTSIDE_ALLOWLIST_MESSAGE:
      return "ingest.errorVaultOutsideAllowlist";
    case VAULT_PATH_NOT_DIRECTORY_MESSAGE:
      return "ingest.errorVaultNotDirectory";
    case VAULT_PATH_UNREADABLE_MESSAGE:
      return "ingest.errorVaultUnreadable";
    default:
      return undefined;
  }
}

/**
 * Strips Windows extended-length path prefixes so realpath (\\?\...) and resolve(...) paths compare equal.
 * \\?\UNC\server\share -> \\server\share; \\?\C:\foo -> C:\foo
 * Always applied (not platform-gated) so Linux CI can still validate Windows path strings.
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

function looksLikeWindowsAbsolutePath(pathValue: string): boolean {
  const stripped = stripWindowsExtendedPrefix(pathValue);
  return /^[A-Za-z]:[\\/]/.test(stripped) || stripped.startsWith("\\\\");
}

function normalizeForCompare(pathValue: string): string {
  const stripped = stripWindowsExtendedPrefix(pathValue);
  return process.platform === "win32" || looksLikeWindowsAbsolutePath(stripped)
    ? stripped.replace(/\//g, "\\").toLowerCase()
    : stripped;
}

/** True when candidate equals root or is a descendant of root (after resolve). */
export function isPathInsideRoot(candidate: string, root: string): boolean {
  const strippedCandidate = stripWindowsExtendedPrefix(candidate);
  const strippedRoot = stripWindowsExtendedPrefix(root);

  // Windows-style absolute paths must not go through posix resolve on Linux CI hosts,
  // or drive-letter paths get rewritten into the current working directory.
  if (looksLikeWindowsAbsolutePath(strippedCandidate) || looksLikeWindowsAbsolutePath(strippedRoot)) {
    const normalizedCandidate = normalizeForCompare(strippedCandidate);
    const normalizedRoot = normalizeForCompare(strippedRoot);
    if (normalizedCandidate === normalizedRoot) {
      return true;
    }
    const prefix = normalizedRoot.endsWith("\\") ? normalizedRoot : `${normalizedRoot}\\`;
    return normalizedCandidate.startsWith(prefix);
  }

  const normalizedCandidate = resolvePath(strippedCandidate);
  const normalizedRoot = resolvePath(strippedRoot);
  if (normalizeForCompare(normalizedCandidate) === normalizeForCompare(normalizedRoot)) {
    return true;
  }
  const prefix = normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`;
  return normalizeForCompare(normalizedCandidate).startsWith(normalizeForCompare(prefix));
}

function isAbsoluteVaultRoot(pathValue: string): boolean {
  return isAbsolute(pathValue) || looksLikeWindowsAbsolutePath(pathValue);
}

/**
 * True for drive/volume roots that would allowlist the entire filesystem
 * (e.g. `C:\`, `C:/`, `/`). UNC share roots like `\\server\share` are kept.
 * Always evaluates Windows-shaped paths so Linux CI can validate them.
 */
export function isFilesystemRootPath(pathValue: string): boolean {
  const stripped = stripWindowsExtendedPrefix(pathValue.trim());
  if (!stripped) return false;

  if (looksLikeWindowsAbsolutePath(stripped)) {
    const normalized = stripped.replace(/\//g, "\\").replace(/\\+$/g, "");
    // `C:` / `C:\` (no further segments)
    if (/^[A-Za-z]:$/i.test(normalized)) return true;
    return false;
  }

  if (stripped === "/" || stripped === "\\") return true;

  // On POSIX hosts, resolve("/") stays "/"; on Windows resolve("/") becomes a drive root.
  const resolved = resolvePath(stripped);
  if (looksLikeWindowsAbsolutePath(resolved)) {
    return isFilesystemRootPath(resolved);
  }
  return resolved === "/" || resolved === sep;
}

/**
 * Parses semicolon-separated absolute roots from ASSINI_OBSIDIAN_VAULT_ROOTS.
 * Empty/unset => []. Relative segments and filesystem roots (`C:\`, `/`) are
 * dropped so CWD / whole-drive allowlists cannot silently widen imports.
 */
export function parseObsidianVaultRoots(env: Env = process.env): string[] {
  const raw = env.ASSINI_OBSIDIAN_VAULT_ROOTS?.trim();
  if (!raw) return [];
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter(isAbsoluteVaultRoot)
    .map((part) => resolvePath(part))
    .filter((part) => !isFilesystemRootPath(part));
}

function configuredVaultRootSegments(env: Env): string[] {
  const raw = env.ASSINI_OBSIDIAN_VAULT_ROOTS?.trim();
  if (!raw) return [];
  return raw.split(";").map((part) => part.trim()).filter(Boolean);
}

function vaultRootsConfigError(env: Env): Error {
  const segments = configuredVaultRootSegments(env);
  if (segments.length === 0) {
    return new Error(VAULT_ROOTS_UNSET_MESSAGE);
  }

  const absoluteSegments = segments.filter(isAbsoluteVaultRoot);
  if (absoluteSegments.length === 0) {
    return new Error(VAULT_ROOTS_MUST_BE_ABSOLUTE_MESSAGE);
  }

  // Absolute segments were present but all were drive/volume roots (or resolved to them).
  return new Error(VAULT_ROOTS_MUST_NOT_BE_FILESYSTEM_ROOT_MESSAGE);
}

function pathHasUnsafeControlChars(pathValue: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(pathValue);
}

async function resolveExistingPath(pathValue: string, realpathFn: RealpathFn): Promise<string> {
  const resolved = resolvePath(pathValue);
  try {
    return await realpathFn(resolved);
  } catch {
    const trailingSegments: string[] = [];
    let current = resolved;

    while (true) {
      try {
        const canonical = await realpathFn(current);
        return trailingSegments.length === 0 ? canonical : join(canonical, ...trailingSegments.reverse());
      } catch {
        const parent = resolvePath(current, "..");
        if (parent === current) {
          return resolved;
        }
        const segment = relative(parent, current);
        if (segment === "" || segment === ".") {
          return resolved;
        }
        trailingSegments.push(segment);
        current = parent;
      }
    }
  }
}

/**
 * Resolves vaultPath and asserts it equals or is under an allowlisted root.
 * Fail-closed: unset/empty ASSINI_OBSIDIAN_VAULT_ROOTS rejects all imports.
 * Prefers realpath so symlink escapes cannot leave an allowlisted root.
 */
export async function assertObsidianVaultPathAllowed(
  vaultPath: string,
  options: VaultPathSafetyOptions = {}
): Promise<string> {
  const env = options.env ?? process.env;
  const roots = parseObsidianVaultRoots(env);
  if (roots.length === 0) {
    throw vaultRootsConfigError(env);
  }

  if (pathHasUnsafeControlChars(vaultPath)) {
    throw new Error(VAULT_PATH_OUTSIDE_ALLOWLIST_MESSAGE);
  }

  const realpathFn = options.realpathFn ?? fsRealpath;
  const resolvedVault = await resolveExistingPath(vaultPath, realpathFn);
  const resolvedRoots = await Promise.all(roots.map((root) => resolveExistingPath(root, realpathFn)));

  // Defense in depth: a root that canonicalizes to a drive/volume root must not
  // widen the allowlist even if it slipped past parse-time filtering.
  const usableRoots = resolvedRoots.filter((root) => !isFilesystemRootPath(root));
  if (usableRoots.length === 0) {
    throw new Error(VAULT_ROOTS_MUST_NOT_BE_FILESYSTEM_ROOT_MESSAGE);
  }

  if (!usableRoots.some((root) => isPathInsideRoot(resolvedVault, root))) {
    throw new Error(VAULT_PATH_OUTSIDE_ALLOWLIST_MESSAGE);
  }

  return resolvedVault;
}
