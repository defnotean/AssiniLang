import { mkdir, mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertObsidianVaultPathAllowed,
  isPathInsideRoot,
  parseObsidianVaultRoots
} from "./vaultPathSafety.js";

describe("Obsidian vault path safety", () => {
  it("parses semicolon-separated roots and ignores blank segments", () => {
    expect(parseObsidianVaultRoots({ ASSINI_OBSIDIAN_VAULT_ROOTS: undefined })).toEqual([]);
    expect(parseObsidianVaultRoots({ ASSINI_OBSIDIAN_VAULT_ROOTS: "  ; ; " })).toEqual([]);
    const roots = parseObsidianVaultRoots({
      ASSINI_OBSIDIAN_VAULT_ROOTS: "C:\\Vaults; D:\\Notes ;"
    });
    expect(roots).toHaveLength(2);
    expect(roots.every((root) => root.length > 0)).toBe(true);
  });

  it("treats a path as inside a root only when equal or a descendant", () => {
    const root = join(tmpdir(), "assini-vault-root");
    expect(isPathInsideRoot(root, root)).toBe(true);
    expect(isPathInsideRoot(join(root, "notes"), root)).toBe(true);
    expect(isPathInsideRoot(join(root, "..", "outside"), root)).toBe(false);
  });

  it("fails closed when ASSINI_OBSIDIAN_VAULT_ROOTS is unset", async () => {
    await expect(assertObsidianVaultPathAllowed(join(tmpdir(), "vault"), { env: {} }))
      .rejects.toThrow(/ASSINI_OBSIDIAN_VAULT_ROOTS/);
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

    const resolved = await assertObsidianVaultPathAllowed(vaultPath, {
      env: { ASSINI_OBSIDIAN_VAULT_ROOTS: allowedRoot }
    });
    expect(isPathInsideRoot(resolved, allowedRoot)).toBe(true);
  });

  it("accepts a not-yet-created vault under an allowlisted root", async () => {
    const allowedRoot = await mkdtemp(join(tmpdir(), "assini-allowed-"));
    const vaultPath = join(allowedRoot, "Language Vault", "nested");

    const resolved = await assertObsidianVaultPathAllowed(vaultPath, {
      env: { ASSINI_OBSIDIAN_VAULT_ROOTS: allowedRoot }
    });
    expect(isPathInsideRoot(resolved, allowedRoot)).toBe(true);
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
