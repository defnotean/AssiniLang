import { describe, expect, it } from "vitest";
import { LOCAL_PROTOTYPE_USERS, type AiSession, type AiSessionMode } from "@assini/db";
import { canReadAiSession, toPublicAiSession } from "./aiSessionHelpers.js";

function user(id: string) {
  const actor = LOCAL_PROTOTYPE_USERS.find((entry) => entry.id === id);
  if (!actor) throw new Error(`Missing prototype user: ${id}`);
  return actor;
}

function session(overrides: Partial<AiSession> & Pick<AiSession, "mode" | "createdBy">): AiSession {
  return {
    id: "ai-session-test-1",
    languageId: "testlang",
    status: "active",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    contextNoteIds: [],
    contextPassageIds: [],
    messages: [
      {
        id: "ai-session-test-1-message-1",
        role: "user",
        content: "Learner seed prompt",
        createdAt: "2026-06-06T00:00:00.000Z",
        createdBy: overrides.createdBy
      },
      {
        id: "ai-session-test-1-message-2",
        role: "assistant",
        content: "Safe assistant reply",
        createdAt: "2026-06-06T00:00:00.000Z",
        createdBy: "local-ai"
      }
    ],
    thinkingSummary: "Safe reasoning summary.",
    trace: [],
    neuralMap: { nodes: [], edges: [] },
    privacy: {
      redactions: ["hidden-chain-of-thought"],
      exposesHiddenChainOfThought: false
    },
    ...overrides
  };
}

describe("canReadAiSession", () => {
  it.each([
    ["learner_practice", "learner-1", "learner-1", true],
    ["learner_practice", "learner-1", "elder-1", true],
    ["learner_practice", "learner-1", "reviewer-1", true],
    ["learner_practice", "learner-1", "lead-1", true],
    ["learner_practice", "learner-1", "admin-1", true],
    ["learner_practice", "learner-1", "programmer-1", false],
    ["elder_review", "elder-1", "elder-1", true],
    ["elder_review", "elder-1", "reviewer-1", false],
    ["elder_review", "elder-1", "learner-1", false],
    ["elder_review", "elder-1", "lead-1", true],
    ["programmer_debug", "programmer-1", "programmer-1", true],
    ["programmer_debug", "programmer-1", "learner-1", false],
    ["programmer_debug", "programmer-1", "elder-1", false],
    ["programmer_debug", "programmer-1", "reviewer-1", false],
    ["programmer_debug", "programmer-1", "lead-1", true]
  ] as const satisfies ReadonlyArray<[AiSessionMode, string, string, boolean]>)(
    "mode=%s creator=%s actor=%s -> %s",
    (mode, creatorId, actorId, allowed) => {
      const item = session({ mode, createdBy: creatorId });
      expect(canReadAiSession(item, user(actorId))).toBe(allowed);
    }
  );
});

describe("toPublicAiSession", () => {
  it("redacts learner identifiers for non-privileged readers", () => {
    const item = session({ mode: "learner_practice", createdBy: "learner-1" });
    const publicSession = toPublicAiSession(item, user("reviewer-1"));

    expect(publicSession.createdBy).toBe("redacted");
    expect(publicSession.messages[0]).toMatchObject({
      role: "user",
      content: "[redacted user input]",
      createdBy: "redacted"
    });
    expect(publicSession.messages[1].content).toBe("Safe assistant reply");
  });

  it("preserves creator attribution for the session owner", () => {
    const item = session({ mode: "learner_practice", createdBy: "learner-1" });
    const publicSession = toPublicAiSession(item, user("learner-1"));

    expect(publicSession.createdBy).toBe("learner-1");
    expect(publicSession.messages[0].content).toBe("Learner seed prompt");
  });
});
