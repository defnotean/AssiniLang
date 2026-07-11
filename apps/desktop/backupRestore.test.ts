import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
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
} = require("./backupRestore.cjs") as {
  LEGACY_SAFETY_BACKUP_PREFIX: string;
  SAFETY_BACKUP_PREFIX: string;
  assertBackupDistinctFromLive: (backupDir: string, liveDataDir: string) => { backupRoot: string; liveRoot: string };
  assertDesktopBackupReadable: (
    backupDir: string,
    options: { readWorkspace: (dbPath: string) => Promise<unknown> }
  ) => Promise<string>;
  assertDesktopLiveDbReadable: (
    dbPath: string,
    options: { readWorkspace: (dbPath: string) => Promise<unknown> }
  ) => Promise<string>;
  assertSafetyBackupBeforeRestore: (
    createSafetyBackup: () => Promise<{ ok?: boolean; message?: string; backupPath?: string } | null | undefined>
  ) => Promise<{ ok?: boolean; message?: string; backupPath?: string }>;
  createDesktopRestoreLock: () => {
    inFlight: boolean;
    run: <T>(work: () => Promise<T> | T) => Promise<T>;
  };
  isPathInsideOrSame: (parentPath: string, candidatePath: string) => boolean;
  isRestorableBackupName: (name: string) => boolean;
  isSafetyBackupName: (name: string) => boolean;
  pickPreferredRestoreBackup: <T extends { name: string }>(backups: T[]) => T | null;
  replaceLiveDesktopDataFromBackup: (options: {
    sourceBackupDir: string;
    targetDataDir: string;
    targetSettingsPath?: string | null;
    safetyBackupDir?: string | null;
    copyTree: (sourcePath: string, targetPath: string) => void;
  }) => { recoveredFromSafety: boolean };
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

  it("remaps Windows absolute manifest dbPath into the backup data folder", () => {
    const { dir, dbPath } = createBackupFixture({
      dbName: "local-db.json",
      manifestDbPath: "C:\\Users\\op\\AppData\\AssiniLang\\data\\local-db.json"
    });
    expect(resolveBackupDbFile(dir)).toBe(dbPath);
  });

  it("resolves relative data/ entries from the manifest into the backup package", () => {
    const { dir, dbPath } = createBackupFixture({
      dbName: "workspace.json",
      manifestDbPath: "data/workspace.json"
    });
    expect(resolveBackupDbFile(dir)).toBe(dbPath);
  });

  it("falls back to local-db.json when the manifest path is missing", () => {
    const { dir, dbPath } = createBackupFixture();
    writeFileSync(join(dir, "backup-manifest.json"), "{}", "utf8");
    expect(resolveBackupDbFile(dir)).toBe(dbPath);
  });

  it("refuses to fall back when the manifest names a missing database file", () => {
    const { dir } = createBackupFixture({
      dbName: "local-db.json",
      manifestDbPath: "/tmp/workspace-custom.json"
    });

    expect(() => resolveBackupDbFile(dir)).toThrow(/lists database workspace-custom\.json/);
  });

  it("refuses manifest paths that escape the backup data directory", () => {
    const { dir } = createBackupFixture({
      dbName: "local-db.json",
      manifestDbPath: "data/../outside.json"
    });

    expect(() => resolveBackupDbFile(dir)).toThrow(/lists database/);
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

    await expect(assertDesktopBackupReadable(dir, { readWorkspace })).rejects.toThrow(/not a valid workspace/);
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

  it("validates the live desktop database before create", async () => {
    const dir = mkdtempSync(join(tmpdir(), "assini-desktop-live-db-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "local-db.json");
    writeFileSync(dbPath, '{"ok":true}', "utf8");
    const readWorkspace = vi.fn(async () => ({ languages: [] }));

    await expect(assertDesktopLiveDbReadable(dbPath, { readWorkspace })).resolves.toBe(dbPath);
    expect(readWorkspace).toHaveBeenCalledWith(dbPath);
  });

  it("refuses create when the live database is missing", async () => {
    const missing = join(tmpdir(), "assini-missing-live-db.json");

    await expect(
      assertDesktopLiveDbReadable(missing, {
        readWorkspace: async () => ({})
      })
    ).rejects.toThrow(/live database is missing/);
  });

  it("refuses create when the live database is not a valid workspace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "assini-desktop-corrupt-live-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "local-db.json");
    writeFileSync(dbPath, "{not-json", "utf8");

    await expect(
      assertDesktopLiveDbReadable(dbPath, {
        readWorkspace: async () => {
          throw new Error("Unexpected token");
        }
      })
    ).rejects.toThrow(/not a valid workspace/);
  });

  it("treats safety backups as restorable and excludes them from routine prune", () => {
    expect(SAFETY_BACKUP_PREFIX).toBe("backup-safety-before-restore");
    expect(LEGACY_SAFETY_BACKUP_PREFIX).toBe("safety-before-restore");
    expect(isRestorableBackupName(`${SAFETY_BACKUP_PREFIX}-2026-07-09`)).toBe(true);
    expect(isRestorableBackupName("backup-2026-07-09")).toBe(true);
    expect(isRestorableBackupName(`${LEGACY_SAFETY_BACKUP_PREFIX}-2026-07-09`)).toBe(true);
    expect(isSafetyBackupName(`${SAFETY_BACKUP_PREFIX}-2026-07-09`)).toBe(true);
    expect(isSafetyBackupName(`${LEGACY_SAFETY_BACKUP_PREFIX}-legacy`)).toBe(true);
    expect(isSafetyBackupName("backup-2026-07-09")).toBe(false);
  });

  it("prefers the newest routine backup over a newer safety-before-restore copy", () => {
    const safety = { name: `${SAFETY_BACKUP_PREFIX}-2026-07-09T12-00-00` };
    const legacySafety = { name: `${LEGACY_SAFETY_BACKUP_PREFIX}-2026-07-09T12-30-00` };
    const routine = { name: "backup-2026-07-09T11-00-00" };
    // Newest-first list as restorableBackups() returns after a restore.
    expect(pickPreferredRestoreBackup([safety, routine])).toEqual(routine);
    expect(pickPreferredRestoreBackup([routine, safety])).toEqual(routine);
    expect(pickPreferredRestoreBackup([legacySafety, routine])).toEqual(routine);
    expect(pickPreferredRestoreBackup([safety])).toEqual(safety);
    expect(pickPreferredRestoreBackup([legacySafety])).toEqual(legacySafety);
    expect(pickPreferredRestoreBackup([])).toBeNull();
  });

  it("refuses restore when the safety backup fails, before live data would be wiped", async () => {
    const createSafetyBackup = vi.fn(async () => ({
      ok: false,
      message: "live database is missing"
    }));

    await expect(assertSafetyBackupBeforeRestore(createSafetyBackup)).rejects.toThrow(
      /Refusing restore: could not create a safety backup/
    );
    expect(createSafetyBackup).toHaveBeenCalledOnce();
  });

  it("allows restore to proceed only after a successful safety backup", async () => {
    const createSafetyBackup = vi.fn(async () => ({
      ok: true,
      message: "Created safety backup",
      backupPath: "C:\\Backups\\backup-safety-before-restore-1"
    }));

    await expect(assertSafetyBackupBeforeRestore(createSafetyBackup)).resolves.toEqual({
      ok: true,
      message: "Created safety backup",
      backupPath: "C:\\Backups\\backup-safety-before-restore-1"
    });
    expect(createSafetyBackup).toHaveBeenCalledOnce();
  });

  it("refuses restore when the backup folder overlaps the live data directory", () => {
    const root = mkdtempSync(join(tmpdir(), "assini-desktop-overlap-"));
    tempDirs.push(root);
    const live = join(root, "data");
    const nestedBackup = join(live, "backups", "backup-nested");
    mkdirSync(nestedBackup, { recursive: true });

    expect(() => assertBackupDistinctFromLive(nestedBackup, live)).toThrow(/overlaps the live data directory/);
    expect(() => assertBackupDistinctFromLive(live, live)).toThrow(/overlaps the live data directory/);
    expect(isPathInsideOrSame(live, nestedBackup)).toBe(true);

    const sibling = join(root, "backups", "backup-ok");
    mkdirSync(sibling, { recursive: true });
    expect(assertBackupDistinctFromLive(sibling, live)).toEqual({
      backupRoot: expect.any(String),
      liveRoot: expect.any(String)
    });
  });

  it("serializes restore so a second restore cannot start while one is in flight", async () => {
    const lock = createDesktopRestoreLock();
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = lock.run(async () => {
      await firstGate;
      return "first";
    });

    await expect(lock.run(async () => "second")).rejects.toThrow(/already in progress/);
    releaseFirst();
    await expect(first).resolves.toBe("first");
    await expect(lock.run(async () => "third")).resolves.toBe("third");
  });

  it("recovers live data from the safety backup when the restore copy fails after wipe", () => {
    const root = mkdtempSync(join(tmpdir(), "assini-desktop-recover-"));
    tempDirs.push(root);
    const source = createBackupFixture({ dbContents: '{"from":"source"}' });
    const safety = createBackupFixture({ dbContents: '{"from":"safety"}' });
    const liveData = join(root, "live-data");
    mkdirSync(liveData, { recursive: true });
    writeFileSync(join(liveData, "local-db.json"), '{"from":"live"}', "utf8");

    let calls = 0;
    const copyTree = vi.fn((_from: string, to: string) => {
      calls += 1;
      if (calls === 1) {
        throw new Error("disk full while copying restore source");
      }
      rmSync(to, { recursive: true, force: true });
      mkdirSync(to, { recursive: true });
      writeFileSync(join(to, "local-db.json"), '{"from":"safety"}', "utf8");
    });

    expect(() =>
      replaceLiveDesktopDataFromBackup({
        sourceBackupDir: source.dir,
        targetDataDir: liveData,
        safetyBackupDir: safety.dir,
        copyTree
      })
    ).toThrow(/recovered from safety backup/);

    expect(copyTree).toHaveBeenCalledTimes(2);
    expect(calls).toBe(2);
  });

  it("reports when restore fails and safety recovery is also unavailable", () => {
    const { dir: source } = createBackupFixture();
    const liveData = join(mkdtempSync(join(tmpdir(), "assini-desktop-no-safety-")), "live");
    tempDirs.push(join(liveData, ".."));

    expect(() =>
      replaceLiveDesktopDataFromBackup({
        sourceBackupDir: source,
        targetDataDir: liveData,
        safetyBackupDir: null,
        copyTree: () => {
          throw new Error("copy failed");
        }
      })
    ).toThrow(/no safety backup was available/);
  });
});
