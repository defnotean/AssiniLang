import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import { createServer } from "./server.js";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

function withElderCorrection() {
  const state = buildTestWorkspaceState();
  const noteId = state.notes[0]?.id;
  if (!noteId) throw new Error("Expected seeded note for elder correction fixture");

  state.elderCorrections.push({
    id: "elder-correction-secret",
    languageId: TEST_LANGUAGE_ID,
    noteId,
    correction: "SECRET_ELDER_CORRECTION_TEXT",
    rationale: "Keep teaching notes accurate.",
    severity: "major",
    status: "pending_review",
    proposedBy: "elder-1",
    proposedAt: "2026-01-01T00:00:00.000Z",
    reviewedBy: null,
    reviewedAt: null
  });

  return state;
}

describe("neural-map route validation i18nKeys", () => {
  it("returns missingLanguageId i18nKey for blank languageId query values", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    for (const url of [
      "/observability/neural-map?languageId=",
      "/observability/neural-map?languageId=%20%20",
      "/observability/neural-map?languageId=   "
    ]) {
      const response = await app.inject({
        method: "GET",
        url,
        headers: authHeaders("programmer-1")
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: "Missing languageId",
        i18nKey: "errors.missingLanguageId"
      });
    }
  });

  it("returns missingLanguageId i18nKey when languageId is repeated as an array", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: `/observability/neural-map?languageId=${TEST_LANGUAGE_ID}&languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("programmer-1")
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Missing languageId",
      i18nKey: "errors.missingLanguageId"
    });
  });

  it("returns languageNotFound i18nKey for unknown language ids", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/observability/neural-map?languageId=not-a-language",
      headers: authHeaders("programmer-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("redacts elder correction labels for programmers and keeps them for leads", async () => {
    const app = createServer({ initialState: withElderCorrection() });

    const programmerMap = await app.inject({
      method: "GET",
      url: `/observability/neural-map?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("programmer-1")
    });
    expect(programmerMap.statusCode).toBe(200);
    expect(programmerMap.json().nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "elder_correction:elder-correction-secret",
          type: "elder_correction",
          label: "Elder correction (redacted)",
          metadata: expect.objectContaining({ redacted: true, severity: "major", status: "pending_review" })
        })
      ])
    );
    expect(JSON.stringify(programmerMap.json())).not.toContain("SECRET_ELDER_CORRECTION_TEXT");

    const leadMap = await app.inject({
      method: "GET",
      url: `/observability/neural-map?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("lead-1")
    });
    expect(leadMap.statusCode).toBe(200);
    expect(leadMap.json().nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "elder_correction:elder-correction-secret",
          type: "elder_correction",
          label: "SECRET_ELDER_CORRECTION_TEXT"
        })
      ])
    );
  });
});
