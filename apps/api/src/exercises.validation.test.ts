import { describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

describe("exercise route validation i18nKeys", () => {
  it("returns languageNotFound i18nKey for unknown language exercise lists", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/languages/not-a-language/exercises"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("rejects invalid authoring bodies with i18nKey", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/exercises`,
      headers: authHeaders("reviewer-1"),
      payload: { prompt: "incomplete" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid exercise authoring body",
      i18nKey: "errors.invalidExerciseAuthoringBody"
    });
  });

  it("returns languageNotFound i18nKey when authoring for a missing language", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/languages/not-a-language/exercises",
      headers: authHeaders("reviewer-1"),
      payload: {
        type: "translate_to_target",
        prompt: "Translate into Testlang: The child walks.",
        allowedVocabulary: ["saku", "talo", "-ki"],
        allowedRuleIds: ["testlang-note-basic-order"],
        expectedAnswers: ["saku talo-ki"],
        adversarialAnswers: [
          { answer: "talo saku-ki", reason: "Reverses subject and verb order." },
          { answer: "saku talo-na", reason: "Uses the first-person suffix for a third-person subject." }
        ],
        gradingExplanation: "Use saku for child, talo for walk, and -ki for third person singular."
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("rejects invalid submission bodies with i18nKey", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const exerciseId = buildTestWorkspaceState().exercises[0]!.id;

    const response = await app.inject({
      method: "POST",
      url: `/exercises/${exerciseId}/submissions`,
      headers: authHeaders("learner-1"),
      payload: { answer: " " }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid exercise submission body",
      i18nKey: "errors.invalidExerciseSubmissionBody"
    });
  });

  it("returns exerciseNotFound i18nKey for missing exercise submission history", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/exercises/missing-exercise/submissions",
      headers: authHeaders("learner-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Exercise not found: missing-exercise",
      i18nKey: "errors.exerciseNotFound"
    });
  });

  it("returns exerciseNotFound i18nKey for missing exercise submissions", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/exercises/missing-exercise/submissions",
      headers: authHeaders("learner-1"),
      payload: { answer: "saku talo-ki" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Exercise not found: missing-exercise",
      i18nKey: "errors.exerciseNotFound"
    });
  });

  it("returns languageNotFound i18nKey when generating for a missing language", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/languages/not-a-language/exercises/generate",
      headers: authHeaders("reviewer-1"),
      payload: {}
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });
});
