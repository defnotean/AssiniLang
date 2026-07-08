import type Database from "better-sqlite3";
import { CURRENT_SCHEMA_VERSION } from "./schema.js";

/**
 * The schema version the current code writes. Mirrors `CURRENT_SCHEMA_VERSION`
 * in the Zod app-state schema (packages/db/src/schema.ts).
 */
export const SQLITE_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;

export interface SqliteMigration {
  /** Version the database must be at for this migration to apply. */
  from: number;
  /** Version the database is at after this migration. Must be `from + 1`. */
  to: number;
  /**
   * Performs the schema change. Runs inside a transaction together with the
   * version bump; throwing rolls back both.
   */
  migrate(db: Database.Database): void;
}

/**
 * Ordered registry of SQLite schema migrations. Currently empty: version 8 is
 * the first SQLite-tracked version. When the schema moves to version 9, add an
 * entry following this pattern:
 *
 * ```ts
 * {
 *   from: 8,
 *   to: 9,
 *   migrate(db) {
 *     db.exec(`ALTER TABLE notes ADD COLUMN archived_at TEXT;`);
 *   }
 * }
 * ```
 */
export const SQLITE_MIGRATIONS: SqliteMigration[] = [];

export interface RunSqliteMigrationsOptions {
  /** Override the migration registry (used by tests). Defaults to SQLITE_MIGRATIONS. */
  migrations?: readonly SqliteMigration[];
  /** Override the target version (used by tests). Defaults to SQLITE_SCHEMA_VERSION. */
  currentVersion?: number;
}

function readPersistedVersion(db: Database.Database): number | undefined {
  const row = db.prepare("SELECT schema_version FROM schema_meta LIMIT 1").get() as
    | { schema_version: number }
    | undefined;
  return row?.schema_version;
}

/**
 * Ensures the `schema_meta` table exists, initializes it to the current
 * version on a fresh database, and applies any pending migrations in order —
 * each in its own transaction, with the version bump committed atomically
 * alongside its migration. Fails loudly if the database reports a version
 * newer than this code understands.
 */
export function runSqliteMigrations(
  db: Database.Database,
  dbPath: string,
  options: RunSqliteMigrationsOptions = {}
): void {
  const migrations = options.migrations ?? SQLITE_MIGRATIONS;
  const currentVersion = options.currentVersion ?? SQLITE_SCHEMA_VERSION;

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      schema_version INTEGER NOT NULL,
      migrated_at TEXT NOT NULL
    );
  `);

  let version = readPersistedVersion(db);
  if (version === undefined) {
    db.prepare("INSERT INTO schema_meta (schema_version, migrated_at) VALUES (?, ?)").run(
      currentVersion,
      new Date().toISOString()
    );
    return;
  }

  if (version > currentVersion) {
    throw new Error(
      `Cannot open SQLite database at ${dbPath}: database is from a newer version ` +
        `(schema_version ${version}, this build supports up to ${currentVersion}).`
    );
  }

  const ordered = [...migrations].sort((a, b) => a.from - b.from);
  for (const migration of ordered) {
    if (migration.to !== migration.from + 1) {
      throw new Error(
        `Invalid SQLite migration ${migration.from} -> ${migration.to}: 'to' must be 'from' + 1.`
      );
    }
    if (migration.from < version) continue;
    if (migration.from > version) {
      throw new Error(
        `SQLite migration chain has a gap at version ${version} for database at ${dbPath}: ` +
          `next registered migration starts at ${migration.from}.`
      );
    }
    if (migration.to > currentVersion) break;

    try {
      db.transaction(() => {
        migration.migrate(db);
        db.prepare("UPDATE schema_meta SET schema_version = ?, migrated_at = ?").run(
          migration.to,
          new Date().toISOString()
        );
      })();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `SQLite migration ${migration.from} -> ${migration.to} failed for database at ${dbPath}: ${message}`,
        { cause: error }
      );
    }
    version = migration.to;
  }

  if (version < currentVersion) {
    // No migration covered the remaining distance. Fail rather than running
    // current-version code against an older schema silently.
    throw new Error(
      `SQLite database at ${dbPath} is at schema_version ${version} but no migration to ` +
        `${currentVersion} is registered.`
    );
  }
}
