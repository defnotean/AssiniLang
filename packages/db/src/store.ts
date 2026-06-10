import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { appStateSchema, parseAppState, type AppState, type Note } from "./schema";

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

export class JsonStore {
  private updateQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dbPath = DEFAULT_DB_PATH) {}

  async read(): Promise<AppState> {
    try {
      const raw = await readFile(this.dbPath, "utf8");
      return parseAppState(JSON.parse(raw));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return createEmptyState();
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read local database at ${this.dbPath}: ${message}`, { cause: error });
    }
  }

  async write(state: AppState): Promise<void> {
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
      const notes = state.notes.map((note) => {
        if (note.id !== noteId) return note;
        updated = { ...note, ...patch };
        return updated;
      });

      if (!updated) {
        throw new Error(`Note not found: ${noteId}`);
      }

      return {
        ...state,
        notes
      };
    });
    if (!updated) {
      throw new Error(`Note not found: ${noteId}`);
    }
    return updated;
  }
}
