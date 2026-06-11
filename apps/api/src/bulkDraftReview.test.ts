import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID, type AppState } from "@assini/db";
import { createServer } from "./server.js";

const OTHER_LANGUAGE_ID = "otherlang";
const SOURCE_ASSET_ID = "source-bulk-review";

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

const draftBase = {
  languageId: TEST_LANGUAGE_ID,
  sourceAssetId: SOURCE_ASSET_ID,
  confidence: "medium" as const,
  status: "proposed" as const
};
const emptyPayload = { tags: [], morphologicalSegmentation: [], topicTags: [] };

function buildBulkReviewState(): AppState {
  const baseState = buildTestWorkspaceState();
  const baseLanguage = baseState.languages[0]!;
  return {
    ...baseState,
    languages: [
      ...baseState.languages,
      { ...baseLanguage, id: OTHER_LANGUAGE_ID, name: "Other Language" }
    ],
    sourceAssets: [
      ...baseState.sourceAssets,
      {
        id: SOURCE_ASSET_ID,
        languageId: TEST_LANGUAGE_ID,
        kind: "text" as const,
        title: "Bulk review source",
        rawText: "pelu = stone",
        status: "processed" as const,
        createdBy: "reviewer-1",
        createdAt: "2026-06-10T00:00:00.000Z"
      }
    ],
    extractionDrafts: [
      {
        ...draftBase,
        id: "bulk-draft-lexeme",
        kind: "lexeme" as const,
        payload: { ...emptyPayload, form: "pelu", gloss: "stone" },
        createdAt: "2026-06-10T00:00:01.000Z"
      },
      {
        ...draftBase,
        id: "bulk-draft-note",
        kind: "grammar_note" as const,
        payload: { ...emptyPayload, topic: "phonology/vowel-harmony", explanation: "Vowels agree across suffixes." },
        createdAt: "2026-06-10T00:00:02.000Z"
      },
      {
        ...draftBase,
        id: "bulk-draft-already-rejected",
        kind: "lexeme" as const,
        status: "rejected" as const,
        payload: { ...emptyPayload, form: "saku", gloss: "child" },
        createdAt: "2026-06-10T00:00:03.000Z"
      },
      {
        ...draftBase,
        id: "bulk-draft-other-language",
        languageId: OTHER_LANGUAGE_ID,
        kind: "lexeme" as const,
        payload: { ...emptyPayload, form: "tovi", gloss: "moon" },
        createdAt: "2026-06-10T00:00:04.000Z"
      }
    ]
  };
}

function bulkReview(
  app: ReturnType<typeof createServer>,
  payload: unknown,
  options?: { languageId?: string; headers?: Record<string, string> }
) {
  return app.inject({
    method: "POST",
    url: `/languages/${options?.languageId ?? TEST_LANGUAGE_ID}/extraction-drafts/bulk-review`,
    ...(options?.headers === undefined ? { headers: authHeaders("reviewer-1") } : { headers: options.headers }),
    payload: payload as Record<string, unknown>
  });
}

