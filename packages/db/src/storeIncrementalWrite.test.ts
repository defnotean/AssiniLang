import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonStore } from "./store.js";
import { buildTestWorkspaceState } from "./testing.js";
import type { AppState } from "./schema.js";

const TABLES = [
  "languages",
  "corpus",
  "corpus_answer_keys",
  "note_answer_keys",
  "notes",
  "exercises",
  "exercise_submissions",
  "evaluation_runs",
  "governance",
  "users",
  "ai_sessions",
  "elder_corrections",
  "audit_events",
  "review_policies",
  "review_approvals",
  "review_dispositions",
  "lexemes",
  "source_assets",
  "extraction_drafts"
] as const;

type RowidMap = Record<string, number[]>;

function captureRowids(dbPath: string): RowidMap {
  const db = new Database(dbPath, { readonly: true });
  try {
    const map: RowidMap = {};
    for (const table of TABLES) {
      map[table] = db
        .prepare(`SELECT rowid AS rid FROM "${table}" ORDER BY rowid`)
        .all()
        .map((row: any) => row.rid as number);
    }
    return map;
  } finally {
    db.close();
  }
}

function dataVersion(dbPath: string): number {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.prepare("PRAGMA data_version").get() as { data_version: number };
    return row.data_version;
  } finally {
    db.close();
  }
}

function expectUnchangedExcept(before: RowidMap, after: RowidMap, exceptions: string[] = []) {
  for (const table of TABLES) {
    if (exceptions.includes(table)) continue;
    expect(after[table], `rowids for ${table} should be unchanged`).toEqual(before[table]);
  }
}

let dir: string;
let dbPath: string;
let store: JsonStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "assini-incremental-"));
  dbPath = join(dir, "db.sqlite");
  store = new JsonStore(dbPath);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("incremental SQLite writes", () => {
  it("rewriting an identical state is a no-op (rowids and data_version unchanged)", async () => {
    const state = buildTestWorkspaceState();
    await store.write(state);

    const beforeRowids = captureRowids(dbPath);
    const beforeVersion = dataVersion(dbPath);

    await store.write(buildTestWorkspaceState());

    const afterRowids = captureRowids(dbPath);
    const afterVersion = dataVersion(dbPath);

    expectUnchangedExcept(beforeRowids, afterRowids);
    expect(afterVersion).toBe(beforeVersion);
  });

  it("mutating one note leaves every other table's rows untouched", async () => {
    const state = buildTestWorkspaceState();
    await store.write(state);
    const before = captureRowids(dbPath);

    const noteId = state.notes[0]!.id;
    await store.updateNote(noteId, { explanation: "Updated explanation for incremental write test." });

    const after = captureRowids(dbPath);
    // An UPDATE keeps the rowid, so even the notes table keeps identical rowids.
    expectUnchangedExcept(before, after);

    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db.prepare("SELECT explanation FROM notes WHERE id = ?").get(noteId) as { explanation: string };
      expect(row.explanation).toBe("Updated explanation for incremental write test.");
    } finally {
      db.close();
    }
  });

  it("adding one record only inserts that record", async () => {
    const state = buildTestWorkspaceState();
    await store.write(state);
    const before = captureRowids(dbPath);

    await store.update((current) => ({
      ...current,
      lexemes: [
        ...current.lexemes,
        {
          id: "testlang-lex-new",
          languageId: "testlang",
          form: "veno",
          gloss: "wind",
          partOfSpeech: "noun",
          tags: ["weather"],
          sourceAssetIds: []
        }
      ]
    }));

    const after = captureRowids(dbPath);
    expectUnchangedExcept(before, after, ["lexemes"]);
    // Existing lexeme rowids are preserved; exactly one new rowid appears.
    expect(after.lexemes!.slice(0, before.lexemes!.length)).toEqual(before.lexemes);
    expect(after.lexemes!.length).toBe(before.lexemes!.length + 1);
  });

  it("deleting one record removes only that record", async () => {
    const state = buildTestWorkspaceState();
    await store.write(state);

    const removedId = state.lexemes[2]!.id;
    const db = new Database(dbPath, { readonly: true });
    let removedRowid: number;
    try {
      removedRowid = (db.prepare("SELECT rowid AS rid FROM lexemes WHERE id = ?").get(removedId) as { rid: number })
        .rid;
    } finally {
      db.close();
    }
    const before = captureRowids(dbPath);

    await store.update((current) => ({
      ...current,
      lexemes: current.lexemes.filter((lexeme) => lexeme.id !== removedId)
    }));

    const after = captureRowids(dbPath);
    expectUnchangedExcept(before, after, ["lexemes"]);
    expect(after.lexemes).toEqual(before.lexemes!.filter((rid) => rid !== removedRowid));
  });

  it("handles the corpus_answer_keys table keyed by passage_id", async () => {
    const state = buildTestWorkspaceState();
    await store.write(state);
    const before = captureRowids(dbPath);

    await store.update((current) => ({
      ...current,
      corpusAnswerKeys: (current.corpusAnswerKeys ?? []).map((key, index) =>
        index === 0 ? { ...key, textTranslation: "I walk along the river." } : key
      )
    }));

    const after = captureRowids(dbPath);
    expectUnchangedExcept(before, after);

    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db
        .prepare("SELECT text_translation FROM corpus_answer_keys WHERE passage_id = ?")
        .get(state.corpusAnswerKeys![0]!.passageId) as { text_translation: string };
      expect(row.text_translation).toBe("I walk along the river.");
    } finally {
      db.close();
    }
  });

  it("read-back after overlapping writes equals a fresh write of the final state", async () => {
    const stateA = buildTestWorkspaceState();
    await store.write(stateA);

    // stateB overlaps stateA but mutates, removes, and adds records.
    const stateB: AppState = structuredClone(stateA);
    stateB.notes[0]!.explanation = "Changed in state B.";
    const removedLexeme = stateB.lexemes[1]!.id;
    stateB.lexemes = stateB.lexemes.filter((lexeme) => lexeme.id !== removedLexeme);
    stateB.exercises = stateB.exercises.slice(0, 2);
    stateB.lexemes.push({
      id: "testlang-lex-extra",
      languageId: "testlang",
      form: "kelu",
      gloss: "stone",
      partOfSpeech: "noun",
      tags: ["object"],
      sourceAssetIds: []
    });

    await store.write(stateB);
    const incrementalReadBack = await store.read();

    const freshPath = join(dir, "fresh.sqlite");
    const freshStore = new JsonStore(freshPath);
    await freshStore.write(structuredClone(stateB));
    const freshReadBack = await freshStore.read();

    expect(incrementalReadBack).toEqual(freshReadBack);
  });

  it("keeps snapshot-cache semantics: a read after an incremental write reflects the new state", async () => {
    const state = buildTestWorkspaceState();
    await store.write(state);
    const first = await store.read();
    expect(first.notes[0]!.explanation).toBe(state.notes[0]!.explanation);

    await store.updateNote(state.notes[0]!.id, { explanation: "Post-write snapshot check." });
    const second = await store.read();
    expect(second.notes[0]!.explanation).toBe("Post-write snapshot check.");
  });
});
