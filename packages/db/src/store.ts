import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, join } from "node:path";
import type Database from "better-sqlite3";
import { eq, getTableColumns } from "drizzle-orm";
import type { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { appStateSchema, CURRENT_SCHEMA_VERSION, parseAppState, type AppState, type Note } from "./schema.js";
import * as schema from "./dbSchema.js";
import { runSqliteMigrations } from "./sqliteMigrations.js";

export const DEFAULT_DB_PATH = resolve(process.cwd(), "data", "local-db.json");

export type StoreBackend = "json" | "sqlite";

export interface JsonStoreOptions {
  /**
   * Explicit storage backend. When provided it wins over the path extension;
   * when omitted the backend is inferred from the path (`.json` -> JSON file,
   * anything else -> SQLite).
   */
  backend?: StoreBackend;
}

function inferBackend(dbPath: string): StoreBackend {
  return dbPath.endsWith(".json") ? "json" : "sqlite";
}

/**
 * Canonicalize a path for same-file checks. Prefer realpath so a symlink alias
 * of the live database is treated as the same file; fall back to resolve when
 * the path does not exist yet (typical for a new backup destination).
 */
function canonicalizePathForIdentity(pathValue: string): string {
  const resolved = resolve(pathValue);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

/**
 * True when two filesystem paths refer to the same location after resolve +
 * realpath (case-insensitive on Windows), or when both exist as the same
 * inode/device (hard-link aliases). Catches symlink and hard-link aliases of
 * the live database so backup/restore cannot overwrite the source through a
 * different path string.
 */
export function pathsReferToSameFile(left: string, right: string): boolean {
  const normalizedLeft = canonicalizePathForIdentity(left);
  const normalizedRight = canonicalizePathForIdentity(right);
  const sameResolvedPath =
    process.platform === "win32"
      ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
      : normalizedLeft === normalizedRight;
  if (sameResolvedPath) {
    return true;
  }

  // Hard links share device+inode while keeping distinct path strings (realpath
  // does not collapse them the way it collapses symlink aliases).
  try {
    const leftStat = statSync(normalizedLeft);
    const rightStat = statSync(normalizedRight);
    if (
      leftStat.isFile()
      && rightStat.isFile()
      && leftStat.dev === rightStat.dev
      && leftStat.ino === rightStat.ino
      && leftStat.ino !== 0
    ) {
      return true;
    }
  } catch {
    // One or both paths may not exist yet (typical for a new backup destination).
  }

  return false;
}

function resolveBackend(dbPath: string, options?: JsonStoreOptions): StoreBackend {
  const backend = options?.backend;
  if (backend === undefined) {
    return inferBackend(dbPath);
  }
  if (backend !== "json" && backend !== "sqlite") {
    throw new Error(`Invalid store backend "${String(backend)}": expected "json" or "sqlite".`);
  }
  return backend;
}

/**
 * Replaces `destPath` with `tempPath`. Prefers a single rename; on platforms
 * that cannot rename over an existing file (Windows), moves the live file
 * aside first and restores it if the final rename fails.
 */
async function replaceFileAtomically(tempPath: string, destPath: string): Promise<void> {
  try {
    await rename(tempPath, destPath);
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST" && code !== "EPERM" && code !== "EACCES") {
      throw error;
    }
  }

  const previousPath = join(dirname(destPath), `.${basename(destPath)}.${randomUUID()}.prev`);
  await rename(destPath, previousPath);
  try {
    await rename(tempPath, destPath);
  } catch (error) {
    await rename(previousPath, destPath).catch(() => undefined);
    throw error;
  }
  await unlink(previousPath).catch(() => undefined);
}

export function createEmptyState(): AppState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    languages: [],
    corpus: [],
    noteAnswerKeys: [],
    notes: [],
    exercises: [],
    exerciseSubmissions: [],
    evaluationRuns: [],
    governance: [],
    users: [],
    aiSessions: [],
    elderCorrections: [],
    auditEvents: [],
    reviewPolicies: [],
    reviewApprovals: [],
    reviewDispositions: [],
    lexemes: [],
    sourceAssets: [],
    extractionDrafts: []
  };
}

