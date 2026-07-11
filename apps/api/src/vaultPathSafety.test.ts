import { mkdir, mkdtemp, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertObsidianVaultPathAllowed,
  i18nKeyForVaultPathError,
  isFilesystemRootPath,
  isPathInsideRoot,
  parseObsidianVaultRoots,
  stripWindowsExtendedPrefix,
  VAULT_PATH_OUTSIDE_ALLOWLIST_MESSAGE,
  VAULT_ROOTS_MUST_NOT_BE_FILESYSTEM_ROOT_MESSAGE,
  VAULT_ROOTS_UNSET_MESSAGE
} from "./vaultPathSafety.js";

describe("Obsidian vault path safety", () => {
  it("maps allowlist English errors to ingest i18n keys", () => {
    expect(i18nKeyForVaultPathError(VAULT_ROOTS_UNSET_MESSAGE)).toBe("ingest.errorVaultRootsUnset");
    expect(i18nKeyForVaultPathError(VAULT_ROOTS_MUST_NOT_BE_FILESYSTEM_ROOT_MESSAGE)).toBe(
      "ingest.errorVaultRootsMustNotBeFilesystemRoot"
    );
    expect(i18nKeyForVaultPathError(VAULT_PATH_OUTSIDE_ALLOWLIST_MESSAGE)).toBe("ingest.errorVaultOutsideAllowlist");
    expect(i18nKeyForVaultPathError("unrelated")).toBeUndefined();
  });

  it("parses semicolon-separated roots and ignores blank segments", () => {
    expect(parseObsidianVaultRoots({ ASSINI_OBSIDIAN_VAULT_ROOTS: undefined })).toEqual([]);
    expect(parseObsidianVaultRoots({ ASSINI_OBSIDIAN_VAULT_ROOTS: "  ; ; " })).toEqual([]);
    const roots = parseObsidianVaultRoots({
      ASSINI_OBSIDIAN_VAULT_ROOTS: "C:\\Vaults; D:\\Notes ;"
    });
    expect(roots).toHaveLength(2);
    expect(roots.every((root) => root.length > 0)).toBe(true);
  });

  it("drops relative root segments so CWD cannot widen the allowlist", () => {
    expect(parseObsidianVaultRoots({ ASSINI_OBSIDIAN_VAULT_ROOTS: "./vaults;vaults" })).toEqual([]);
    expect(
      parseObsidianVaultRoots({
        ASSINI_OBSIDIAN_VAULT_ROOTS: "C:\\Vaults;./relative;D:\\Notes"
      })
    ).toEqual(parseObsidianVaultRoots({ ASSINI_OBSIDIAN_VAULT_ROOTS: "C:\\Vaults;D:\\Notes" }));
  });

  it("drops filesystem / drive roots so whole-volume allowlists cannot widen imports", () => {
    expect(isFilesystemRootPath("C:\\")).toBe(true);
    expect(isFilesystemRootPath("C:/")).toBe(true);
    expect(isFilesystemRootPath("C:")).toBe(true);
    expect(isFilesystemRootPath("/")).toBe(true);
    expect(isFilesystemRootPath("C:\\Vaults")).toBe(false);
    expect(isFilesystemRootPath("\\\\server\\share")).toBe(false);

    expect(parseObsidianVaultRoots({ ASSINI_OBSIDIAN_VAULT_ROOTS: "C:\\;/;C:/;C:" })).toEqual([]);
    // Windows drive strings must stay lexical on every host (no POSIX resolve into CWD).
    expect(
      parseObsidianVaultRoots({
        ASSINI_OBSIDIAN_VAULT_ROOTS: "C:\\;C:\\Vaults;/"
      })
    ).toEqual(["C:\\Vaults"]);
  });

  it("treats a path as inside a root only when equal or a descendant", () => {
    const root = join(tmpdir(), "assini-vault-root");
    expect(isPathInsideRoot(root, root)).toBe(true);
    expect(isPathInsideRoot(join(root, "notes"), root)).toBe(true);
    expect(isPathInsideRoot(join(root, "..", "outside"), root)).toBe(false);
  });

  it("strips Windows extended-length path prefixes before compare", () => {
    expect(stripWindowsExtendedPrefix("\\\\?\\C:\\Users\\vault")).toBe("C:\\Users\\vault");
    expect(stripWindowsExtendedPrefix("\\\\?\\UNC\\server\\share\\notes")).toBe("\\\\server\\share\\notes");
    expect(stripWindowsExtendedPrefix("/posix/unchanged")).toBe("/posix/unchanged");
  });

  it("treats realpath-style \\?\\ prefixes as inside the same root", () => {
    const root = "C:\\Users\\Demon\\Vaults";
    const prefixedChild = "\\\\?\\C:\\Users\\Demon\\Vaults\\Language Vault";
    const prefixedRoot = "\\\\?\\C:\\Users\\Demon\\Vaults";

    expect(isPathInsideRoot(prefixedChild, root)).toBe(true);
    expect(isPathInsideRoot(prefixedChild, prefixedRoot)).toBe(true);
    expect(isPathInsideRoot("\\\\?\\C:\\Users\\Demon\\Outside", root)).toBe(false);
  });

  it("fails closed when ASSINI_OBSIDIAN_VAULT_ROOTS is unset", async () => {
    await expect(assertObsidianVaultPathAllowed(join(tmpdir(), "vault"), { env: {} })).rejects.toThrow(
      /ASSINI_OBSIDIAN_VAULT_ROOTS is set/
    );
  });

  it("treats blank-only ASSINI_OBSIDIAN_VAULT_ROOTS as unset", async () => {
    await expect(
      assertObsidianVaultPathAllowed(join(tmpdir(), "vault"), {
        env: { ASSINI_OBSIDIAN_VAULT_ROOTS: "  ; ; " }
      })
    ).rejects.toThrow(/ASSINI_OBSIDIAN_VAULT_ROOTS is set/);
  });

  it("fails closed with an absolute-path message when only relative roots are configured", async () => {
    await expect(
      assertObsidianVaultPathAllowed(join(tmpdir(), "vault"), {
        env: { ASSINI_OBSIDIAN_VAULT_ROOTS: "./vaults;relative-root" }
      })
    ).rejects.toThrow(/must be absolute directory paths/);
  });

  it("fails closed when only filesystem / drive roots are configured", async () => {
    await expect(
      assertObsidianVaultPathAllowed(join(tmpdir(), "vault"), {
        env: { ASSINI_OBSIDIAN_VAULT_ROOTS: "C:\\;/;C:/" }
      })
    ).rejects.toThrow(/below a drive or volume root/);
  });

  it("rejects vaultPath values that contain NUL or other control characters", async () => {
    const allowedRoot = await mkdtemp(join(tmpdir(), "assini-allowed-"));
    await expect(
      assertObsidianVaultPathAllowed(`${allowedRoot}\\vault\0nested`, {
        env: { ASSINI_OBSIDIAN_VAULT_ROOTS: allowedRoot }
      })
    ).rejects.toThrow(/outside the configured ASSINI_OBSIDIAN_VAULT_ROOTS allowlist/);
  });

  it("rejects paths outside the allowlist after resolve", async () => {
    const allowedRoot = await mkdtemp(join(tmpdir(), "assini-allowed-"));
    const outside = await mkdtemp(join(tmpdir(), "assini-outside-"));

    await expect(
      assertObsidianVaultPathAllowed(outside, {
        env: { ASSINI_OBSIDIAN_VAULT_ROOTS: allowedRoot }
      })
    ).rejects.toThrow(/outside the configured ASSINI_OBSIDIAN_VAULT_ROOTS allowlist/);
  });

  it("accepts a vault under an allowlisted root", async () => {
    const allowedRoot = await mkdtemp(join(tmpdir(), "assini-allowed-"));
    const vaultPath = join(allowedRoot, "Language Vault");
    await mkdir(vaultPath, { recursive: true });
    const canonicalRoot = await realpath(allowedRoot);

    const resolved = await assertObsidianVaultPathAllowed(vaultPath, {
      env: { ASSINI_OBSIDIAN_VAULT_ROOTS: allowedRoot }
    });
    // Compare against the realpathed root: Windows may canonicalize short/long names.
    expect(isPathInsideRoot(resolved, canonicalRoot)).toBe(true);
  });

  it("accepts a not-yet-created vault under an allowlisted root", async () => {
    const allowedRoot = await mkdtemp(join(tmpdir(), "assini-allowed-"));
    const vaultPath = join(allowedRoot, "Language Vault", "nested");
    const canonicalRoot = await realpath(allowedRoot);

    const resolved = await assertObsidianVaultPathAllowed(vaultPath, {
      env: { ASSINI_OBSIDIAN_VAULT_ROOTS: allowedRoot }
    });
    expect(isPathInsideRoot(resolved, canonicalRoot)).toBe(true);
  });

  it("rejects symlink escapes that leave the allowlisted root", async () => {
    if (process.platform === "win32") {
      // Creating directory symlinks on Windows often needs elevated privileges.
      return;
    }

    const allowedRoot = await mkdtemp(join(tmpdir(), "assini-allowed-"));
    const outside = await mkdtemp(join(tmpdir(), "assini-outside-"));
    const escapeLink = join(allowedRoot, "escape");
    await symlink(outside, escapeLink);

    await expect(
      assertObsidianVaultPathAllowed(escapeLink, {
        env: { ASSINI_OBSIDIAN_VAULT_ROOTS: allowedRoot }
      })
    ).rejects.toThrow(/outside the configured ASSINI_OBSIDIAN_VAULT_ROOTS allowlist/);
  });
});
