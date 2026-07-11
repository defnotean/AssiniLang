import { link, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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
  it("detects dry-run, force, and destination arguments", () => {
    expect(parseBackupCliArgs(["--dry-run", "C:\\backups\\assini.json"])).toEqual({
      dryRun: true,
      force: false,
      destinationArg: "C:\\backups\\assini.json"
    });
    expect(parseBackupCliArgs(["--force", "C:\\backups\\assini.json"])).toEqual({
      dryRun: false,
      force: true,
      destinationArg: "C:\\backups\\assini.json"
    });
    expect(parseBackupCliArgs([])).toEqual({ dryRun: false, force: false, destinationArg: undefined });
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
    const { dbPath } = await createTempDb({ validWorkspace: true });
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

  it("dry-runs an existing destination without --force and warns that overwrite needs --force", async () => {
    const { dir, dbPath } = await createTempDb({ validWorkspace: true });
    const destination = join(dir, "existing-backup.json");
    await writeFile(destination, '{"stale":true}', "utf8");
    const stdout = vi.fn();

    const result = await runBackupCli({
      argv: ["--dry-run", destination],
      env: { ASSINI_DB_PATH: dbPath },
      stdout
    });

    expect(result.dryRun).toBe(true);
    expect(result.written).toBeUndefined();
    expect(await readFile(destination, "utf8")).toBe('{"stale":true}');
    expect(stdout).toHaveBeenCalledWith(`Dry run: would back up local database at ${resolve(dbPath)}`);
    expect(stdout).toHaveBeenCalledWith(`Dry run: backup destination would be ${resolve(destination)}`);
    expect(stdout).toHaveBeenCalledWith(
      `Dry run: destination already exists; a real backup would need --force to overwrite ${resolve(destination)}`
    );
  });

  it("dry-runs an existing destination with --force without the overwrite warning and without writing", async () => {
    const { dir, dbPath } = await createTempDb({ validWorkspace: true });
    const destination = join(dir, "existing-backup.json");
    await writeFile(destination, '{"stale":true}', "utf8");
    const stdout = vi.fn();

    const result = await runBackupCli({
      argv: ["--dry-run", "--force", destination],
      env: { ASSINI_DB_PATH: dbPath },
      stdout
    });

    expect(result.dryRun).toBe(true);
    expect(result.written).toBeUndefined();
    expect(await readFile(destination, "utf8")).toBe('{"stale":true}');
    expect(stdout).toHaveBeenCalledWith(`Dry run: would back up local database at ${resolve(dbPath)}`);
    expect(stdout).toHaveBeenCalledWith(`Dry run: backup destination would be ${resolve(destination)}`);
    expect(stdout).not.toHaveBeenCalledWith(expect.stringContaining("a real backup would need --force"));
  });

  it("rejects backing up an invalid workspace before writing a copy", async () => {
    const { dbPath } = await createTempDb({ validWorkspace: false });
    const destination = join(dirname(dbPath), "should-not-write.json");

    await expect(
      runBackupCli({
        argv: [destination],
        env: { ASSINI_DB_PATH: dbPath }
      })
    ).rejects.toThrow(/not a valid workspace/);
  });

  it("rejects dry-run when the live workspace is invalid and writes nothing", async () => {
    const { dbPath } = await createTempDb({ validWorkspace: false });
    const destination = join(dirname(dbPath), "should-not-write.json");
    const stdout = vi.fn();

    await expect(
      runBackupCli({
        argv: ["--dry-run", destination],
        env: { ASSINI_DB_PATH: dbPath },
        stdout
      })
    ).rejects.toThrow(/not a valid workspace/);
    await expect(readFile(destination, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(stdout).not.toHaveBeenCalled();
  });

  it("rejects backing up onto a Windows case-fold alias of the live database", async () => {
    if (process.platform !== "win32") {
      return;
    }
    const { dir, dbPath } = await createTempDb({ validWorkspace: true });
    const caseAlias = join(dir, "LOCAL-DB.JSON");

    await expect(
      runBackupCli({
        argv: [caseAlias],
        env: { ASSINI_DB_PATH: dbPath }
      })
    ).rejects.toThrow(/same as the live database/);
  });

  it("rejects dry-run and --force when the destination is a Windows case-fold alias", async () => {
    if (process.platform !== "win32") {
      return;
    }
    const { dir, dbPath } = await createTempDb({ validWorkspace: true });
    const caseAlias = join(dir, "LOCAL-DB.JSON");
    const stdout = vi.fn();

    await expect(
      runBackupCli({
        argv: ["--dry-run", caseAlias],
        env: { ASSINI_DB_PATH: dbPath },
        stdout
      })
    ).rejects.toThrow(/same as the live database/);
    await expect(
      runBackupCli({
        argv: ["--force", caseAlias],
        env: { ASSINI_DB_PATH: dbPath },
        stdout
      })
    ).rejects.toThrow(/same as the live database/);
    expect(stdout).not.toHaveBeenCalled();
  });

  it("rejects backing up onto a Windows \\\\?\\ extended-prefix alias of the live database", async () => {
    if (process.platform !== "win32") {
      return;
    }
    const { dbPath } = await createTempDb({ validWorkspace: true });
    const extendedAlias = `\\\\?\\${resolve(dbPath)}`;
    const stdout = vi.fn();

    await expect(
      runBackupCli({
        argv: [extendedAlias],
        env: { ASSINI_DB_PATH: dbPath },
        stdout
      })
    ).rejects.toThrow(/same as the live database/);
    await expect(
      runBackupCli({
        argv: ["--force", "--dry-run", extendedAlias],
        env: { ASSINI_DB_PATH: dbPath },
        stdout
      })
    ).rejects.toThrow(/same as the live database/);
    expect(stdout).not.toHaveBeenCalled();
  });

  it("rejects backing up onto a ..-normalized alias of the live database", async () => {
    const { dir, dbPath } = await createTempDb({ validWorkspace: true });
    const parentHopAlias = join(dir, "nested", "..", "local-db.json");

    await expect(
      runBackupCli({
        argv: [parentHopAlias],
        env: { ASSINI_DB_PATH: dbPath }
      })
    ).rejects.toThrow(/same as the live database/);
  });

  it("rejects backing up onto the live database path", async () => {
    const { dbPath } = await createTempDb({ validWorkspace: true });

    await expect(
      runBackupCli({
        argv: [dbPath],
        env: { ASSINI_DB_PATH: dbPath }
      })
    ).rejects.toThrow(/same as the live database/);
  });

  it("rejects --force when the destination is the live database path", async () => {
    const { dbPath } = await createTempDb({ validWorkspace: true });

    await expect(
      runBackupCli({
        argv: ["--force", dbPath],
        env: { ASSINI_DB_PATH: dbPath }
      })
    ).rejects.toThrow(/same as the live database/);
  });

  it("rejects backing up onto a hard-link alias of the live database", async () => {
    const { dir, dbPath } = await createTempDb({ validWorkspace: true });
    const hardLinkPath = join(dir, "hardlink-backup.json");
    await link(dbPath, hardLinkPath);

    await expect(
      runBackupCli({
        argv: [hardLinkPath],
        env: { ASSINI_DB_PATH: dbPath }
      })
    ).rejects.toThrow(/same as the live database/);
  });

  it("rejects backing up onto a directory destination with a clear file-path hint", async () => {
    const { dir, dbPath } = await createTempDb({ validWorkspace: true });
    const destinationDir = join(dir, "backups-dir");
    await mkdir(destinationDir, { recursive: true });

    await expect(
      runBackupCli({
        argv: [destinationDir],
        env: { ASSINI_DB_PATH: dbPath }
      })
    ).rejects.toThrow(/is a directory/);
    await expect(
      runBackupCli({
        argv: [destinationDir],
        env: { ASSINI_DB_PATH: dbPath }
      })
    ).rejects.toThrow(/Pass a file path/);
  });

  it("rejects overwriting an existing backup file unless --force is passed", async () => {
    const { dir, dbPath } = await createTempDb({ validWorkspace: true });
    const destination = join(dir, "existing-backup.json");
    await writeFile(destination, '{"stale":true}', "utf8");

    await expect(
      runBackupCli({
        argv: [destination],
        env: { ASSINI_DB_PATH: dbPath }
      })
    ).rejects.toThrow(/already exists/);
    expect(await readFile(destination, "utf8")).toBe('{"stale":true}');

    const stdout = vi.fn();
    const result = await runBackupCli({
      argv: ["--force", destination],
      env: { ASSINI_DB_PATH: dbPath },
      stdout
    });

    expect(result.written).toBe(resolve(destination));
    expect(await readFile(result.written!, "utf8")).toBe(await readFile(dbPath, "utf8"));
    expect(stdout).toHaveBeenCalledWith(`Backup written to ${result.written}`);
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

  it("backs up a SQLite workspace and restores through the printed JsonStore recipe", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-backup-cli-sqlite-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "local-db.sqlite");
    const destination = join(dir, "operator-backup.sqlite");
    const fixture = buildTestWorkspaceState();
    await new JsonStore(dbPath).write(fixture);
    const stdout = vi.fn();

    const result = await runBackupCli({
      argv: [destination],
      env: { ASSINI_DB_PATH: dbPath },
      stdout
    });

    expect(result.written).toBe(resolve(destination));
    expect(stdout).toHaveBeenCalledWith(formatBackupRestoreHint(resolve(dbPath), result.written!));

    // Corrupt the live SQLite file, then restore from the CLI backup path.
    await writeFile(dbPath, "not-a-sqlite-database", "utf8");
    await expect(new JsonStore(dbPath).read()).rejects.toThrow(dbPath);

    const restored = await new JsonStore(dbPath).restoreFrom(result.written!);
    expect(restored.languages).toEqual(fixture.languages);
    expect(await new JsonStore(dbPath).read()).toEqual(restored);
  });

  it("rejects backing up an invalid SQLite workspace before writing a copy", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-backup-cli-sqlite-bad-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "local-db.sqlite");
    const destination = join(dir, "should-not-write.sqlite");
    await writeFile(dbPath, "not-a-valid-sqlite-workspace", "utf8");

    await expect(
      runBackupCli({
        argv: [destination],
        env: { ASSINI_DB_PATH: dbPath }
      })
    ).rejects.toThrow(/not a valid workspace/);
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
