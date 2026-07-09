import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import type { LlmProvider } from "./llmProvider.js";
import { createServer } from "./server.js";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

describe("study-loop route validation i18nKeys", () => {
  it("returns missingLanguageId i18nKey for invalid draft bodies", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/study-loop/draft",
      headers: authHeaders("reviewer-1"),
      payload: { languageId: " " }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Missing languageId",
      i18nKey: "errors.missingLanguageId"
    });
  });

  it("returns languageNotFound i18nKey for unknown language drafts", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/study-loop/draft",
      headers: authHeaders("reviewer-1"),
      payload: { languageId: "not-a-language" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("returns languageNotFound i18nKey for unknown language model drafts", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/languages/not-a-language/study-loop/model-draft",
      headers: authHeaders("reviewer-1")
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });
  });

  it("returns modelDraftGenerationFailed i18nKey when model draft generation fails", async () => {
    const llmProvider: LlmProvider = {
      name: "failing-note-provider",
      async generateAssistantMessage() {
        return { content: "unused", warnings: [] };
      },
      async completeChat() {
        throw new Error("Draft note generation failed with sk-model-secret");
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/study-loop/model-draft`,
      headers: authHeaders("reviewer-1")
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: expect.stringContaining("Draft note generation failed"),
      i18nKey: "errors.modelDraftGenerationFailed"
    });
    expect(JSON.stringify(response.json())).not.toContain("sk-model-secret");
  });
});
