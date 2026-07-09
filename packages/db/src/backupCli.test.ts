import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSeedDbPath } from "./seedCli.js";
import { JsonStore } from "./store.js";
import { buildTestWorkspaceState } from "./testing.js";
import {
  defaultBackupPath,
  escapePathForJsString,
  formatBackupRestoreHint,
  parseBackupCliArgs,
  resolveBackupDbPath,
  runBackupCli
} from "./backupCli.js";

describe("backup CLI database path", () => {
  it("defaults to the same workspace path as seed", () => {
    expect(resolveBackupDbPath({})).toBe(defaultSeedDbPath);
  });

  it("honors ASSINI_DB_PATH including SQLite destinations", () => {
    const jsonPath = join("tmp", "assini-verify", "local-db.json");
    const sqlitePath = join("tmp", "assini-verify", "local-db.sqlite");

    expect(resolveBackupDbPath({ ASSINI_DB_PATH: ` ${jsonPath} ` })).toBe(resolve(jsonPath));
    expect(resolveBackupDbPath({ ASSINI_DB_PATH: ` ${sqlitePath} ` })).toBe(resolve(sqlitePath));
  });
});

describe("parseBackupCliArgs", () => {
  it("detects dry-run and destination arguments", () => {
    expect(parseBackupCliArgs(["--dry-run", "C:\\backups\\assini.json"])).toEqual({
      dryRun: true,
      destinationArg: "C:\\backups\\assini.json"
    });
    expect(parseBackupCliArgs([])).toEqual({ dryRun: false, destinationArg: undefined });
  });
});

describe("formatBackupRestoreHint", () => {
  it("embeds real escaped paths instead of a literal dbPath identifier", () => {
    const dbPath = "C:\\Users\\op\\data\\local-db.json";
    const backupPath = "C:\\Users\\op\\data\\backups\\local-db-2026.json";

    expect(formatBackupRestoreHint(dbPath, backupPath)).toBe(
      `Restore with: new JsonStore("${escapePathForJsString(dbPath)}").restoreFrom("${escapePathForJsString(backupPath)}")`
    );
    expect(formatBackupRestoreHint(dbPath, backupPath)).not.toContain("JsonStore(dbPath)");
    expect(formatBackupRestoreHint(dbPath, backupPath)).toContain(escapePathForJsString(dbPath));
    expect(formatBackupRestoreHint(dbPath, backupPath)).toContain(escapePathForJsString(backupPath));
  });
});

describe("runBackupCli", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function createTempDb(options?: { validWorkspace?: boolean }): Promise<{ dir: string; dbPath: string }> {
    const dir = await mkdtemp(join(tmpdir(), "assini-backup-cli-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "local-db.json");
    if (options?.validWorkspace) {
      await new JsonStore(dbPath).write(buildTestWorkspaceState());
    } else {
      await writeFile(dbPath, '{"languages":[],"users":[]}', "utf8");
    }
    return { dir, dbPath };
  }

  it("dry-runs without writing a backup file", async () => {
    const { dbPath } = await createTempDb();
    const stdout = vi.fn();
    const now = new Date("2026-07-09T08:00:00.000Z");

    const result = await runBackupCli({
      argv: ["--dry-run"],
      env: { ASSINI_DB_PATH: dbPath },
      now,
      stdout
    });

    expect(result.dryRun).toBe(true);
    expect(result.destination).toBe(defaultBackupPath(dbPath, now));
    expect(result.written).toBeUndefined();
    expect(stdout).toHaveBeenCalledWith(`Dry run: would back up local database at ${resolve(dbPath)}`);
    expect(stdout).toHaveBeenCalledWith(`Dry run: backup destination would be ${result.destination}`);
  });

  it("writes a validated backup copy to the requested destination", async () => {
    const { dir, dbPath } = await createTempDb({ validWorkspace: true });
    const destination = join(dir, "operator-backup.json");
    const stdout = vi.fn();

    const result = await runBackupCli({
      argv: [destination],
      env: { ASSINI_DB_PATH: dbPath },
      stdout
    });

    expect(result.dryRun).toBe(false);
    expect(result.written).toBe(resolve(destination));
    expect(await readFile(result.written!, "utf8")).toBe(await readFile(dbPath, "utf8"));
    expect(stdout).toHaveBeenCalledWith(`Backed up local database at ${resolve(dbPath)}`);
    expect(stdout).toHaveBeenCalledWith(`Backup written to ${result.written}`);
    expect(stdout).toHaveBeenCalledWith(formatBackupRestoreHint(resolve(dbPath), result.written!));
    const restoreHint = String(stdout.mock.calls.find((call) => String(call[0]).includes("Restore with:"))?.[0]);
    expect(restoreHint).toContain(escapePathForJsString(resolve(dbPath)));
    expect(restoreHint).toContain(escapePathForJsString(result.written!));
    expect(restoreHint).not.toContain("JsonStore(dbPath)");
  });

  it("reports a helpful error when the database file is missing", async () => {
    const missingPath = join(tmpdir(), "assini-missing-db.json");

    await expect(
      runBackupCli({
        argv: ["--dry-run"],
        env: { ASSINI_DB_PATH: missingPath }
      })
    ).rejects.toThrow(/Cannot back up: local database not found/);
    await expect(
      runBackupCli({
        argv: ["--dry-run"],
        env: { ASSINI_DB_PATH: missingPath }
      })
    ).rejects.toThrow(/npm run seed -w @assini\/db/);
  });
});