const NULLABLE_KEYS = new Set([
  "lastReviewedBy",
  "lastReviewedAt",
  "reviewedBy",
  "reviewedAt",
  "languageId",
  "dueAt",
  "resolvedAt",
  "resolvedBy",
  "resolutionSummary"
]);

function nullToUndefined(val: any, key?: string): any {
  if (val === null) {
    if (key && NULLABLE_KEYS.has(key)) {
      return null;
    }
    return undefined;
  }
  if (Array.isArray(val)) {
    return val.map((item) => nullToUndefined(item));
  }
  if (val && typeof val === "object") {
    const next: any = {};
    for (const [k, value] of Object.entries(val)) {
      next[k] = nullToUndefined(value, k);
    }
    return next;
  }
  return val;
}

type SnapshotKey = { mtimeMs: number; size: number };
type SqliteRuntime = {
  Database: typeof Database;
  drizzle: typeof drizzleSqlite;
};
type DrizzleDatabase = ReturnType<typeof drizzleSqlite>;

async function loadSqliteRuntime(): Promise<SqliteRuntime> {
  const [{ default: Database }, { drizzle }] = await Promise.all([
    import("better-sqlite3"),
    import("drizzle-orm/better-sqlite3")
  ]);
  return { Database, drizzle };
}

export class JsonStore {
  private updateQueue: Promise<void> = Promise.resolve();
  /** The storage backend in use: explicit via options, otherwise inferred from the path extension. */
  readonly backend: StoreBackend;
  private readonly isSqlite: boolean;
  // Parsed-state snapshot keyed by the database file's mtime+size. Reads of an
  // unchanged file cost one stat() instead of a full table scan + Zod parse;
  // any external write changes the key and forces a real re-read.
  private snapshot: (SnapshotKey & { state: AppState }) | null = null;
  // File key (mtime+size) at the time the schema was last ensured/verified.
  // While the file is unchanged, table DDL and the migration/version check
  // can be skipped; any external change forces re-verification so a
  // newer-version database is still refused.
  private schemaVerifiedKey: SnapshotKey | null = null;

  constructor(private readonly dbPath = DEFAULT_DB_PATH, options?: JsonStoreOptions) {
    this.backend = resolveBackend(this.dbPath, options);
    this.isSqlite = this.backend === "sqlite";
  }

  private async snapshotKey(): Promise<SnapshotKey | null> {
    try {
      const stats = await stat(this.dbPath);
      return { mtimeMs: stats.mtimeMs, size: stats.size };
    } catch {
      return null;
    }
  }

  private cacheSnapshot(key: SnapshotKey | null, state: AppState): void {
    this.snapshot = key ? { ...key, state: structuredClone(state) } : null;
  }

