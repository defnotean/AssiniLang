import { link, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonStore, pathsReferToSameFile } from "./store.js";
import { buildTestWorkspaceState } from "./testing.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "assini-store-backup-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const backends = [
  { label: "json", file: "db.json", backupFile: "backup.json" },
  { label: "sqlite", file: "db.sqlite", backupFile: "backup.sqlite" }
] as const;

describe.each(backends)("JsonStore backup/restore ($label)", ({ file, backupFile }) => {
  it("recovers the exact state after a backup -> corruption -> restore round trip", async () => {
    const dbPath = join(dir, file);
    const backupPath = join(dir, "backups", backupFile);
    const store = new JsonStore(dbPath);
    const fixture = buildTestWorkspaceState();
    await store.write(fixture);
    const before = await store.read();

    await store.backupTo(backupPath);
    await expect(stat(backupPath)).resolves.toBeDefined();

    // Corrupt the live database file in place.
    await writeFile(dbPath, "this is not a valid database", "utf8");
    await expect(store.read()).rejects.toThrow(dbPath);

    const restored = await store.restoreFrom(backupPath);
    expect(restored).toEqual(before);

    // The snapshot cache must reflect the restored data, not the corrupt file.
    const after = await store.read();
    expect(after).toEqual(before);
  });

  it("restores into a fresh store instance on a different path", async () => {
    const sourceStore = new JsonStore(join(dir, file));
    const fixture = buildTestWorkspaceState();
    await sourceStore.write(fixture);
    const expected = await sourceStore.read();

    const backupPath = join(dir, backupFile);
    await sourceStore.backupTo(backupPath);

    const targetStore = new JsonStore(join(dir, `restored-${file}`));
    await targetStore.restoreFrom(backupPath);
    expect(await targetStore.read()).toEqual(expected);
  });

  it("fails loudly with the database path when the backup does not parse, leaving live data intact", async () => {
    const dbPath = join(dir, file);
    const store = new JsonStore(dbPath);
    await store.write(buildTestWorkspaceState());
    const before = await store.read();

    const badBackupPath = join(dir, `bad-${backupFile}`);
    await writeFile(badBackupPath, "garbage that parses as neither JSON nor SQLite", "utf8");

    await expect(store.restoreFrom(badBackupPath)).rejects.toThrow(dbPath);
    expect(await store.read()).toEqual(before);
  });

  it("fails loudly when the backup file does not exist", async () => {
    const dbPath = join(dir, file);
    const store = new JsonStore(dbPath);
    await store.write(buildTestWorkspaceState());
    const before = await store.read();

    const missingPath = join(dir, "missing", backupFile);
    await expect(store.restoreFrom(missingPath)).rejects.toThrow(/backup not found/);
    await expect(store.restoreFrom(missingPath)).rejects.toThrow(dbPath);
    await expect(store.restoreFrom(missingPath)).rejects.toThrow(missingPath);
    expect(await store.read()).toEqual(before);
  });
});

it("json backup is a byte-for-byte copy of the live file", async () => {
  const dbPath = join(dir, "db.json");
  const store = new JsonStore(dbPath);
  await store.write(buildTestWorkspaceState());

  const backupPath = join(dir, "copy.json");
  await store.backupTo(backupPath);
  expect(await readFile(backupPath, "utf8")).toBe(await readFile(dbPath, "utf8"));
});

it("rejects backup and restore when the source and live paths are the same file", async () => {
  const dbPath = join(dir, "db.json");
  const store = new JsonStore(dbPath);
  await store.write(buildTestWorkspaceState());
  const before = await store.read();

  await expect(store.backupTo(dbPath)).rejects.toThrow(/destination must differ/);
  await expect(store.restoreFrom(dbPath)).rejects.toThrow(/backup source must differ/);
  expect(await store.read()).toEqual(before);
});

it("rejects backup when the destination is an existing directory", async () => {
  const dbPath = join(dir, "db.json");
  const destinationDir = join(dir, "backup-folder");
  const store = new JsonStore(dbPath);
  await store.write(buildTestWorkspaceState());
  await mkdir(destinationDir, { recursive: true });

  await expect(store.backupTo(destinationDir)).rejects.toThrow(/must be a file path, not a directory/);
});

it("rejects backup when the destination file already exists unless force is set", async () => {
  const dbPath = join(dir, "db.json");
  const destination = join(dir, "existing-backup.json");
  const store = new JsonStore(dbPath);
  await store.write(buildTestWorkspaceState());
  await writeFile(destination, '{"stale":true}', "utf8");

  await expect(store.backupTo(destination)).rejects.toThrow(/destination already exists/);
  expect(await readFile(destination, "utf8")).toBe('{"stale":true}');

  await expect(store.backupTo(destination, { force: true })).resolves.toBe(resolve(destination));
  expect(await readFile(destination, "utf8")).toBe(await readFile(dbPath, "utf8"));
});

