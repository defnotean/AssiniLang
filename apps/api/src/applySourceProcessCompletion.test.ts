import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID, type SourceAsset, type User } from "@assini/db";
import { applySourceProcessCompletion } from "./sourceProcessingDurability.js";
import { STALE_PROCESSING_ERROR } from "./jobRecovery.js";

const actor: User = {
  id: "reviewer-1",
  name: "Local Reviewer",
  role: "reviewer"
};

function processingSource(overrides: Partial<SourceAsset> = {}): SourceAsset {
  return {
    id: "source-1",
    languageId: TEST_LANGUAGE_ID,
    kind: "wordlist",
    title: "Word list",
    rawText: "mira = river",
    status: "processing",
    processingStartedAt: "2026-06-06T00:00:00.000Z",
    processingHeartbeatAt: "2026-06-06T00:00:00.000Z",
    processingAttempts: 2,
    createdBy: "reviewer-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("applySourceProcessCompletion", () => {
  it("ignores late success after stale recovery already marked the asset failed", () => {
    const state = buildTestWorkspaceState();
    state.sourceAssets.push(
      processingSource({
        status: "failed",
        error: STALE_PROCESSING_ERROR,
        processedAt: "2026-06-06T00:20:00.000Z",
        processingStartedAt: undefined,
        processingHeartbeatAt: undefined
      })
    );

    const output = { drafts: [] as never[] };
    const next = applySourceProcessCompletion(
      state,
      {
        sourceId: "source-1",
        actor,
        processedAt: "2026-06-06T00:21:00.000Z",
        extraction: {
          summary: "Late success",
          candidates: [
            {
              kind: "lexeme",
              payload: { form: "mira", gloss: "river" },
              confidence: "high",
              rationale: "late"
            }
          ],
          warnings: []
        }
      },
      output
    );

    expect(next).toBe(state);
    expect(output.updatedAsset?.status).toBe("failed");
    expect(output.updatedAsset?.error).toBe(STALE_PROCESSING_ERROR);
    expect(output.drafts).toEqual([]);
    expect(next.extractionDrafts).toEqual(state.extractionDrafts);
  });

  it("clears processingAttempts on successful completion while status is still processing", () => {
    const state = buildTestWorkspaceState();
    state.sourceAssets.push(processingSource());

    const output = { drafts: [] as never[] };
    const next = applySourceProcessCompletion(
      state,
      {
        sourceId: "source-1",
        actor,
        processedAt: "2026-06-06T00:01:00.000Z",
        extraction: {
          summary: "Done",
          candidates: [
            {
              kind: "lexeme",
              payload: { form: "mira", gloss: "river" },
              confidence: "high",
              rationale: "ok"
            }
          ],
          warnings: []
        }
      },
      output
    );

    expect(output.updatedAsset).toMatchObject({
      id: "source-1",
      status: "processed"
    });
    expect(output.updatedAsset?.processingAttempts).toBeUndefined();
    expect(output.updatedAsset?.processingStartedAt).toBeUndefined();
    expect(output.updatedAsset?.processingHeartbeatAt).toBeUndefined();
    expect(next.sourceAssets.find((asset) => asset.id === "source-1")?.status).toBe("processed");
  });

  it("reuses a semantically identical proposed draft instead of duplicating it", () => {
    const state = buildTestWorkspaceState();
    state.sourceAssets.push(processingSource());
    state.extractionDrafts.push({
      id: "draft-existing",
      languageId: TEST_LANGUAGE_ID,
      sourceAssetId: "source-1",
      kind: "lexeme",
      payload: {
        form: "mira",
        gloss: "river",
        partOfSpeech: "noun",
        tags: ["river", "imported"],
        morphologicalSegmentation: [],
        topicTags: []
      },
      confidence: "medium",
      status: "proposed",
      createdAt: "2026-06-06T00:00:00.000Z"
    });

    const output = { drafts: [] as never[] };
    const next = applySourceProcessCompletion(
      state,
      {
        sourceId: "source-1",
        actor,
        processedAt: "2026-06-06T00:01:00.000Z",
        extraction: {
          summary: "Same suggestion",
          candidates: [
            {
              kind: "lexeme",
              payload: {
                form: " MIRA ",
                gloss: "River",
                partOfSpeech: "NOUN",
                tags: ["imported", "river"],
                morphologicalSegmentation: [],
                topicTags: []
              },
              confidence: "high"
            }
          ],
          warnings: []
        }
      },
      output
    );

    expect(output.drafts.map((draft) => draft.id)).toEqual(["draft-existing"]);
    expect(next.extractionDrafts).toHaveLength(state.extractionDrafts.length);
    expect(next.auditEvents.at(-1)?.metadata).toMatchObject({
      candidateCount: 1,
      createdDraftCount: 0,
      reusedDraftCount: 1,
      skippedReviewedDraftCount: 0
    });
  });

  it("does not re-propose a candidate that was already reviewed", () => {
    const state = buildTestWorkspaceState();
    state.sourceAssets.push(processingSource());
    state.extractionDrafts.push({
      id: "draft-reviewed",
      languageId: TEST_LANGUAGE_ID,
      sourceAssetId: "source-1",
      kind: "grammar_note",
      payload: {
        topic: "word order",
        explanation: "Objects follow verbs.",
        tags: [],
        morphologicalSegmentation: [],
        topicTags: []
      },
      confidence: "high",
      status: "rejected",
      createdAt: "2026-06-06T00:00:00.000Z",
      reviewedBy: actor.id,
      reviewedAt: "2026-06-06T00:00:30.000Z"
    });

    const output = { drafts: [] as never[] };
    const next = applySourceProcessCompletion(
      state,
      {
        sourceId: "source-1",
        actor,
        processedAt: "2026-06-06T00:01:00.000Z",
        extraction: {
          summary: "Same reviewed suggestion",
          candidates: [
            {
              kind: "grammar_note",
              payload: {
                topic: "Word Order",
                explanation: "Objects  follow verbs.",
                tags: [],
                morphologicalSegmentation: [],
                topicTags: []
              },
              confidence: "medium"
            }
          ],
          warnings: []
        }
      },
      output
    );

    expect(output.drafts).toEqual([]);
    expect(next.extractionDrafts).toHaveLength(state.extractionDrafts.length);
    expect(next.auditEvents.at(-1)?.metadata).toMatchObject({
      candidateCount: 1,
      createdDraftCount: 0,
      reusedDraftCount: 0,
      skippedReviewedDraftCount: 1
    });
  });

  it("collapses legacy duplicate proposals for the same source identity", () => {
    const state = buildTestWorkspaceState();
    state.sourceAssets.push(processingSource());
    for (const id of ["draft-first", "draft-duplicate"]) {
      state.extractionDrafts.push({
        id,
        languageId: TEST_LANGUAGE_ID,
        sourceAssetId: "source-1",
        kind: "corpus_passage",
        payload: {
          textTarget: "mira talo",
          textTranslation: id === "draft-first" ? "I walk by the river." : "River walking.",
          tags: [],
          morphologicalSegmentation: [],
          topicTags: []
        },
        confidence: "medium",
        status: "proposed",
        createdAt: id === "draft-first" ? "2026-06-06T00:00:00.000Z" : "2026-06-06T00:00:01.000Z"
      });
    }

    const output = { drafts: [] as never[] };
    const next = applySourceProcessCompletion(
      state,
      {
        sourceId: "source-1",
        actor,
        processedAt: "2026-06-06T00:01:00.000Z",
        extraction: {
          summary: "Same passage",
          candidates: [
            {
              kind: "corpus_passage",
              payload: {
                textTarget: "Mira  talo",
                textTranslation: "I walk by the river.",
                tags: [],
                morphologicalSegmentation: [],
                topicTags: []
              },
              confidence: "high"
            }
          ],
          warnings: []
        }
      },
      output
    );

    expect(output.drafts.map((draft) => draft.id)).toEqual(["draft-first"]);
    expect(next.extractionDrafts.filter((draft) => draft.sourceAssetId === "source-1")).toHaveLength(1);
    expect(next.auditEvents.at(-1)?.metadata).toMatchObject({
      createdDraftCount: 0,
      removedDuplicateDraftCount: 1,
      reusedDraftCount: 1
    });
  });
});
