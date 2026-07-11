import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SQLITE_SCHEMA_VERSION, runSqliteMigrations, type SqliteMigration } from "./sqliteMigrations.js";
import { JsonStore, openStore } from "./store.js";
import { createEmptyState } from "./store.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "assini-sqlite-migrations-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function readMeta(dbPath: string): { schema_version: number; migrated_at: string } | undefined {
  const db = new Database(dbPath);
  try {
    return db.prepare("SELECT schema_version, migrated_at FROM schema_meta LIMIT 1").get() as
      { schema_version: number; migrated_at: string } | undefined;
  } finally {
    db.close();
  }
}

function setVersion(dbPath: string, version: number): void {
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE IF NOT EXISTS schema_meta (schema_version INTEGER NOT NULL, migrated_at TEXT NOT NULL)");
    db.prepare("DELETE FROM schema_meta").run();
    db.prepare("INSERT INTO schema_meta (schema_version, migrated_at) VALUES (?, ?)").run(
      version,
      new Date().toISOString()
    );
  } finally {
    db.close();
  }
}

describe("runSqliteMigrations", () => {
  it("initializes a fresh database to the current schema version", () => {
    const dbPath = join(dir, "fresh.sqlite");
    const db = new Database(dbPath);
    try {
      runSqliteMigrations(db, dbPath);
    } finally {
      db.close();
    }
    const meta = readMeta(dbPath);
    expect(meta?.schema_version).toBe(SQLITE_SCHEMA_VERSION);
    expect(meta?.migrated_at).toBeTruthy();
  });

  it("migrates v8 source processing metadata columns without changing existing rows", () => {
    const dbPath = join(dir, "source-processing-v8.sqlite");
    const setup = new Database(dbPath);
    try {
      setup.exec(`
        CREATE TABLE source_assets (
          id TEXT PRIMARY KEY,
          language_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          title TEXT NOT NULL,
          original_name TEXT,
          mime_type TEXT,
          file_path TEXT,
          url TEXT,
          raw_text TEXT,
          transcript TEXT,
          status TEXT NOT NULL,
          error TEXT,
          summary TEXT,
          warnings TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          processed_at TEXT
        );
      `);
      setup
        .prepare(
          `
        INSERT INTO source_assets (
          id, language_id, kind, title, raw_text, status, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          "source-v8",
          "language-v8",
          "text",
          "Legacy source",
          "mira talo",
          "pending",
          "programmer-1",
          "2026-06-06T00:00:00.000Z"
        );
    } finally {
      setup.close();
    }
    setVersion(dbPath, 8);

    const db = new Database(dbPath);
    try {
      runSqliteMigrations(db, dbPath);
      const columns = db.prepare("PRAGMA table_info(source_assets)").all() as Array<{ name: string }>;
      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining(["processing_started_at", "processing_attempts", "processing_heartbeat_at"])
      );
      expect(
        db
          .prepare(
            `
        SELECT id, processing_started_at, processing_attempts, processing_heartbeat_at
        FROM source_assets WHERE id = ?
      `
          )
          .get("source-v8")
      ).toEqual({
        id: "source-v8",
        processing_started_at: null,
        processing_attempts: null,
        processing_heartbeat_at: null
      });

      runSqliteMigrations(db, dbPath);
    } finally {
      db.close();
    }

    expect(readMeta(dbPath)?.schema_version).toBe(9);
  });

  it("applies a pending migration exactly once across re-opens", () => {
    const dbPath = join(dir, "pending.sqlite");
    setVersion(dbPath, 8);
    let calls = 0;
    const migrations: SqliteMigration[] = [
      {
        from: 8,
        to: 9,
        migrate(db) {
          calls += 1;
          db.exec("CREATE TABLE migrated_marker (id INTEGER PRIMARY KEY)");
        }
      }
    ];

    for (let open = 0; open < 3; open += 1) {
      const db = new Database(dbPath);
      try {
        runSqliteMigrations(db, dbPath, { migrations, currentVersion: 9 });
      } finally {
        db.close();
      }
    }

    expect(calls).toBe(1);
    expect(readMeta(dbPath)?.schema_version).toBe(9);
  });

  it("rolls back a failing migration and leaves the version unchanged", () => {
    const dbPath = join(dir, "failing.sqlite");
    setVersion(dbPath, 8);
    const migrations: SqliteMigration[] = [
      {
        from: 8,
        to: 9,
        migrate(db) {
          db.exec("CREATE TABLE half_done (id INTEGER PRIMARY KEY)");
          throw new Error("boom in migration body");
        }
      }
    ];

    const db = new Database(dbPath);
    try {
      expect(() => runSqliteMigrations(db, dbPath, { migrations, currentVersion: 9 })).toThrow(
        /migration 8 -> 9 failed.*failing\.sqlite.*boom in migration body/s
      );
      // Rolled back: table from the partial migration must not exist.
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'half_done'").all();
      expect(tables).toEqual([]);
    } finally {
      db.close();
    }
    expect(readMeta(dbPath)?.schema_version).toBe(8);
  });

  it("fails loudly when the database is from a newer version", () => {
    const dbPath = join(dir, "newer.sqlite");
    setVersion(dbPath, SQLITE_SCHEMA_VERSION + 5);
    const db = new Database(dbPath);
    try {
      expect(() => runSqliteMigrations(db, dbPath)).toThrow(/database is from a newer version/);
    } finally {
      db.close();
    }
    expect(readMeta(dbPath)?.schema_version).toBe(SQLITE_SCHEMA_VERSION + 5);
  });

  it("runs pending migrations in order", () => {
    const dbPath = join(dir, "ordered.sqlite");
    setVersion(dbPath, 8);
    const applied: string[] = [];
    // Registered out of order on purpose; the framework must sort by `from`.
    const migrations: SqliteMigration[] = [
      { from: 9, to: 10, migrate: () => void applied.push("9->10") },
      { from: 8, to: 9, migrate: () => void applied.push("8->9") }
    ];

    const db = new Database(dbPath);
    try {
      runSqliteMigrations(db, dbPath, { migrations, currentVersion: 10 });
    } finally {
      db.close();
    }

    expect(applied).toEqual(["8->9", "9->10"]);
    expect(readMeta(dbPath)?.schema_version).toBe(10);
  });

  it("fails when an older database has no registered migration path forward", () => {
    const dbPath = join(dir, "stale.sqlite");
    setVersion(dbPath, 7);
    const db = new Database(dbPath);
    try {
      expect(() => runSqliteMigrations(db, dbPath)).toThrow(/gap at version 7/);
    } finally {
      db.close();
    }
  });
});

describe("JsonStore migration wiring", () => {
  it("stamps schema_meta when the store opens a SQLite database", async () => {
    const dbPath = join(dir, "store.sqlite");
    const store = new JsonStore(dbPath);
    await store.write(createEmptyState());
    expect(readMeta(dbPath)?.schema_version).toBe(SQLITE_SCHEMA_VERSION);
  });

  it("refuses to read a SQLite database from a newer version", async () => {
    const dbPath = join(dir, "newer-store.sqlite");
    const store = new JsonStore(dbPath);
    await store.write(createEmptyState());
    setVersion(dbPath, SQLITE_SCHEMA_VERSION + 1);
    await expect(store.read()).rejects.toThrow(/database is from a newer version/);
  });
});

describe("JsonStore backend selection", () => {
  it("infers backend from the path extension when no option is given", () => {
    expect(new JsonStore(join(dir, "db.json")).backend).toBe("json");
    expect(new JsonStore(join(dir, "db.sqlite")).backend).toBe("sqlite");
    expect(new JsonStore(join(dir, "db")).backend).toBe("sqlite");
  });

  it("lets an explicit backend override the extension heuristic", async () => {
    const sqliteAtJsonPath = new JsonStore(join(dir, "actually-sqlite.json"), { backend: "sqlite" });
    expect(sqliteAtJsonPath.backend).toBe("sqlite");
    await sqliteAtJsonPath.write(createEmptyState());
    // A SQLite file was really written: schema_meta is readable.
    expect(readMeta(join(dir, "actually-sqlite.json"))?.schema_version).toBe(SQLITE_SCHEMA_VERSION);

    const jsonAtSqlitePath = new JsonStore(join(dir, "actually-json.sqlite"), { backend: "json" });
    expect(jsonAtSqlitePath.backend).toBe("json");
    await jsonAtSqlitePath.write(createEmptyState());
    expect((await jsonAtSqlitePath.read()).schemaVersion).toBe(9);
  });

  it("rejects an invalid backend value", () => {
    expect(() => new JsonStore(join(dir, "db.json"), { backend: "mongo" as never })).toThrow(/Invalid store backend/);
  });

  it("openStore mirrors the constructor", () => {
    const store = openStore(join(dir, "db.json"), { backend: "sqlite" });
    expect(store).toBeInstanceOf(JsonStore);
    expect(store.backend).toBe("sqlite");
  });
});
