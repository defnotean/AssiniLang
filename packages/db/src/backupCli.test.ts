import { mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSeedDbPath } from "./seedCli.js";
import {
  defaultBackupPath,
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

describe("runBackupCli", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    tempDirs.length = 0;
  });

  async function createTempDb(): Promise<{ dir: string; dbPath: string }> {
    const dir = await mkdtemp(join(tmpdir(), "assini-backup-cli-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "local-db.json");
    await writeFile(dbPath, '{"languages":[],"users":[]}', "utf8");
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