it("force-overwrites an existing SQLite backup destination and remains restorable", async () => {
  const dbPath = join(dir, "db.sqlite");
  const destination = join(dir, "existing-backup.sqlite");
  const store = new JsonStore(dbPath);
  const fixture = buildTestWorkspaceState();
  await store.write(fixture);
  await writeFile(destination, "stale-not-sqlite", "utf8");

  await expect(store.backupTo(destination)).rejects.toThrow(/destination already exists/);
  expect(await readFile(destination, "utf8")).toBe("stale-not-sqlite");

  await expect(store.backupTo(destination, { force: true })).resolves.toBe(resolve(destination));
  const restored = await new JsonStore(join(dir, "restored-from-force.sqlite")).restoreFrom(destination);
  expect(restored.languages).toEqual(fixture.languages);
});

it("treats Windows case-only path aliases as the same file for backup and restore", async () => {
  const dbPath = join(dir, "db.json");
  const store = new JsonStore(dbPath);
  await store.write(buildTestWorkspaceState());
  const before = await store.read();
  const caseAlias = join(dir, "DB.JSON");

  if (process.platform === "win32") {
    expect(pathsReferToSameFile(dbPath, caseAlias)).toBe(true);
    await expect(store.backupTo(caseAlias)).rejects.toThrow(/destination must differ/);
    await expect(store.restoreFrom(caseAlias)).rejects.toThrow(/backup source must differ/);
    expect(await store.read()).toEqual(before);
    return;
  }

  // On POSIX, case-distinct paths are different files; the win32 branch is the
  // operator-relevant identity check. Still assert the helper stays case-sensitive.
  expect(pathsReferToSameFile(dbPath, caseAlias)).toBe(false);
});

it("rejects restore when the backup source is an existing directory", async () => {
  const dbPath = join(dir, "db.json");
  const sourceDir = join(dir, "restore-folder");
  const store = new JsonStore(dbPath);
  await store.write(buildTestWorkspaceState());
  const before = await store.read();
  await mkdir(sourceDir, { recursive: true });

  await expect(store.restoreFrom(sourceDir)).rejects.toThrow(/must be a file path, not a directory/);
  expect(await store.read()).toEqual(before);
});

it("treats a symlink alias of the live database as the same file", async () => {
  if (process.platform === "win32") {
    // Creating file symlinks on Windows often needs elevated privileges.
    return;
  }

  const dbPath = join(dir, "db.json");
  const aliasPath = join(dir, "alias-db.json");
  const store = new JsonStore(dbPath);
  await store.write(buildTestWorkspaceState());
  await symlink(dbPath, aliasPath);
  const before = await store.read();

  expect(pathsReferToSameFile(dbPath, aliasPath)).toBe(true);
  await expect(store.backupTo(aliasPath)).rejects.toThrow(/destination must differ/);
  await expect(store.restoreFrom(aliasPath)).rejects.toThrow(/backup source must differ/);
  expect(await store.read()).toEqual(before);
});

it("treats a hard-link alias of the live database as the same file", async () => {
  const dbPath = join(dir, "db.json");
  const hardLinkPath = join(dir, "hardlink-db.json");
  const store = new JsonStore(dbPath);
  await store.write(buildTestWorkspaceState());
  await link(dbPath, hardLinkPath);
  const before = await store.read();

  expect(pathsReferToSameFile(dbPath, hardLinkPath)).toBe(true);
  await expect(store.backupTo(hardLinkPath)).rejects.toThrow(/destination must differ/);
  await expect(store.restoreFrom(hardLinkPath)).rejects.toThrow(/backup source must differ/);
  expect(await store.read()).toEqual(before);
});

it("keeps the live json database readable when restore write fails after backup validation", async () => {
  const dbPath = join(dir, "db.json");
  const store = new JsonStore(dbPath);
  await store.write(buildTestWorkspaceState());
  const before = await store.read();
  const beforeBytes = await readFile(dbPath, "utf8");

  const backupPath = join(dir, "backup.json");
  await store.backupTo(backupPath);

  // Backup is already validated inside restoreFrom before any write; fail the
  // temp write so the live file must remain untouched.
  const writeSpy = vi.spyOn(JsonStore.prototype, "write").mockRejectedValueOnce(
    new Error("simulated restore write failure")
  );
  try {
    await expect(store.restoreFrom(backupPath)).rejects.toThrow(dbPath);
    expect(await store.read()).toEqual(before);
    expect(await readFile(dbPath, "utf8")).toBe(beforeBytes);
    const leftovers = (await readdir(dir)).filter((name) => name.includes("restore-tmp"));
    expect(leftovers).toEqual([]);
  } finally {
    writeSpy.mockRestore();
  }
});
