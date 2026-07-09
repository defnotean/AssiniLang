import { describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

describe("extraction draft route validation i18nKeys", () => {
  it("returns languageNotFound i18nKey for unknown language draft lists", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: "/languages/not-a-language/extraction-drafts",
      headers: authHeaders("reviewer-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("returns extractionDraftNotFound i18nKey when accepting a missing draft", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/extraction-drafts/missing-draft/accept",
      headers: authHeaders("reviewer-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Extraction draft not found: missing-draft",
      i18nKey: "errors.extractionDraftNotFound"
    });
  });

  it("returns extractionDraftNotFound i18nKey when rejecting a missing draft", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/extraction-drafts/missing-draft/reject",
      headers: authHeaders("reviewer-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Extraction draft not found: missing-draft",
      i18nKey: "errors.extractionDraftNotFound"
    });
  });

  it("still lists proposed drafts for a known language", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/extraction-drafts?status=proposed`,
      headers: authHeaders("reviewer-1")
    });

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });
});
