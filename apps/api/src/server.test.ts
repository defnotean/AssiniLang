import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createEmptyState, JsonStore, type AppState, type EvaluationRun } from "@assini/db";
import { buildSeedState } from "@assini/synthetic-langs";
import { resolveRuntimeDbPath } from "./runtimePath";
import { createServer } from "./server";

describe("api server", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const reviewedNoteId = "avn-rule-verb-chain-note";
  const existingRun: EvaluationRun = {
    id: "existing-run",
    languageId: "archived-language",
    createdAt: "2026-06-03T00:00:00.000Z",
    systemVersion: "test-system",
    fixtureVersion: "test-fixture",
    scores: { retained: 1 },
    failures: [],
    summary: "Existing evaluation run."
  };

  async function fetchReviewedNote(app: ReturnType<typeof createServer>) {
    const notes = await app.inject({ method: "GET", url: "/languages/avenik/notes" });
    return notes.json().find((item: { id: string }) => item.id === reviewedNoteId);
  }

  it("resolves the runtime database path from the repository root with an env override", () => {
    const indexUrl = pathToFileURL(join(repoRoot, "apps", "api", "src", "index.ts")).href;
    const overridePath = join(repoRoot, "tmp", "override-db.json");

    expect(resolveRuntimeDbPath({ env: {}, moduleUrl: indexUrl })).toBe(join(repoRoot, "data", "local-db.json"));
    expect(resolveRuntimeDbPath({ env: { ASSINI_DB_PATH: overridePath }, moduleUrl: indexUrl })).toBe(overridePath);
  });

  it("returns health, notes, and exercises", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true });

    const notes = await app.inject({ method: "GET", url: "/languages/avenik/notes" });
    expect(notes.statusCode).toBe(200);
    expect(notes.json()[0].languageId).toBe("avenik");

    const exercises = await app.inject({ method: "GET", url: "/languages/avenik/exercises" });
    expect(exercises.statusCode).toBe(200);
    expect(exercises.json()[0].languageId).toBe("avenik");
  });

  it("returns languages and corpus", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const languages = await app.inject({ method: "GET", url: "/languages" });
    expect(languages.statusCode).toBe(200);
    expect(languages.json()).toHaveLength(4);

    const corpus = await app.inject({ method: "GET", url: "/languages/avenik/corpus" });
    expect(corpus.statusCode).toBe(200);
    expect(corpus.json()[0].languageId).toBe("avenik");
  });

  it.each(["corpus", "notes", "exercises"])("returns 404 for unknown language %s requests", async (resource) => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({ method: "GET", url: `/languages/not-a-language/${resource}` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Language not found: not-a-language" });
  });

  it("runs evaluations and appends them to state", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({ method: "POST", url: "/evaluations/run" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(4);

    const evaluations = await app.inject({ method: "GET", url: "/evaluations" });
    expect(evaluations.statusCode).toBe(200);
    expect(evaluations.json()).toHaveLength(4);
  });

  it("returns a client error for evaluations without languages and preserves prior runs", async () => {
    const initialState: AppState = {
      ...createEmptyState(),
      evaluationRuns: [existingRun]
    };
    const app = createServer({ initialState });

    const response = await app.inject({ method: "POST", url: "/evaluations/run" });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "No languages available to evaluate" });

    const evaluations = await app.inject({ method: "GET", url: "/evaluations" });
    expect(evaluations.statusCode).toBe(200);
    expect(evaluations.json()).toEqual([existingRun]);
  });

  it("reads and writes evaluation state through a provided JsonStore", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "assini-api-"));
    const store = new JsonStore(join(tempDir, "local-db.json"));
    await store.write(buildSeedState());
    const app = createServer({ store });

    const languages = await app.inject({ method: "GET", url: "/languages" });
    expect(languages.statusCode).toBe(200);
    expect(languages.json()).toHaveLength(4);

    const response = await app.inject({ method: "POST", url: "/evaluations/run" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(4);

    const persisted = await store.read();
    expect(persisted.evaluationRuns).toHaveLength(4);
  });

  it("updates note review details", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      payload: {
        status: "contested",
        explanation: "Needs one more example before approval.",
        reviewerComment: "Please add a counterexample check."
      }
    });

    expect(response.statusCode).toBe(200);
    const note = response.json();
    expect(note.status).toBe("contested");
    expect(note.explanation).toBe("Needs one more example before approval.");
    expect(note.reviewer.lastReviewedBy).toBe("local-reviewer");
    expect(note.reviewer.comments).toContain("Please add a counterexample check.");
    expect(note.editHistory.at(-1)).toMatchObject({
      by: "local-reviewer",
      action: "reviewed",
      summary: "Please add a counterexample check."
    });
  });

  it("returns 400 for an invalid review body and does not update the note", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      payload: {
        status: "bogus",
        reviewerComment: "This should not be persisted."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid review body" });

    const note = await fetchReviewedNote(app);
    expect(note.status).toBe("draft");
    expect(note.reviewer.comments).not.toContain("This should not be persisted.");
  });

  it.each([
    ["empty object", { payload: {} }],
    ["unknown-only object", { payload: { foo: "bar" } }],
    ["null payload", { payload: null }],
    ["missing payload", {}]
  ])("returns 400 for a %s review body and does not update the note", async (_, injectOptions) => {
    const app = createServer({ initialState: buildSeedState() });
    const before = await fetchReviewedNote(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/notes/${reviewedNoteId}/review`,
      ...injectOptions
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid review body" });

    const after = await fetchReviewedNote(app);
    expect(after.status).toBe(before.status);
    expect(after.explanation).toBe(before.explanation);
    expect(after.reviewer).toEqual(before.reviewer);
    expect(after.editHistory).toEqual(before.editHistory);
  });

  it("returns 404 when reviewing a missing note", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({
      method: "PATCH",
      url: "/notes/missing-note/review",
      payload: { status: "approved" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Note not found: missing-note" });
  });
});
