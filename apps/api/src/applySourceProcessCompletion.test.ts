import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID, type SourceAsset, type User } from "@assini/db";
import { applySourceProcessCompletion } from "./routes/sources.js";
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
    state.sourceAssets.push(processingSource({
      status: "failed",
      error: STALE_PROCESSING_ERROR,
      processedAt: "2026-06-06T00:20:00.000Z",
      processingStartedAt: undefined,
      processingHeartbeatAt: undefined
    }));

    const output = { drafts: [] as never[] };
    const next = applySourceProcessCompletion(state, {
      sourceId: "source-1",
      actor,
      processedAt: "2026-06-06T00:21:00.000Z",
      extraction: {
        summary: "Late success",
        candidates: [{
          kind: "lexeme",
          payload: { form: "mira", gloss: "river" },
          confidence: "high",
          rationale: "late"
        }],
        warnings: []
      }
    }, output);

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
    const next = applySourceProcessCompletion(state, {
      sourceId: "source-1",
      actor,
      processedAt: "2026-06-06T00:01:00.000Z",
      extraction: {
        summary: "Done",
        candidates: [{
          kind: "lexeme",
          payload: { form: "mira", gloss: "river" },
          confidence: "high",
          rationale: "ok"
        }],
        warnings: []
      }
    }, output);

    expect(output.updatedAsset).toMatchObject({
      id: "source-1",
      status: "processed"
    });
    expect(output.updatedAsset?.processingAttempts).toBeUndefined();
    expect(output.updatedAsset?.processingStartedAt).toBeUndefined();
    expect(output.updatedAsset?.processingHeartbeatAt).toBeUndefined();
    expect(next.sourceAssets.find((asset) => asset.id === "source-1")?.status).toBe("processed");
  });
});
