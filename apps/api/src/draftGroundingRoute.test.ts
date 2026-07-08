import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID, type AppState, type Lexeme } from "@assini/db";
import { createServer } from "./server.js";

const SOURCE_ASSET_ID = "source-grounding-route";
const emptyPayload = { tags: [], morphologicalSegmentation: [], topicTags: [] };

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

function lexeme(form: string, gloss: string): Lexeme {
  return {
    id: `lex-${form}`,
    languageId: TEST_LANGUAGE_ID,
    form,
    gloss,
    partOfSpeech: "unknown",
    tags: [],
    sourceAssetIds: [],
    createdBy: "tester",
    createdAt: "2026-06-10T00:00:00.000Z"
  };
}

function buildGroundingState(): AppState {
  const baseState = buildTestWorkspaceState();
  return {
    ...baseState,
    lexemes: [lexeme("talu", "water"), lexeme("ne", "locative case marker")],
    sourceAssets: [
      ...baseState.sourceAssets,
      {
        id: SOURCE_ASSET_ID,
        languageId: TEST_LANGUAGE_ID,
        kind: "text" as const,
        title: "Grounding route source",
        rawText: "talune = swims",
        status: "processed" as const,
        createdBy: "reviewer-1",
        createdAt: "2026-06-10T00:00:00.000Z"
      }
    ],
    extractionDrafts: [
      {
        id: "grounding-draft-talune",
        languageId: TEST_LANGUAGE_ID,
        sourceAssetId: SOURCE_ASSET_ID,
        kind: "lexeme" as const,
        payload: { ...emptyPayload, form: "talune", gloss: "swims" },
        confidence: "medium" as const,
        status: "proposed" as const,
        createdAt: "2026-06-11T00:00:01.000Z"
      },
      {
        id: "grounding-draft-clean",
        languageId: TEST_LANGUAGE_ID,
        sourceAssetId: SOURCE_ASSET_ID,
        kind: "lexeme" as const,
        payload: { ...emptyPayload, form: "miro", gloss: "river" },
        confidence: "medium" as const,
        status: "proposed" as const,
        createdAt: "2026-06-11T00:00:02.000Z"
      }
    ]
  };
}

describe("GET /languages/:languageId/extraction-drafts grounding flags", () => {
  it("annotates flagged drafts with a grounding array and leaves clean drafts unflagged", async () => {
    const app = createServer({ initialState: buildGroundingState() });

    const response = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/extraction-drafts?status=proposed`,
      headers: authHeaders("reviewer-1")
    });

    expect(response.statusCode).toBe(200);
    const drafts = response.json() as { id: string; grounding?: { kind: string; message: string }[] }[];

    const flagged = drafts.find((draft) => draft.id === "grounding-draft-talune");
    expect(flagged?.grounding).toHaveLength(1);
    expect(flagged?.grounding?.[0]?.kind).toBe("decomposable_form");
    expect(flagged?.grounding?.[0]?.message).toContain('talu ("water")');
    expect(flagged?.grounding?.[0]?.message).toContain('ne ("locative case marker")');

    const clean = drafts.find((draft) => draft.id === "grounding-draft-clean");
    expect(clean).toBeDefined();
    expect(clean?.grounding).toBeUndefined();
  });

  it("never blocks accepting a grounding-flagged draft", async () => {
    const app = createServer({ initialState: buildGroundingState() });

    const accept = await app.inject({
      method: "POST",
      url: "/extraction-drafts/grounding-draft-talune/accept",
      headers: { "x-assini-user-id": "reviewer-1", "x-assini-dev-token": "test" }
    });

    expect(accept.statusCode).toBe(200);
    expect(accept.json().draft.status).toBe("accepted");
  });
});
