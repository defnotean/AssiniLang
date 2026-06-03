import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { appStateSchema, type AppState, type Note } from "./schema";

export const DEFAULT_DB_PATH = resolve(process.cwd(), "data", "local-db.json");

export function createEmptyState(): AppState {
  return {
    schemaVersion: 1,
    languages: [],
    corpus: [],
    notes: [],
    exercises: [],
    evaluationRuns: []
  };
}

export class JsonStore {
  constructor(private readonly dbPath = DEFAULT_DB_PATH) {}

  async read(): Promise<AppState> {
    try {
      const raw = await readFile(this.dbPath, "utf8");
      return appStateSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return createEmptyState();
      }
      throw error;
    }
  }

  async write(state: AppState): Promise<void> {
    const parsed = appStateSchema.parse(state);
    await mkdir(dirname(this.dbPath), { recursive: true });
    await writeFile(this.dbPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  }

  async update(updater: (state: AppState) => AppState): Promise<AppState> {
    const current = await this.read();
    const next = updater(current);
    await this.write(next);
    return next;
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
