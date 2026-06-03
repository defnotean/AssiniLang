import { describe, expect, it } from "vitest";
import { buildSeedState } from "@assini/synthetic-langs";
import { createServer } from "./server";

describe("api server", () => {
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

  it("runs evaluations and appends them to state", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({ method: "POST", url: "/evaluations/run" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(4);

    const evaluations = await app.inject({ method: "GET", url: "/evaluations" });
    expect(evaluations.statusCode).toBe(200);
    expect(evaluations.json()).toHaveLength(4);
  });

  it("updates note review details", async () => {
    const app = createServer({ initialState: buildSeedState() });

    const response = await app.inject({
      method: "PATCH",
      url: "/notes/avn-rule-verb-chain-note/review",
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
