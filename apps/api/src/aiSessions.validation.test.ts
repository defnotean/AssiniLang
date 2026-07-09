import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import type { LlmProvider } from "./llmProvider.js";
import { createServer } from "./server.js";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

describe("AI session route validation i18nKeys", () => {
  it("returns context note i18nKey when a context note is missing for the language", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("learner-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        mode: "learner_practice",
        seedPrompt: "Hello",
        contextNoteIds: ["missing-note"],
        contextPassageIds: []
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Context note not found for language: missing-note",
      i18nKey: "errors.aiSessionContextNoteNotFound"
    });
  });

  it("returns context passage i18nKey when a context passage is missing for the language", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const response = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("learner-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        mode: "learner_practice",
        seedPrompt: "Hello",
        contextNoteIds: [],
        contextPassageIds: ["missing-passage"]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Context passage not found for language: missing-passage",
      i18nKey: "errors.aiSessionContextPassageNotFound"
    });
  });

  it("returns llmGenerationFailed i18nKey when session creation generation fails", async () => {
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage() {
        throw new Error("LLM provider request failed with status 500: boom");
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });

    const response = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("learner-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        mode: "learner_practice",
        seedPrompt: "Hello",
        contextNoteIds: [],
        contextPassageIds: []
      }
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: "LLM generation failed: LLM provider request failed with status 500: boom",
      i18nKey: "errors.llmGenerationFailed"
    });
  });

  it("returns llmGenerationFailed i18nKey when follow-up generation fails", async () => {
    let callCount = 0;
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage(input) {
        callCount += 1;
        if (callCount === 1) {
          return { content: `Provider response: ${input.prompt}`, warnings: [] };
        }
        throw new Error("LLM provider request timed out after 25ms");
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });

    const created = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("learner-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        mode: "learner_practice",
        seedPrompt: "Start",
        contextNoteIds: [],
        contextPassageIds: []
      }
    });
    expect(created.statusCode).toBe(201);

    const followUp = await app.inject({
      method: "POST",
      url: `/ai/sessions/${encodeURIComponent(created.json().id)}/messages`,
      headers: authHeaders("learner-1"),
      payload: { content: "Continue" }
    });

    expect(followUp.statusCode).toBe(502);
    expect(followUp.json()).toEqual({
      error: "LLM generation failed: LLM provider request timed out after 25ms",
      i18nKey: "errors.llmGenerationFailed"
    });
  });
});
