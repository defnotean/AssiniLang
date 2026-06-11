import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID, type Note } from "@assini/db";
import type { ModelDraftGroundingResult } from "@assini/eval";
import { createServer } from "./server.js";
import type { LlmProvider } from "./llmProvider.js";

type ScoredNote = Note & { grounding: ModelDraftGroundingResult };

describe("model-draft grounding scores", () => {
  function authHeaders(userId: string) {
    return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
  }

  function noteProvider(content: string): LlmProvider {
    return {
      name: "fake-note-provider",
      async generateAssistantMessage() {
        return { content: "unused", warnings: [] };
      },
      async completeChat() {
        return content;
      }
    };
  }

  const groundedNoteJson = JSON.stringify({
    notes: [
      {
        topic: "morphology/verb/third-person",
        explanation: "The suffix -ki marks a third-person singular subject on the verb form.",
        evidencePassageIds: [`${TEST_LANGUAGE_ID}-c003`],
        confidence: "medium"
      }
    ]
  });

  it("includes grounding scores on each returned draft", async () => {
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      llmProvider: noteProvider(groundedNoteJson)
    });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/study-loop/model-draft`,
      headers: authHeaders("reviewer-1")
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { notes: ScoredNote[]; warnings: string[]; generated: number };
    expect(body.generated).toBe(1);
    expect(body.notes).toHaveLength(1);

    const [note] = body.notes;
    expect(note.grounding).toBeDefined();
    expect(note.grounding.score).toBeGreaterThanOrEqual(0);
    expect(note.grounding.score).toBeLessThanOrEqual(1);
    expect(typeof note.grounding.checks.groundedEvidence.passed).toBe("boolean");
    expect(typeof note.grounding.checks.knownForms.passed).toBe("boolean");
    expect(typeof note.grounding.checks.topicAlignment.passed).toBe("boolean");
    expect(typeof note.grounding.checks.exampleCoverage.passed).toBe("boolean");
    expect(Array.isArray(note.grounding.failures)).toBe(true);

    // This fixture draft is fully grounded against the test workspace.
    expect(note.grounding.checks.groundedEvidence.passed).toBe(true);
    expect(note.grounding.checks.knownForms.passed).toBe(true);
    expect(note.grounding.checks.exampleCoverage.passed).toBe(true);
  });

  it("flags a misaligned topic in the grounding result", async () => {
    // Note: generation itself drops unknown evidence passage ids before the
    // route persists anything, so topic misalignment is the grounding failure
    // reachable end-to-end through this route.
    const misalignedJson = JSON.stringify({
      notes: [
        {
          topic: "phonology/exotic-clusters",
          explanation: "Consonant clusters appear word-initially in borrowed vocabulary items.",
          evidencePassageIds: [`${TEST_LANGUAGE_ID}-c003`],
          confidence: "low"
        }
      ]
    });
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      llmProvider: noteProvider(misalignedJson)
    });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/study-loop/model-draft`,
      headers: authHeaders("reviewer-1")
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { notes: ScoredNote[] };
    const [note] = body.notes;
    expect(note.grounding.checks.topicAlignment.passed).toBe(false);
    expect(note.grounding.failures.some((failure) => failure.includes("phonology/exotic-clusters"))).toBe(true);
    expect(note.grounding.score).toBeLessThan(1);
  });

  it("does not persist the grounding field on stored notes", async () => {
    const app = createServer({
      initialState: buildTestWorkspaceState(),
      llmProvider: noteProvider(groundedNoteJson)
    });

    const response = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/study-loop/model-draft`,
      headers: authHeaders("reviewer-1")
    });
    expect(response.statusCode).toBe(200);
    const created = (response.json() as { notes: ScoredNote[] }).notes[0];

    const notesResponse = await app.inject({ method: "GET", url: `/languages/${TEST_LANGUAGE_ID}/notes` });
    const persisted = (notesResponse.json() as Array<Record<string, unknown>>).find((note) => note.id === created.id);

    expect(persisted).toBeDefined();
    expect(persisted).not.toHaveProperty("grounding");
    expect(persisted).toMatchObject({
      topic: created.topic,
      status: "draft",
      evidencePassageIds: created.evidencePassageIds,
      evidenceCount: created.evidenceCount
    });
  });
});