  private ensureTables(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS languages (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        orthography TEXT NOT NULL,
        typology TEXT NOT NULL,
        status TEXT NOT NULL,
        phonology TEXT,
        created_by TEXT,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS corpus (
        id TEXT PRIMARY KEY,
        language_id TEXT NOT NULL,
        source TEXT NOT NULL,
        source_metadata TEXT NOT NULL,
        text_target TEXT NOT NULL,
        text_translation TEXT NOT NULL,
        morphological_segmentation TEXT NOT NULL,
        topic_tags TEXT NOT NULL,
        consent_status TEXT NOT NULL,
        source_asset_id TEXT
      );
      CREATE TABLE IF NOT EXISTS corpus_answer_keys (
        passage_id TEXT PRIMARY KEY,
        language_id TEXT NOT NULL,
        text_target TEXT NOT NULL,
        text_translation TEXT NOT NULL,
        morphological_segmentation TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS note_answer_keys (
        id TEXT PRIMARY KEY,
        language_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        explanation TEXT NOT NULL,
        examples TEXT NOT NULL,
        evidence_passage_ids TEXT NOT NULL,
        evidence_count INTEGER NOT NULL,
        confidence TEXT NOT NULL,
        status TEXT NOT NULL,
        reviewer TEXT NOT NULL,
        dialect_scope TEXT NOT NULL,
        edit_history TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        language_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        explanation TEXT NOT NULL,
        examples TEXT NOT NULL,
        evidence_passage_ids TEXT NOT NULL,
        evidence_count INTEGER NOT NULL,
        confidence TEXT NOT NULL,
        status TEXT NOT NULL,
        reviewer TEXT NOT NULL,
        dialect_scope TEXT NOT NULL,
        edit_history TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS exercises (
        id TEXT PRIMARY KEY,
        language_id TEXT NOT NULL,
        type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        allowed_vocabulary TEXT NOT NULL,
        allowed_rule_ids TEXT NOT NULL,
        expected_answers TEXT NOT NULL,
        adversarial_answers TEXT NOT NULL,
        grading_explanation TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS exercise_submissions (
        id TEXT PRIMARY KEY,
        exercise_id TEXT NOT NULL,
        language_id TEXT NOT NULL,
        answer TEXT NOT NULL,
        accepted INTEGER NOT NULL,
        explanation TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        learner_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS evaluation_runs (
        id TEXT PRIMARY KEY,
        language_id TEXT NOT NULL,
        system_version TEXT NOT NULL,
        fixture_version TEXT NOT NULL,
        scores TEXT NOT NULL,
        failures TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS governance (
        id TEXT PRIMARY KEY,
        language_id TEXT NOT NULL,
        policy_type TEXT NOT NULL,
        content TEXT NOT NULL,
        effective_date TEXT NOT NULL,
        approved_by TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        name TEXT NOT NULL,
        avatar_url TEXT
      );
      CREATE TABLE IF NOT EXISTS ai_sessions (
        id TEXT PRIMARY KEY,
        language_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        context_note_ids TEXT NOT NULL,
        context_passage_ids TEXT NOT NULL,
        messages TEXT NOT NULL,
        thinking_summary TEXT NOT NULL,
        trace TEXT NOT NULL,
        neural_map TEXT NOT NULL,
        privacy TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS elder_corrections (
        id TEXT PRIMARY KEY,
        language_id TEXT NOT NULL,
        note_id TEXT,
        passage_id TEXT,
        correction TEXT NOT NULL,
        rationale TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL,
        context_text TEXT,
        proposed_by TEXT NOT NULL,
        proposed_at TEXT NOT NULL,
        reviewed_by TEXT,
        reviewed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        language_id TEXT,
        actor_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        metadata TEXT NOT NULL,
        at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS review_policies (
        id TEXT PRIMARY KEY,
        language_id TEXT NOT NULL,
        assigned_reviewer_ids TEXT NOT NULL,
        approval_threshold INTEGER NOT NULL,
        requires_assigned_reviewer INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS review_approvals (
        id TEXT PRIMARY KEY,
        language_id TEXT NOT NULL,
        note_id TEXT NOT NULL,
        reviewer_id TEXT NOT NULL,
        approved_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS review_dispositions (
        id TEXT PRIMARY KEY,
        language_id TEXT NOT NULL,
        note_id TEXT NOT NULL,
        disposition TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT NOT NULL,
        assigned_to TEXT NOT NULL,
        due_at TEXT,
        opened_at TEXT NOT NULL,
        opened_by TEXT NOT NULL,
        resolved_at TEXT,
        resolved_by TEXT,
        resolution_summary TEXT
      );
      CREATE TABLE IF NOT EXISTS lexemes (
        id TEXT PRIMARY KEY,
        language_id TEXT NOT NULL,
        form TEXT NOT NULL,
        gloss TEXT NOT NULL,
        part_of_speech TEXT NOT NULL,
        tags TEXT NOT NULL,
        notes TEXT,
        source_asset_ids TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS source_assets (
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
      CREATE TABLE IF NOT EXISTS extraction_drafts (
        id TEXT PRIMARY KEY,
        language_id TEXT NOT NULL,
        source_asset_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        confidence TEXT NOT NULL,
        rationale TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        reviewed_by TEXT,
        reviewed_at TEXT,
        committed_entity_id TEXT
      );
    `);
    runSqliteMigrations(db, this.dbPath);
  }

  // Re-running the table DDL and migration check on every open is wasteful
  // (and measurably slow on Windows CI). Skip it while the database file is
  // byte-identical to when the schema was last verified; a missing or
  // changed file (external write, version bump, fresh database) re-runs the
  // full ensure + migration/version check.
  private ensureTablesOnce(db: Database.Database, key: SnapshotKey | null): void {
    if (
      key === null
      || this.schemaVerifiedKey === null
      || this.schemaVerifiedKey.mtimeMs !== key.mtimeMs
      || this.schemaVerifiedKey.size !== key.size
    ) {
      this.ensureTables(db);
      this.schemaVerifiedKey = key;
    }
  }

  async read(): Promise<AppState> {
    const key = await this.snapshotKey();
    if (key && this.snapshot && this.snapshot.mtimeMs === key.mtimeMs && this.snapshot.size === key.size) {
      return structuredClone(this.snapshot.state);
    }

    if (!this.isSqlite) {
      try {
        const raw = await readFile(this.dbPath, "utf8");
        const parsed = parseAppState(JSON.parse(raw));
        this.cacheSnapshot(key, parsed);
        return parsed;
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          return createEmptyState();
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read local database at ${this.dbPath}: ${message}`, { cause: error });
      }
    }

    let db: Database.Database | undefined;
    try {
      const { Database, drizzle } = await loadSqliteRuntime();
      db = new Database(this.dbPath);
      this.ensureTablesOnce(db, key);
      const drizzleDb = drizzle(db, { schema });

      const languagesList = drizzleDb.select().from(schema.languages).all();
      const corpusList = drizzleDb.select().from(schema.corpus).all();
      const corpusAnswerKeysList = drizzleDb.select().from(schema.corpusAnswerKeys).all();
      const noteAnswerKeysList = drizzleDb.select().from(schema.noteAnswerKeys).all();
      const notesList = drizzleDb.select().from(schema.notes).all();
      const exercisesList = drizzleDb.select().from(schema.exercises).all();
      const exerciseSubmissionsList = drizzleDb.select().from(schema.exerciseSubmissions).all();
      const evaluationRunsList = drizzleDb.select().from(schema.evaluationRuns).all();
      const governanceList = drizzleDb.select().from(schema.governance).all();
      const usersList = drizzleDb.select().from(schema.users).all();
      const aiSessionsList = drizzleDb.select().from(schema.aiSessions).all();
      const elderCorrectionsList = drizzleDb.select().from(schema.elderCorrections).all();
      const auditEventsList = drizzleDb.select().from(schema.auditEvents).all();
      const reviewPoliciesList = drizzleDb.select().from(schema.reviewPolicies).all();
      const reviewApprovalsList = drizzleDb.select().from(schema.reviewApprovals).all();
      const reviewDispositionsList = drizzleDb.select().from(schema.reviewDispositions).all();
      const lexemesList = drizzleDb.select().from(schema.lexemes).all();
      const sourceAssetsList = drizzleDb.select().from(schema.sourceAssets).all();
      const extractionDraftsList = drizzleDb.select().from(schema.extractionDrafts).all();

      db.close();

      const state: AppState = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        languages: nullToUndefined(languagesList) as any,
        corpus: nullToUndefined(corpusList) as any,
        corpusAnswerKeys: nullToUndefined(corpusAnswerKeysList) as any,
        noteAnswerKeys: nullToUndefined(noteAnswerKeysList) as any,
        notes: nullToUndefined(notesList) as any,
        exercises: nullToUndefined(exercisesList) as any,
        exerciseSubmissions: nullToUndefined(exerciseSubmissionsList) as any,
        evaluationRuns: nullToUndefined(evaluationRunsList) as any,
        governance: nullToUndefined(governanceList) as any,
        users: nullToUndefined(usersList) as any,
        aiSessions: nullToUndefined(aiSessionsList) as any,
        elderCorrections: nullToUndefined(elderCorrectionsList) as any,
        auditEvents: nullToUndefined(auditEventsList) as any,
        reviewPolicies: nullToUndefined(reviewPoliciesList) as any,
        reviewApprovals: nullToUndefined(reviewApprovalsList) as any,
        reviewDispositions: nullToUndefined(reviewDispositionsList) as any,
        lexemes: nullToUndefined(lexemesList) as any,
        sourceAssets: nullToUndefined(sourceAssetsList) as any,
        extractionDrafts: nullToUndefined(extractionDraftsList) as any
      };

      const parsed = parseAppState(state);
      this.cacheSnapshot(key, parsed);
      return parsed;
    } catch (error) {
      if (db) {
        try {
          db.close();
        } catch {}
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read local database at ${this.dbPath}: ${message}`, { cause: error });
    }
  }

  /**
   * Reconciles one SQLite table with the desired records inside the caller's
   * transaction. Rows are diffed by primary key (taken from the drizzle table
   * definition, so per-table keys like corpus_answer_keys.passage_id work) and
   * a stable serialized fingerprint built from the drizzle column list in
   * declaration order; only differing rows are INSERTed/UPDATEd/DELETEd, so an
   * unchanged collection produces zero row changes.
   */
  private syncTable(
    drizzleDb: DrizzleDatabase,
    table: SQLiteTable,
    records: readonly Record<string, unknown>[]
  ): void {
    const columns = getTableColumns(table) as Record<string, any>;
    const columnKeys = Object.keys(columns);
    const pkKey = columnKeys.find((key) => columns[key].primary);
    if (!pkKey) {
      throw new Error("Cannot sync table without a primary key column");
    }
    const pkColumn = columns[pkKey];

    // Normalize a record to one value per column (missing/undefined -> null,
    // matching what an insert of the record would persist), in stable column
    // order so fingerprints are comparable.
    const normalize = (record: Record<string, unknown>): Record<string, unknown> => {
      const row: Record<string, unknown> = {};
      for (const key of columnKeys) {
        const value = record[key];
        row[key] = value === undefined ? null : value;
      }
      return row;
    };
    const fingerprint = (row: Record<string, unknown>): string =>
      JSON.stringify(columnKeys.map((key) => (row[key] === undefined ? null : row[key])));

    const existing = new Map<unknown, string>();
    for (const row of drizzleDb.select().from(table).all() as Record<string, unknown>[]) {
      existing.set(row[pkKey], fingerprint(row));
    }

    const seen = new Set<unknown>();
    for (const record of records) {
      const row = normalize(record);
      const pk = row[pkKey];
      seen.add(pk);
      const existingFingerprint = existing.get(pk);
      if (existingFingerprint === undefined) {
        drizzleDb.insert(table).values(row as any).run();
      } else if (existingFingerprint !== fingerprint(row)) {
        drizzleDb.update(table).set(row as any).where(eq(pkColumn, pk)).run();
      }
    }

    for (const pk of existing.keys()) {
      if (!seen.has(pk)) {
        drizzleDb.delete(table).where(eq(pkColumn, pk)).run();
      }
    }
  }

  async write(state: AppState): Promise<void> {
    if (!this.isSqlite) {
      const parsed = appStateSchema.parse(state);
      const dbDir = dirname(this.dbPath);
      const tempPath = join(dbDir, `.${basename(this.dbPath)}.${randomUUID()}.tmp`);

      await mkdir(dbDir, { recursive: true });
      try {
        await writeFile(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
        await rename(tempPath, this.dbPath);
      } catch (error) {
        await unlink(tempPath).catch(() => undefined);
        throw error;
      } finally {
        this.snapshot = null;
      }
      return;
    }

    const parsed = appStateSchema.parse(state);
    const dbDir = dirname(this.dbPath);
    await mkdir(dbDir, { recursive: true });
    const preWriteKey = await this.snapshotKey();

    const { Database, drizzle } = await loadSqliteRuntime();
    const db = new Database(this.dbPath);
    this.ensureTablesOnce(db, preWriteKey);
    const drizzleDb = drizzle(db, { schema });

    try {
      db.transaction(() => {
        this.syncTable(drizzleDb, schema.languages, parsed.languages);
        this.syncTable(drizzleDb, schema.corpus, parsed.corpus);
        this.syncTable(drizzleDb, schema.corpusAnswerKeys, parsed.corpusAnswerKeys ?? []);
        this.syncTable(drizzleDb, schema.noteAnswerKeys, parsed.noteAnswerKeys);
        this.syncTable(drizzleDb, schema.notes, parsed.notes);
        this.syncTable(drizzleDb, schema.exercises, parsed.exercises);
        this.syncTable(drizzleDb, schema.exerciseSubmissions, parsed.exerciseSubmissions);
        this.syncTable(drizzleDb, schema.evaluationRuns, parsed.evaluationRuns);
        this.syncTable(drizzleDb, schema.governance, parsed.governance);
        this.syncTable(drizzleDb, schema.users, parsed.users);
        this.syncTable(drizzleDb, schema.aiSessions, parsed.aiSessions);
        this.syncTable(drizzleDb, schema.elderCorrections, parsed.elderCorrections);
        this.syncTable(drizzleDb, schema.auditEvents, parsed.auditEvents);
        this.syncTable(drizzleDb, schema.reviewPolicies, parsed.reviewPolicies);
        this.syncTable(drizzleDb, schema.reviewApprovals, parsed.reviewApprovals);
        this.syncTable(drizzleDb, schema.reviewDispositions, parsed.reviewDispositions);
        this.syncTable(drizzleDb, schema.lexemes, parsed.lexemes);
        this.syncTable(drizzleDb, schema.sourceAssets, parsed.sourceAssets);
        this.syncTable(drizzleDb, schema.extractionDrafts, parsed.extractionDrafts);
      })();
    } finally {
      this.snapshot = null;
      db.close();
    }
    // Our own write changed the file key; stamp the post-write key so the
    // next open can skip re-verifying a schema we just wrote.
    this.schemaVerifiedKey = await this.snapshotKey();
  }

  /**
   * Copies the live database to `destinationPath`. JSON databases are copied
   * byte-for-byte; SQLite databases use better-sqlite3's online backup API so
   * the copy is consistent even if other processes hold the file open.
   * Refuses to overwrite an existing destination file unless `force` is set.
   */
  async backupTo(destinationPath: string, options: { force?: boolean } = {}): Promise<string> {
    const destination = resolve(destinationPath);
    if (pathsReferToSameFile(this.dbPath, destination)) {
      throw new Error(
        `Failed to back up local database at ${this.dbPath}: destination must differ from the live database path`
      );
    }

    try {
      const destinationStat = await stat(destination);
      if (destinationStat.isDirectory()) {
        throw new Error(
          `Failed to back up local database at ${this.dbPath}: destination must be a file path, not a directory (${destination})`
        );
      }
      if (!options.force) {
        throw new Error(
          `Failed to back up local database at ${this.dbPath}: destination already exists (${destination}). Pass a new path or use force to overwrite.`
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await mkdir(dirname(destination), { recursive: true });

    try {
      if (!this.isSqlite) {
        await copyFile(this.dbPath, destination);
        return destination;
      }

      // better-sqlite3's backup() does not reliably overwrite an existing file;
      // when --force / force:true cleared the existence gate, remove the stale
      // destination first so SQLite backup matches JSON copyFile overwrite.
      try {
        await unlink(destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      const { Database } = await loadSqliteRuntime();
      const db = new Database(this.dbPath);
      try {
        this.ensureTables(db);
        await db.backup(destination);
      } finally {
        db.close();
      }
      return destination;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to back up local database at ${this.dbPath} to ${destination}: ${message}`, {
        cause: error
      });
    }
  }

  /**
   * Replaces the live database with the state stored in `sourcePath`. The
   * backup is fully parsed (Zod) before the live database is touched; on any
   * validation failure the live database is left untouched. Restored bytes are
   * written to a temp path and then atomically renamed into place so a failed
   * write cannot delete the live database. Caches are cleared only after the
   * replace succeeds.
   */
  async restoreFrom(sourcePath: string): Promise<AppState> {
    const source = resolve(sourcePath);
    if (pathsReferToSameFile(this.dbPath, source)) {
      throw new Error(
        `Failed to restore local database at ${this.dbPath}: backup source must differ from the live database path`
      );
    }

    try {
      const sourceStat = await stat(source);
      if (sourceStat.isDirectory()) {
        throw new Error(
          `Failed to restore local database at ${this.dbPath}: backup source must be a file path, not a directory (${source})`
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      throw new Error(`Failed to restore local database at ${this.dbPath}: backup not found at ${source}`, {
        cause: error
      });
    }

    let restored: AppState;
    try {
      restored = await new JsonStore(source).read();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to restore local database at ${this.dbPath}: backup at ${source} is not a valid database: ${message}`,
        { cause: error }
      );
    }

    const dbDir = dirname(this.dbPath);
    await mkdir(dbDir, { recursive: true });
    // Keep the live basename suffix so backend inference stays correct if the
    // explicit backend option is ever omitted; still pass backend explicitly.
    const tempPath = join(dbDir, `.${basename(this.dbPath)}.${randomUUID()}.restore-tmp`);

    try {
      const tempStore = new JsonStore(tempPath, { backend: this.backend });
      await tempStore.write(restored);
      // Confirm the temp file is readable before touching the live database.
      await tempStore.read();
      await replaceFileAtomically(tempPath, this.dbPath);
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to restore local database at ${this.dbPath}: ${message}`, {
        cause: error
      });
    }

    this.snapshot = null;
    this.schemaVerifiedKey = null;
    return restored;
  }

  async update(updater: (state: AppState) => AppState): Promise<AppState> {
    const operation = this.updateQueue.then(async () => {
      const current = await this.read();
      const next = updater(current);
      await this.write(next);
      return next;
    });
    this.updateQueue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  async updateNote(noteId: string, patch: Partial<Pick<Note, "status" | "explanation" | "reviewer" | "editHistory">>): Promise<Note> {
    let updated: Note | undefined;
    await this.update((state) => {
      const notesList = state.notes.map((note) => {
        if (note.id !== noteId) return note;
        updated = { ...note, ...patch };
        return updated;
      });

      if (!updated) {
        throw new Error(`Note not found: ${noteId}`);
      }

      return {
        ...state,
        notes: notesList
      };
    });
    if (!updated) {
      throw new Error(`Note not found: ${noteId}`);
    }
    return updated;
  }
}

/**
 * Convenience factory for {@link JsonStore}. Equivalent to
 * `new JsonStore(path, options)`.
 */
export function openStore(path?: string, options?: JsonStoreOptions): JsonStore {
  return new JsonStore(path, options);
}
