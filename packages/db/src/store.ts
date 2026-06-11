import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { appStateSchema, parseAppState, type AppState, type Note } from "./schema.js";
import * as schema from "./dbSchema.js";

export const DEFAULT_DB_PATH = resolve(process.cwd(), "data", "local-db.json");

export function createEmptyState(): AppState {
  return {
    schemaVersion: 8,
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

export class JsonStore {
  private updateQueue: Promise<void> = Promise.resolve();
  private readonly isSqlite: boolean;
  // Parsed-state snapshot keyed by the database file's mtime+size. Reads of an
  // unchanged file cost one stat() instead of a full table scan + Zod parse;
  // any external write changes the key and forces a real re-read.
  private snapshot: (SnapshotKey & { state: AppState }) | null = null;

  constructor(private readonly dbPath = DEFAULT_DB_PATH) {
    this.isSqlite = !this.dbPath.endsWith(".json");
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

  private ensureTables(db: any): void {
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
      db = new Database(this.dbPath);
      this.ensureTables(db);
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
        schemaVersion: 8,
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

    const db = new Database(this.dbPath);
    this.ensureTables(db);
    const drizzleDb = drizzle(db, { schema });

    try {
      db.transaction(() => {
        drizzleDb.delete(schema.languages).run();
        drizzleDb.delete(schema.corpus).run();
        drizzleDb.delete(schema.corpusAnswerKeys).run();
        drizzleDb.delete(schema.noteAnswerKeys).run();
        drizzleDb.delete(schema.notes).run();
        drizzleDb.delete(schema.exercises).run();
        drizzleDb.delete(schema.exerciseSubmissions).run();
        drizzleDb.delete(schema.evaluationRuns).run();
        drizzleDb.delete(schema.governance).run();
        drizzleDb.delete(schema.users).run();
        drizzleDb.delete(schema.aiSessions).run();
        drizzleDb.delete(schema.elderCorrections).run();
        drizzleDb.delete(schema.auditEvents).run();
        drizzleDb.delete(schema.reviewPolicies).run();
        drizzleDb.delete(schema.reviewApprovals).run();
        drizzleDb.delete(schema.reviewDispositions).run();
        drizzleDb.delete(schema.lexemes).run();
        drizzleDb.delete(schema.sourceAssets).run();
        drizzleDb.delete(schema.extractionDrafts).run();

        if (parsed.languages.length > 0) drizzleDb.insert(schema.languages).values(parsed.languages).run();
        if (parsed.corpus.length > 0) drizzleDb.insert(schema.corpus).values(parsed.corpus).run();
        if (parsed.corpusAnswerKeys && parsed.corpusAnswerKeys.length > 0) drizzleDb.insert(schema.corpusAnswerKeys).values(parsed.corpusAnswerKeys).run();
        if (parsed.noteAnswerKeys.length > 0) drizzleDb.insert(schema.noteAnswerKeys).values(parsed.noteAnswerKeys).run();
        if (parsed.notes.length > 0) drizzleDb.insert(schema.notes).values(parsed.notes).run();
        if (parsed.exercises.length > 0) drizzleDb.insert(schema.exercises).values(parsed.exercises).run();
        if (parsed.exerciseSubmissions.length > 0) drizzleDb.insert(schema.exerciseSubmissions).values(parsed.exerciseSubmissions).run();
        if (parsed.evaluationRuns.length > 0) drizzleDb.insert(schema.evaluationRuns).values(parsed.evaluationRuns as any).run();
        if (parsed.governance.length > 0) drizzleDb.insert(schema.governance).values(parsed.governance).run();
        if (parsed.users.length > 0) drizzleDb.insert(schema.users).values(parsed.users).run();
        if (parsed.aiSessions.length > 0) drizzleDb.insert(schema.aiSessions).values(parsed.aiSessions as any).run();
        if (parsed.elderCorrections.length > 0) drizzleDb.insert(schema.elderCorrections).values(parsed.elderCorrections).run();
        if (parsed.auditEvents.length > 0) drizzleDb.insert(schema.auditEvents).values(parsed.auditEvents as any).run();
        if (parsed.reviewPolicies.length > 0) drizzleDb.insert(schema.reviewPolicies).values(parsed.reviewPolicies as any).run();
        if (parsed.reviewApprovals.length > 0) drizzleDb.insert(schema.reviewApprovals).values(parsed.reviewApprovals).run();
        if (parsed.reviewDispositions.length > 0) drizzleDb.insert(schema.reviewDispositions).values(parsed.reviewDispositions).run();
        if (parsed.lexemes.length > 0) drizzleDb.insert(schema.lexemes).values(parsed.lexemes as any).run();
        if (parsed.sourceAssets.length > 0) drizzleDb.insert(schema.sourceAssets).values(parsed.sourceAssets as any).run();
        if (parsed.extractionDrafts.length > 0) drizzleDb.insert(schema.extractionDrafts).values(parsed.extractionDrafts as any).run();
      })();
    } finally {
      this.snapshot = null;
      db.close();
    }
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
