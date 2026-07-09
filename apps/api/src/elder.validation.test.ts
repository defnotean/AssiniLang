import { describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

describe("elder route validation i18nKeys", () => {
  it("returns languageNotFound i18nKey for unknown elder-context language", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/languages/not-a-language/elder-context",
      headers: authHeaders("elder-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("returns languageNotFound i18nKey when listing corrections for a missing language", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/elder/corrections?languageId=not-a-language",
      headers: authHeaders("elder-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("returns errNoteNotFoundForLanguage i18nKey for unknown note targets", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        noteId: "missing-note",
        correction: "Clarify suffix order.",
        rationale: "The linked note does not exist for this language.",
        severity: "major"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Note not found for language: missing-note",
      i18nKey: "elderWs.errNoteNotFoundForLanguage"
    });
  });

  it("returns errPassageNotFoundForLanguage i18nKey for unknown passage targets", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/elder/corrections",
      headers: authHeaders("elder-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        passageId: "missing-passage",
        correction: "Clarify motion vocabulary.",
        rationale: "The linked passage does not exist for this language.",
        severity: "minor"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Passage not found for language: missing-passage",
      i18nKey: "elderWs.errPassageNotFoundForLanguage"
    });
  });
});
