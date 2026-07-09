import { realpath as fsRealpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve as resolvePath, sep } from "node:path";

type Env = Record<string, string | undefined>;
type RealpathFn = (path: string) => Promise<string>;

export type VaultPathSafetyOptions = {
  env?: Env;
  realpathFn?: RealpathFn;
};

const VAULT_ROOTS_UNSET_MESSAGE =
  "Obsidian vault import is disabled until ASSINI_OBSIDIAN_VAULT_ROOTS is set to one or more semicolon-separated absolute directory roots.";

const VAULT_ROOTS_MUST_BE_ABSOLUTE_MESSAGE =
  "ASSINI_OBSIDIAN_VAULT_ROOTS entries must be absolute directory paths; relative roots are ignored.";

const VAULT_PATH_OUTSIDE_ALLOWLIST_MESSAGE =
  "Obsidian vault path is outside the configured ASSINI_OBSIDIAN_VAULT_ROOTS allowlist.";

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
 * Parses semicolon-separated absolute roots from ASSINI_OBSIDIAN_VAULT_ROOTS.
 * Empty/unset => []. Relative segments are dropped so CWD cannot silently widen
 * the allowlist (e.g. `./vaults` or `vaults` alone).
 */
export function parseObsidianVaultRoots(env: Env = process.env): string[] {
  const raw = env.ASSINI_OBSIDIAN_VAULT_ROOTS?.trim();
  if (!raw) return [];
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter(isAbsoluteVaultRoot)
    .map((part) => resolvePath(part));
}

function hasConfiguredVaultRootSegments(env: Env): boolean {
  const raw = env.ASSINI_OBSIDIAN_VAULT_ROOTS?.trim();
  if (!raw) return false;
  return raw.split(";").map((part) => part.trim()).some(Boolean);
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
    throw new Error(
      hasConfiguredVaultRootSegments(env) ? VAULT_ROOTS_MUST_BE_ABSOLUTE_MESSAGE : VAULT_ROOTS_UNSET_MESSAGE
    );
  }

  const realpathFn = options.realpathFn ?? fsRealpath;
  const resolvedVault = await resolveExistingPath(vaultPath, realpathFn);
  const resolvedRoots = await Promise.all(roots.map((root) => resolveExistingPath(root, realpathFn)));

  if (!resolvedRoots.some((root) => isPathInsideRoot(resolvedVault, root))) {
    throw new Error(VAULT_PATH_OUTSIDE_ALLOWLIST_MESSAGE);
  }

  return resolvedVault;
}