describe("bulk extraction draft review", () => {
  it("accepts a mixed batch of proposed drafts and commits each entity", async () => {
    const app = createServer({ initialState: buildBulkReviewState() });

    const response = await bulkReview(app, { action: "accept", draftIds: ["bulk-draft-lexeme", "bulk-draft-note"] });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accepted).toBe(2);
    expect(body.rejected).toBe(0);
    expect(body.failed).toBe(0);
    expect(body.results).toHaveLength(2);
    for (const result of body.results) {
      expect(result.ok).toBe(true);
      expect(typeof result.committedEntityId).toBe("string");
      expect(result.error).toBeUndefined();
    }

    const drafts = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/extraction-drafts?status=accepted`
    });
    const acceptedIds = drafts.json().map((draft: { id: string }) => draft.id);
    expect(acceptedIds).toContain("bulk-draft-lexeme");
    expect(acceptedIds).toContain("bulk-draft-note");

    // No reviewer internals or answer keys leak into the bulk response.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("expectedAnswers");
    expect(serialized).not.toContain("learnerId");
  });

  it("rejects drafts in bulk and deduplicates repeated ids", async () => {
    const app = createServer({ initialState: buildBulkReviewState() });

    const response = await bulkReview(app, {
      action: "reject",
      draftIds: ["bulk-draft-lexeme", "bulk-draft-lexeme", "bulk-draft-note"]
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.rejected).toBe(2);
    expect(body.accepted).toBe(0);
    expect(body.failed).toBe(0);
    expect(body.results).toHaveLength(2);
  });

  it("reports per-item failures without failing the whole request", async () => {
    const app = createServer({ initialState: buildBulkReviewState() });

    const response = await bulkReview(app, {
      action: "accept",
      draftIds: [
        "bulk-draft-lexeme",
        "missing-draft",
        "bulk-draft-already-rejected",
        "bulk-draft-other-language"
      ]
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accepted).toBe(1);
    expect(body.failed).toBe(3);

    const byId = new Map<string, { ok: boolean; error?: string }>(
      body.results.map((result: { draftId: string }) => [result.draftId, result])
    );
    expect(byId.get("bulk-draft-lexeme")?.ok).toBe(true);
    expect(byId.get("missing-draft")).toMatchObject({ ok: false, error: "Extraction draft not found: missing-draft" });
    expect(byId.get("bulk-draft-already-rejected")).toMatchObject({ ok: false, error: "Extraction draft is already rejected." });
    expect(byId.get("bulk-draft-other-language")?.ok).toBe(false);
    expect(byId.get("bulk-draft-other-language")?.error).toContain("does not belong to language");
  });

  it("requires authentication and a reviewing role", async () => {
    const app = createServer({ initialState: buildBulkReviewState() });
    const payload = { action: "accept", draftIds: ["bulk-draft-lexeme"] };

    const unauthenticated = await bulkReview(app, payload, { headers: {} });
    expect(unauthenticated.statusCode).toBe(401);

    const learner = await bulkReview(app, payload, { headers: authHeaders("learner-1") });
    expect(learner.statusCode).toBe(403);
  });

  it("rejects malformed bodies and more than 50 draft ids", async () => {
    const app = createServer({ initialState: buildBulkReviewState() });

    const badAction = await bulkReview(app, { action: "destroy", draftIds: ["bulk-draft-lexeme"] });
    expect(badAction.statusCode).toBe(400);

    const emptyIds = await bulkReview(app, { action: "accept", draftIds: [] });
    expect(emptyIds.statusCode).toBe(400);

    const tooMany = await bulkReview(app, {
      action: "accept",
      draftIds: Array.from({ length: 51 }, (_, index) => `draft-${index}`)
    });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json().error).toContain("50");
  });

  it("returns 404 for an unknown language", async () => {
    const app = createServer({ initialState: buildBulkReviewState() });

    const response = await bulkReview(app, { action: "accept", draftIds: ["bulk-draft-lexeme"] }, { languageId: "nope" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Language not found: nope" });
  });

  it("appends one audit event per successfully reviewed draft", async () => {
    const app = createServer({ initialState: buildBulkReviewState() });

    const response = await bulkReview(app, {
      action: "accept",
      draftIds: ["bulk-draft-lexeme", "bulk-draft-note", "missing-draft"]
    });
    expect(response.statusCode).toBe(200);

    const audit = await app.inject({
      method: "GET",
      url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
      headers: authHeaders("programmer-1")
    });
    expect(audit.statusCode).toBe(200);
    const acceptedEvents = audit.json().filter(
      (event: { action: string; metadata?: { draftId?: string } }) =>
        event.action === "extraction_draft.accepted"
        && (event.metadata?.draftId === "bulk-draft-lexeme" || event.metadata?.draftId === "bulk-draft-note")
    );
    expect(acceptedEvents).toHaveLength(2);
  });
});
