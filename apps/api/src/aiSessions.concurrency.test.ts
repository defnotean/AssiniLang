import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import type { LlmProvider } from "./llmProvider.js";
import { createServer } from "./server.js";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("AI session follow-up concurrency", () => {
  it("serializes generation and preserves deterministic message and context ordering", async () => {
    const inputs: Array<{ prompt: string; previousMessages: string[] }> = [];
    const llmProvider: LlmProvider = {
      name: "test-provider",
      async generateAssistantMessage(input) {
        inputs.push({
          prompt: input.prompt,
          previousMessages: input.previousMessages.map((message) => `${message.role}:${message.content}`)
        });
        if (input.prompt === "First follow-up") await wait(20);
        return { content: `Response to ${input.prompt}`, warnings: [] };
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

    const sessionId = created.json().id as string;
    const first = app.inject({
      method: "POST",
      url: `/ai/sessions/${encodeURIComponent(sessionId)}/messages`,
      headers: authHeaders("learner-1"),
      payload: { content: "First follow-up" }
    });
    const second = app.inject({
      method: "POST",
      url: `/ai/sessions/${encodeURIComponent(sessionId)}/messages`,
      headers: authHeaders("learner-1"),
      payload: { content: "Second follow-up" }
    });
    const [firstResponse, secondResponse] = await Promise.all([first, second]);

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(inputs.map((input) => input.prompt)).toEqual([
      "Start",
      "First follow-up",
      "Second follow-up"
    ]);
    expect(inputs[2]?.previousMessages).toEqual([
      "user:Start",
      "assistant:Response to Start",
      "user:First follow-up",
      "assistant:Response to First follow-up"
    ]);

    const session = secondResponse.json();
    expect(session.messages).toHaveLength(6);
    expect(session.messages.map((message: { role: string; content: string }) => `${message.role}:${message.content}`)).toEqual([
      "user:Start",
      "assistant:Response to Start",
      "user:First follow-up",
      "assistant:Response to First follow-up",
      "user:Second follow-up",
      "assistant:Response to Second follow-up"
    ]);
  });
});
