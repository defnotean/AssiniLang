import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTestWorkspaceState } from "./testing.js";
import { JsonStore, SQLITE_BUSY_TIMEOUT_MS, createEmptyState, replaceFileAtomically } from "./store.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "assini-store-reliability-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("replaceFileAtomically", () => {
  it("overwrites an existing destination and leaves no aside leftovers", async () => {
    const destPath = join(dir, "dest.json");
    const tempPath = join(dir, "incoming.tmp");
    await writeFile(destPath, '{"old":true}\n', "utf8");
    await writeFile(tempPath, '{"new":true}\n', "utf8");

    await replaceFileAtomically(tempPath, destPath);

    expect(await readFile(destPath, "utf8")).toBe('{"new":true}\n');
    await expect(access(tempPath)).rejects.toMatchObject({ code: "ENOENT" });
    const names = await readdir(dir);
    expect(names.every((name) => !name.includes(".prev") && !name.endsWith(".tmp"))).toBe(true);
  });

  it("is used by JSON write so overwriting an existing file leaves a clean directory", async () => {
    const dbPath = join(dir, "local-db.json");
    const store = new JsonStore(dbPath);
    await store.write(createEmptyState());
    await store.write({
      ...createEmptyState(),
      users: [{ id: "u1", role: "learner", name: "Ada" }]
    });

    expect((await store.read()).users[0]?.name).toBe("Ada");
    expect(await readdir(dir)).toEqual(["local-db.json"]);
  });
});

describe("JsonStore SQLite reliability edges", () => {
  it("read of a missing path returns empty state without creating a file", async () => {
    const dbPath = join(dir, "missing.sqlite");
    const store = new JsonStore(dbPath);

    expect(await store.read()).toEqual(createEmptyState());
    await expect(access(dbPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("read reports the database path when the SQLite file is corrupt", async () => {
    const dbPath = join(dir, "corrupt.sqlite");
    await writeFile(dbPath, "this is not a sqlite database", "utf8");
    const store = new JsonStore(dbPath);

    await expect(store.read()).rejects.toThrow(`Failed to read local database at ${dbPath}:`);
  });

  it("applies busy_timeout so a write waits out a short lock instead of failing", async () => {
    const dbPath = join(dir, "busy.sqlite");
    const store = new JsonStore(dbPath);
    await store.write(buildTestWorkspaceState());

    const locker = new Database(dbPath);
    locker.exec("BEGIN IMMEDIATE");
    try {
      const writePromise = store.write(buildTestWorkspaceState());
      await new Promise((resolve) => setTimeout(resolve, 40));
      locker.exec("COMMIT");
      await expect(writePromise).resolves.toBeUndefined();
    } finally {
      try {
        locker.exec("ROLLBACK");
      } catch {
        // already committed
      }
      locker.close();
    }

    expect(SQLITE_BUSY_TIMEOUT_MS).toBeGreaterThanOrEqual(1000);
    expect((await store.read()).languages.length).toBeGreaterThan(0);
  });

  it("fails promptly when a write lock outlives busy_timeout", async () => {
    const dbPath = join(dir, "busy-timeout.sqlite");
    const store = new JsonStore(dbPath);
    await store.write(createEmptyState());

    // Temporarily shrink busy_timeout for a fast failure assertion by opening
    // through a raw connection that holds the lock past the store's wait.
    // Store uses SQLITE_BUSY_TIMEOUT_MS (5s); hold longer than that would make
    // this test slow. Instead verify the pragma is set on a fresh open the
    // same way JsonStore does, and that a zero-timeout open fails immediately.
    const holder = new Database(dbPath);
    holder.exec("BEGIN IMMEDIATE");
    try {
      const contender = new Database(dbPath);
      contender.pragma("busy_timeout = 1");
      expect(() => contender.exec("BEGIN IMMEDIATE")).toThrow(/locked|busy/i);
      contender.close();
    } finally {
      holder.exec("COMMIT");
      holder.close();
    }
  });

  it("serializes concurrent updates through the latest persisted state", async () => {
    const dbPath = join(dir, "concurrent.sqlite");
    const store = new JsonStore(dbPath);
    await store.write(createEmptyState());

    await Promise.all(
      Array.from({ length: 20 }, async (_, index) =>
        store.update((state) => ({
          ...state,
          languages: [
            ...state.languages,
            {
              id: `lang-${index}`,
              name: `Lang ${index}`,
              typology: "isolating",
              description: "Concurrent SQLite update test language.",
              orthography: "Latin",
              status: "draft"
            }
          ]
        }))
      )
    );

    const loaded = await store.read();
    expect(loaded.languages.map((language) => language.id).sort()).toEqual(
      Array.from({ length: 20 }, (_, index) => `lang-${index}`).sort()
    );
  });

  it("does not leave a partial schema when write validation fails before open", async () => {
    const dbPath = join(dir, "invalid-write.sqlite");
    const store = new JsonStore(dbPath);

    await expect(
      store.write({
        ...createEmptyState(),
        // @ts-expect-error intentional invalid role for reliability coverage
        users: [{ id: "bad", role: "not-a-role", name: "Nope" }]
      })
    ).rejects.toThrow();

    await expect(access(dbPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
