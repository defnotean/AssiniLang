import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import type { LlmProvider } from "./llmProvider.js";
import { createServer } from "./server.js";

describe("AI session integration", () => {
  const reviewedNoteId = "testlang-note-basic-order";

  function authHeaders(userId: string) {
    return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
  }

  it("enforces role-aware AI sessions and returns safe observability surfaces", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const blocked = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("learner-1"),
      payload: { languageId: TEST_LANGUAGE_ID, mode: "programmer_debug", seedPrompt: "Show internals." }
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toEqual({ error: "Forbidden" });

    const created = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        mode: "programmer_debug",
        seedPrompt: "Trace what the AI knows about basic word order.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["testlang-c001"]
      }
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      languageId: TEST_LANGUAGE_ID,
      mode: "programmer_debug",
      createdBy: "programmer-1",
      privacy: { exposesHiddenChainOfThought: false }
    });
    expect(created.json().thinkingSummary).toContain("observable trace");
    expect(created.json().neuralMap.nodes.length).toBeGreaterThan(0);
    expect(JSON.stringify(created.json())).not.toContain("expectedAnswers");
    expect(JSON.stringify(created.json())).not.toContain("gradingExplanation");
    expect(JSON.stringify(created.json())).not.toContain("noteAnswerKeys");

    const observability = await app.inject({
      method: "GET",
      url: "/observability/ai-sessions",
      headers: authHeaders("programmer-1")
    });
    expect(observability.statusCode).toBe(200);
    expect(observability.json().totals.sessions).toBe(1);
    expect(observability.json().sessions[0]).toMatchObject({ languageId: TEST_LANGUAGE_ID, messageCount: 2 });
    expect(JSON.stringify(observability.json())).not.toContain("Trace what the AI knows");
  });

  it("enforces canReadAiSession on GET /ai/sessions/:sessionId", async () => {
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage(input) {
        return { content: `Safe response: ${input.prompt}`, warnings: [] };
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });
    const sessionPayload = {
      languageId: TEST_LANGUAGE_ID,
      seedPrompt: "Trace learner practice safely.",
      contextNoteIds: [reviewedNoteId],
      contextPassageIds: ["testlang-c001"]
    };

    async function createSession(mode: "learner_practice" | "elder_review" | "programmer_debug", userId: string) {
      const response = await app.inject({
        method: "POST",
        url: "/ai/sessions",
        headers: authHeaders(userId),
        payload: { ...sessionPayload, mode }
      });
      expect(response.statusCode).toBe(201);
      return response.json().id as string;
    }

    async function readSession(sessionId: string, userId: string) {
      return app.inject({
        method: "GET",
        url: `/ai/sessions/${encodeURIComponent(sessionId)}`,
        headers: authHeaders(userId)
      });
    }

    const learnerPracticeId = await createSession("learner_practice", "learner-1");
    const elderReviewId = await createSession("elder_review", "elder-1");
    const programmerDebugId = await createSession("programmer_debug", "programmer-1");

    const anonymous = await app.inject({
      method: "GET",
      url: `/ai/sessions/${encodeURIComponent(learnerPracticeId)}`
    });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual({ error: "Unauthorized" });

    const learnerPracticeAccess = [
      ["learner-1", 200],
      ["elder-1", 200],
      ["reviewer-1", 200],
      ["lead-1", 200],
      ["admin-1", 200],
      ["programmer-1", 403]
    ] as const;
    for (const [userId, statusCode] of learnerPracticeAccess) {
      const response = await readSession(learnerPracticeId, userId);
      expect(response.statusCode).toBe(statusCode);
      if (statusCode === 403) {
        expect(response.json()).toEqual({ error: "Forbidden" });
      }
    }

    const elderReviewAccess = [
      ["elder-1", 200],
      ["lead-1", 200],
      ["reviewer-1", 403],
      ["learner-1", 403]
    ] as const;
    for (const [userId, statusCode] of elderReviewAccess) {
      const response = await readSession(elderReviewId, userId);
      expect(response.statusCode).toBe(statusCode);
    }

    const programmerDebugAccess = [
      ["programmer-1", 200],
      ["lead-1", 200],
      ["learner-1", 403],
      ["elder-1", 403],
      ["reviewer-1", 403]
    ] as const;
    for (const [userId, statusCode] of programmerDebugAccess) {
      const response = await readSession(programmerDebugId, userId);
      expect(response.statusCode).toBe(statusCode);
    }

    const reviewerView = await readSession(learnerPracticeId, "reviewer-1");
    expect(reviewerView.statusCode).toBe(200);
    expect(reviewerView.json()).toMatchObject({
      createdBy: "redacted",
      messages: [
        expect.objectContaining({ role: "user", content: "[redacted user input]", createdBy: "redacted" }),
        expect.objectContaining({ role: "assistant", content: expect.stringContaining("Safe response:") })
      ]
    });
  });

  it("enforces canWriteAiSessionMessage on POST /ai/sessions/:sessionId/messages", async () => {
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage(input) {
        return { content: `Safe response: ${input.prompt}`, warnings: [] };
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });
    const sessionPayload = {
      languageId: TEST_LANGUAGE_ID,
      seedPrompt: "Trace learner practice safely.",
      contextNoteIds: [reviewedNoteId],
      contextPassageIds: ["testlang-c001"]
    };

    async function createSession(mode: "learner_practice" | "elder_review" | "programmer_debug", userId: string) {
      const response = await app.inject({
        method: "POST",
        url: "/ai/sessions",
        headers: authHeaders(userId),
        payload: { ...sessionPayload, mode }
      });
      expect(response.statusCode).toBe(201);
      return response.json().id as string;
    }

    async function appendMessage(sessionId: string, userId: string) {
      return app.inject({
        method: "POST",
        url: `/ai/sessions/${encodeURIComponent(sessionId)}/messages`,
        headers: authHeaders(userId),
        payload: { content: "Follow up safely." }
      });
    }

    const learnerPracticeId = await createSession("learner_practice", "learner-1");
    const programmerDebugId = await createSession("programmer_debug", "programmer-1");

    const learnerPracticeWriteAccess = [
      ["learner-1", 200],
      ["elder-1", 403],
      ["reviewer-1", 403],
      ["lead-1", 403],
      ["admin-1", 200],
      ["programmer-1", 403]
    ] as const;
    for (const [userId, statusCode] of learnerPracticeWriteAccess) {
      const response = await appendMessage(learnerPracticeId, userId);
      expect(response.statusCode).toBe(statusCode);
      if (statusCode === 403) {
        expect(response.json()).toEqual({ error: "Forbidden" });
      }
    }

    const programmerDebugWriteAccess = [
      ["programmer-1", 200],
      ["admin-1", 200],
      ["lead-1", 403],
      ["learner-1", 403]
    ] as const;
    for (const [userId, statusCode] of programmerDebugWriteAccess) {
      const response = await appendMessage(programmerDebugId, userId);
      expect(response.statusCode).toBe(statusCode);
    }
  });

  it("uses an injected LLM provider for AI sessions without exposing provider secrets or answer-key fields", async () => {
    const providerInputs: unknown[] = [];
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage(input) {
        providerInputs.push(input);
        return {
          content: `Provider response ${providerInputs.length}: ${input.prompt}`,
          warnings: ["test-provider"]
        };
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });

    const created = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        mode: "programmer_debug",
        seedPrompt: "Use the model safely.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["testlang-c001"]
      }
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().messages[1]).toMatchObject({
      role: "assistant",
      content: "Provider response 1: Use the model safely.",
      createdBy: "local-ai"
    });
    expect(created.json().trace.at(-1).warnings).toContain("test-provider");

    const followUp = await app.inject({
      method: "POST",
      url: `/ai/sessions/${encodeURIComponent(created.json().id)}/messages`,
      headers: authHeaders("programmer-1"),
      payload: { content: "Follow up safely." }
    });

    expect(followUp.statusCode).toBe(200);
    expect(followUp.json().messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "Provider response 2: Follow up safely.",
      createdBy: "local-ai"
    });
    expect(providerInputs).toHaveLength(2);
    expect(JSON.stringify(providerInputs)).not.toContain("noteAnswerKeys");
    expect(JSON.stringify(providerInputs)).not.toContain("expectedAnswers");
    expect(JSON.stringify(followUp.json())).not.toContain("ASSINI_LLM_API_KEY");
    expect(JSON.stringify(followUp.json())).not.toContain("OPENAI_API_KEY");
  });

  it("returns i18nKey for invalid AI session and message bodies", async () => {
    const app = createServer({ initialState: buildTestWorkspaceState() });

    const invalidSession = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("learner-1"),
      payload: { languageId: "   ", mode: "learner_practice", seedPrompt: "Hello" }
    });
    expect(invalidSession.statusCode).toBe(400);
    expect(invalidSession.json()).toEqual({
      error: "Invalid AI session body",
      i18nKey: "errors.invalidAiSessionBody"
    });

    const missingLanguage = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("learner-1"),
      payload: {
        languageId: "not-a-language",
        mode: "learner_practice",
        seedPrompt: "Hello",
        contextNoteIds: [],
        contextPassageIds: []
      }
    });
    expect(missingLanguage.statusCode).toBe(404);
    expect(missingLanguage.json()).toEqual({
      error: "Language not found: not-a-language",
      i18nKey: "errors.languageNotFound"
    });

    const missingSession = await app.inject({
      method: "GET",
      url: "/ai/sessions/missing-session",
      headers: authHeaders("learner-1")
    });
    expect(missingSession.statusCode).toBe(404);
    expect(missingSession.json()).toEqual({
      error: "AI session not found: missing-session",
      i18nKey: "errors.aiSessionNotFound"
    });

    const invalidMessage = await app.inject({
      method: "POST",
      url: "/ai/sessions/missing-session/messages",
      headers: authHeaders("learner-1"),
      payload: { content: "   " }
    });
    expect(invalidMessage.statusCode).toBe(400);
    expect(invalidMessage.json()).toEqual({
      error: "Invalid AI message body",
      i18nKey: "errors.invalidAiMessageBody"
    });
  });

  it("returns sanitized LLM provider failure details for AI session creation", async () => {
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage() {
        throw new Error("LLM provider request failed with status 429: Rate limit for sk-route-secret");
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });

    const response = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        mode: "programmer_debug",
        seedPrompt: "Use the model safely.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["testlang-c001"]
      }
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: "LLM generation failed: LLM provider request failed with status 429: Rate limit for [redacted-secret]",
      i18nKey: "errors.llmGenerationFailed"
    });
    expect(JSON.stringify(response.json())).not.toContain("sk-route-secret");
  });

  it("persists failed AI session attempts with sanitized observable diagnostics", async () => {
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage() {
        throw new Error("LLM provider request failed with status 429: Rate limit for sk-route-secret");
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });

    const response = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        mode: "programmer_debug",
        seedPrompt: "Use the model safely.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["testlang-c001"]
      }
    });

    expect(response.statusCode).toBe(502);

    const observability = await app.inject({
      method: "GET",
      url: "/observability/ai-sessions",
      headers: authHeaders("programmer-1")
    });
    expect(observability.statusCode).toBe(200);
    expect(observability.json().totals).toMatchObject({ sessions: 1, activeSessions: 0 });
    expect(observability.json().sessions[0]).toMatchObject({
      languageId: TEST_LANGUAGE_ID,
      mode: "programmer_debug",
      status: "failed",
      createdBy: "programmer-1",
      messageCount: 1,
      contextNoteIds: [reviewedNoteId],
      contextPassageIds: ["testlang-c001"]
    });

    const sessionId = observability.json().sessions[0].id;
    const storedSession = await app.inject({
      method: "GET",
      url: `/ai/sessions/${encodeURIComponent(sessionId)}`,
      headers: authHeaders("programmer-1")
    });
    expect(storedSession.statusCode).toBe(200);
    expect(storedSession.json().status).toBe("failed");
    expect(storedSession.json().messages).toHaveLength(1);
    expect(storedSession.json().trace.at(-1)).toMatchObject({
      kind: "generation",
      label: "Provider failure",
      summary: "LLM generation failed: LLM provider request failed with status 429: Rate limit for [redacted-secret]"
    });
    expect(JSON.stringify(storedSession.json())).not.toContain("sk-route-secret");
  });

  it("redacts configured non-sk provider secrets from AI session failures", async () => {
    const previousAssiniKey = process.env.ASSINI_LLM_API_KEY;
    process.env.ASSINI_LLM_API_KEY = "plain-provider-secret";
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage() {
        throw new Error("LLM provider request failed with status 500: plain-provider-secret");
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/ai/sessions",
        headers: authHeaders("programmer-1"),
        payload: {
          languageId: TEST_LANGUAGE_ID,
          mode: "programmer_debug",
          seedPrompt: "Use the model safely.",
          contextNoteIds: [reviewedNoteId],
          contextPassageIds: ["testlang-c001"]
        }
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({
        error: "LLM generation failed: LLM provider request failed with status 500: [redacted-secret]",
        i18nKey: "errors.llmGenerationFailed"
      });
      expect(JSON.stringify(response.json())).not.toContain("plain-provider-secret");

      const observability = await app.inject({
        method: "GET",
        url: "/observability/ai-sessions",
        headers: authHeaders("programmer-1")
      });
      const storedSession = await app.inject({
        method: "GET",
        url: `/ai/sessions/${encodeURIComponent(observability.json().sessions[0].id)}`,
        headers: authHeaders("programmer-1")
      });
      expect(JSON.stringify(storedSession.json())).not.toContain("plain-provider-secret");
    } finally {
      if (previousAssiniKey === undefined) {
        delete process.env.ASSINI_LLM_API_KEY;
      } else {
        process.env.ASSINI_LLM_API_KEY = previousAssiniKey;
      }
    }
  });

  it("returns sanitized LLM provider failure details for AI session follow-ups", async () => {
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
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        mode: "programmer_debug",
        seedPrompt: "Start safely.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["testlang-c001"]
      }
    });
    expect(created.statusCode).toBe(201);

    const followUp = await app.inject({
      method: "POST",
      url: `/ai/sessions/${encodeURIComponent(created.json().id)}/messages`,
      headers: authHeaders("programmer-1"),
      payload: { content: "Continue safely." }
    });

    expect(followUp.statusCode).toBe(502);
    expect(followUp.json()).toEqual({
      error: "LLM generation failed: LLM provider request timed out after 25ms",
      i18nKey: "errors.llmGenerationFailed"
    });
  });

  it("marks existing AI sessions failed when follow-up generation fails", async () => {
    let callCount = 0;
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage(input) {
        callCount += 1;
        if (callCount === 1) {
          return { content: `Provider response: ${input.prompt}`, warnings: [] };
        }
        throw new Error("LLM provider request failed with status 500: Retry with sk-followup-secret");
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });

    const created = await app.inject({
      method: "POST",
      url: "/ai/sessions",
      headers: authHeaders("programmer-1"),
      payload: {
        languageId: TEST_LANGUAGE_ID,
        mode: "programmer_debug",
        seedPrompt: "Start safely.",
        contextNoteIds: [reviewedNoteId],
        contextPassageIds: ["testlang-c001"]
      }
    });
    expect(created.statusCode).toBe(201);

    const followUp = await app.inject({
      method: "POST",
      url: `/ai/sessions/${encodeURIComponent(created.json().id)}/messages`,
      headers: authHeaders("programmer-1"),
      payload: { content: "Continue safely." }
    });
    expect(followUp.statusCode).toBe(502);

    const storedSession = await app.inject({
      method: "GET",
      url: `/ai/sessions/${encodeURIComponent(created.json().id)}`,
      headers: authHeaders("programmer-1")
    });
    expect(storedSession.statusCode).toBe(200);
    expect(storedSession.json().status).toBe("failed");
    expect(storedSession.json().messages).toHaveLength(3);
    expect(storedSession.json().messages.at(-1)).toMatchObject({
      role: "user",
      content: "Continue safely.",
      createdBy: "programmer-1"
    });
    expect(storedSession.json().trace.at(-1)).toMatchObject({
      kind: "generation",
      label: "Provider failure",
      summary: "LLM generation failed: LLM provider request failed with status 500: Retry with [redacted-secret]"
    });
    const sessionNode = storedSession
      .json()
      .neuralMap.nodes.find((node: { id: string }) => node.id === `ai_session:${created.json().id}`);
    expect(sessionNode.metadata.status).toBe("failed");
    expect(JSON.stringify(storedSession.json())).not.toContain("sk-followup-secret");
  });
});
