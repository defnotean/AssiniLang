import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  assertDesktopBackupReadable,
  resolveBackupDbFile
} = require("./backupRestore.cjs") as {
  assertDesktopBackupReadable: (
    backupDir: string,
    options: { readWorkspace: (dbPath: string) => Promise<unknown> }
  ) => Promise<string>;
  resolveBackupDbFile: (backupDir: string, manifest?: Record<string, unknown> | null) => string;
};

describe("desktop backup restore validation", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function createBackupFixture(options?: { dbName?: string; dbContents?: string; manifestDbPath?: string }) {
    const dir = mkdtempSync(join(tmpdir(), "assini-desktop-backup-"));
    tempDirs.push(dir);
    const dataDir = join(dir, "data");
    mkdirSync(dataDir, { recursive: true });
    const dbName = options?.dbName ?? "local-db.json";
    const dbPath = join(dataDir, dbName);
    writeFileSync(dbPath, options?.dbContents ?? '{"ok":true}', "utf8");
    writeFileSync(
      join(dir, "backup-manifest.json"),
      JSON.stringify({
        createdAt: "2026-07-09T00:00:00.000Z",
        dbPath: options?.manifestDbPath ?? `C:\\Users\\op\\AppData\\AssiniLang\\data\\${dbName}`
      }),
      "utf8"
    );
    return { dir, dbPath };
  }

  it("resolves the backup database from the manifest basename", () => {
    const { dir, dbPath } = createBackupFixture({ dbName: "workspace.json", manifestDbPath: "/tmp/workspace.json" });
    expect(resolveBackupDbFile(dir)).toBe(dbPath);
  });

  it("falls back to local-db.json when the manifest path is missing", () => {
    const { dir, dbPath } = createBackupFixture();
    writeFileSync(join(dir, "backup-manifest.json"), "{}", "utf8");
    expect(resolveBackupDbFile(dir)).toBe(dbPath);
  });

  it("validates a readable backup before restore", async () => {
    const { dir, dbPath } = createBackupFixture();
    const readWorkspace = vi.fn(async () => ({ languages: [] }));

    await expect(assertDesktopBackupReadable(dir, { readWorkspace })).resolves.toBe(dbPath);
    expect(readWorkspace).toHaveBeenCalledWith(dbPath);
  });

  it("rejects a corrupt backup without calling through as success", async () => {
    const { dir } = createBackupFixture({ dbContents: "{not-json" });
    const readWorkspace = vi.fn(async () => {
      throw new Error("Unexpected token");
    });

    await expect(assertDesktopBackupReadable(dir, { readWorkspace })).rejects.toThrow(
      /not a valid workspace/
    );
    expect(readWorkspace).toHaveBeenCalledOnce();
  });

  it("rejects a backup folder with no database file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "assini-desktop-empty-backup-"));
    tempDirs.push(dir);
    mkdirSync(join(dir, "data"), { recursive: true });
    writeFileSync(join(dir, "backup-manifest.json"), JSON.stringify({ createdAt: "2026-07-09T00:00:00.000Z" }), "utf8");

    await expect(
      assertDesktopBackupReadable(dir, {
        readWorkspace: async () => ({})
      })
    ).rejects.toThrow(/no readable database/);
  });
});
