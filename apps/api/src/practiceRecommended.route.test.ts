import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import { createServer } from "./server.js";

describe("GET /languages/:languageId/exercises/recommended", () => {
  const recommendedUrl = `/languages/${TEST_LANGUAGE_ID}/exercises/recommended`;

  function authHeaders(userId: string) {
    return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
  }

  it("requires an authenticated actor", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({ method: "GET", url: recommendedUrl });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 for an unknown language", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/languages/unknown-language/exercises/recommended",
      headers: authHeaders("learner-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: unknown-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("returns redacted exercise projections with rationale entries", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: recommendedUrl,
      headers: authHeaders("learner-1")
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.exercises.length).toBeGreaterThan(0);
    expect(body.exercises.length).toBeLessThanOrEqual(10);
    expect(body.rationale).toHaveLength(body.exercises.length);

    for (const exercise of body.exercises) {
      expect(exercise.languageId).toBe(TEST_LANGUAGE_ID);
      expect(exercise).not.toHaveProperty("expectedAnswers");
      expect(exercise).not.toHaveProperty("adversarialAnswers");
      expect(exercise).not.toHaveProperty("gradingExplanation");
    }
    expect(JSON.stringify(body)).not.toContain("saku talo-ki");
    expect(JSON.stringify(body)).not.toContain("first-person singular subjects");

    for (const entry of body.rationale) {
      expect(["new", "overdue", "scheduled"]).toContain(entry.status);
      expect(typeof entry.streak).toBe("number");
    }
    // No submissions yet: everything is new, in original order.
    expect(body.rationale.every((entry: { status: string }) => entry.status === "new")).toBe(true);
  });

  it("ranks never-attempted exercises before recently answered ones end-to-end", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });
    const attemptedExerciseId = `${TEST_LANGUAGE_ID}-ex-002`;

    const submissionResponse = await app.inject({
      method: "POST",
      url: `/exercises/${attemptedExerciseId}/submissions`,
      headers: authHeaders("learner-1"),
      payload: { answer: "saku talo-ki" }
    });
    expect(submissionResponse.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: recommendedUrl,
      headers: authHeaders("learner-1")
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const ids = body.exercises.map((exercise: { id: string }) => exercise.id);

    // The just-answered exercise drops behind every never-attempted exercise.
    expect(ids[ids.length - 1]).toBe(attemptedExerciseId);
    const attemptedRationale = body.rationale.find(
      (entry: { exerciseId: string }) => entry.exerciseId === attemptedExerciseId
    );
    expect(attemptedRationale).toMatchObject({ status: "scheduled", streak: 1 });
    expect(typeof attemptedRationale.dueAt).toBe("string");

    const newRationale = body.rationale.filter(
      (entry: { exerciseId: string }) => entry.exerciseId !== attemptedExerciseId
    );
    expect(newRationale.every((entry: { status: string }) => entry.status === "new")).toBe(true);

    // Another learner's history does not affect this learner's ranking.
    const reviewerView = await app.inject({
      method: "GET",
      url: recommendedUrl,
      headers: authHeaders("reviewer-1")
    });
    expect(reviewerView.statusCode).toBe(200);
    expect(reviewerView.json().rationale.every((entry: { status: string }) => entry.status === "new")).toBe(true);
  });
});
