import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID, type AppState } from "@assini/db";
import { createServer } from "./server.js";

const SOURCE_ASSET_ID = "source-corpus-segmentation";
const emptyPayload = { tags: [], morphologicalSegmentation: [], topicTags: [] };

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

function buildCorpusDraftState(): AppState {
  const baseState = buildTestWorkspaceState();
  return {
    ...baseState,
    sourceAssets: [
      ...baseState.sourceAssets,
      {
        id: SOURCE_ASSET_ID,
        languageId: TEST_LANGUAGE_ID,
        kind: "text" as const,
        title: "Corpus segmentation source",
        rawText: "mira talo-na = I walk by the river.",
        status: "processed" as const,
        createdBy: "reviewer-1",
        createdAt: "2026-06-12T00:00:00.000Z"
      }
    ],
    extractionDrafts: [
      {
        id: "draft-corpus-empty-segmentation",
        languageId: TEST_LANGUAGE_ID,
        sourceAssetId: SOURCE_ASSET_ID,
        kind: "corpus_passage" as const,
        payload: {
          ...emptyPayload,
          textTarget: "mira nemi-lo-ki",
          textTranslation: "The river taught."
        },
        confidence: "low" as const,
        status: "proposed" as const,
        createdAt: "2026-06-12T00:00:01.000Z"
      }
    ]
  };
}

describe("POST /extraction-drafts/:draftId/accept corpus segmentation", () => {
  it("fills empty draft segmentation from the language lexicon on accept", async () => {
    const app = createServer({ initialState: buildCorpusDraftState() });

    const accept = await app.inject({
      method: "POST",
      url: "/extraction-drafts/draft-corpus-empty-segmentation/accept",
      headers: authHeaders("reviewer-1")
    });

    expect(accept.statusCode).toBe(200);
    const body = accept.json() as {
      entity: { morphologicalSegmentation: Array<{ surface: string; gloss: string }> };
    };

    expect(body.entity.morphologicalSegmentation).toEqual([
      { surface: "mira", lemma: "mira", gloss: "river", features: ["place"] },
      { surface: "nemi", lemma: "nemi", gloss: "teach", features: ["learning"] },
      { surface: "-lo", lemma: "-lo", gloss: "past tense", features: ["tense"] },
      { surface: "-ki", lemma: "-ki", gloss: "third person singular", features: ["person"] }
    ]);
  });
});
