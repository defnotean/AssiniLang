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

function buildBulkReviewState(extraDrafts: AppState["extractionDrafts"] = []): AppState {
  const baseState = buildTestWorkspaceState();
  const baseLanguage = baseState.languages[0]!;
  return {
    ...baseState,
    languages: [...baseState.languages, { ...baseLanguage, id: OTHER_LANGUAGE_ID, name: "Other Language" }],
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
        id: "bulk-draft-already-accepted",
        kind: "lexeme" as const,
        status: "accepted" as const,
        payload: { ...emptyPayload, form: "nira", gloss: "river" },
        createdAt: "2026-06-10T00:00:03.500Z"
      },
      {
        ...draftBase,
        id: "bulk-draft-other-language",
        languageId: OTHER_LANGUAGE_ID,
        kind: "lexeme" as const,
        payload: { ...emptyPayload, form: "tovi", gloss: "moon" },
        createdAt: "2026-06-10T00:00:04.000Z"
      },
      {
        ...draftBase,
        id: "bulk-draft-corpus",
        kind: "corpus_passage" as const,
        payload: {
          ...emptyPayload,
          textTarget: "mira talo",
          textTranslation: "river walk",
          morphologicalSegmentation: [
            { surface: "mira", lemma: "mira", gloss: "river", features: ["noun"] },
            { surface: "talo", lemma: "talo", gloss: "walk", features: ["verb"] }
          ],
          topicTags: ["imported"]
        },
        createdAt: "2026-06-10T00:00:05.000Z"
      },
      {
        ...draftBase,
        id: "bulk-draft-lexeme-dup-a",
        kind: "lexeme" as const,
        payload: { ...emptyPayload, form: "kela", gloss: "leaf" },
        createdAt: "2026-06-10T00:00:06.000Z"
      },
      {
        ...draftBase,
        id: "bulk-draft-lexeme-dup-b",
        kind: "lexeme" as const,
        payload: { ...emptyPayload, form: "kela", gloss: "leaf" },
        createdAt: "2026-06-10T00:00:07.000Z"
      },
      {
        ...draftBase,
        id: "bulk-draft-incomplete-lexeme",
        kind: "lexeme" as const,
        payload: { ...emptyPayload, form: "  ", gloss: "empty" },
        createdAt: "2026-06-10T00:00:08.000Z"
      },
      ...extraDrafts
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
      url: `/languages/${TEST_LANGUAGE_ID}/extraction-drafts?status=accepted`,
      headers: authHeaders("reviewer-1")
    });
    expect(drafts.statusCode).toBe(200);
    const acceptedIds = drafts.json().map((draft: { id: string }) => draft.id);
    expect(acceptedIds).toContain("bulk-draft-lexeme");
    expect(acceptedIds).toContain("bulk-draft-note");

    // No reviewer internals or answer keys leak into the bulk response.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("expectedAnswers");
    expect(serialized).not.toContain("learnerId");
  });

  it("accepts a corpus passage draft and trims padded draft ids", async () => {
    const app = createServer({ initialState: buildBulkReviewState() });

    const response = await bulkReview(app, {
      action: "accept",
      draftIds: ["  bulk-draft-corpus  "]
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      accepted: 1,
      rejected: 0,
      failed: 0
    });
    expect(body.results).toEqual([
      {
        draftId: "bulk-draft-corpus",
        ok: true,
        committedEntityId: expect.stringMatching(/^ingested-corpus-/)
      }
    ]);
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

  it("reports per-item failures with i18nKeys without failing the whole request", async () => {
    const app = createServer({ initialState: buildBulkReviewState() });

    const response = await bulkReview(app, {
      action: "accept",
      draftIds: [
        "bulk-draft-lexeme",
        "missing-draft",
        "bulk-draft-already-rejected",
        "bulk-draft-already-accepted",
        "bulk-draft-other-language",
        "bulk-draft-incomplete-lexeme"
      ]
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accepted).toBe(1);
    expect(body.failed).toBe(5);

    const byId = new Map<
      string,
      { ok: boolean; error?: string; i18nKey?: string; i18nParams?: Record<string, string | number> }
    >(body.results.map((result: { draftId: string }) => [result.draftId, result]));
    expect(byId.get("bulk-draft-lexeme")?.ok).toBe(true);
    expect(byId.get("missing-draft")).toMatchObject({
      ok: false,
      error: "Extraction draft not found: missing-draft",
      i18nKey: "errors.extractionDraftNotFound"
    });
    expect(byId.get("bulk-draft-already-rejected")).toMatchObject({
      ok: false,
      error: "Extraction draft is already rejected.",
      i18nKey: "errors.extractionDraftAlreadyRejected"
    });
    expect(byId.get("bulk-draft-already-accepted")).toMatchObject({
      ok: false,
      error: "Extraction draft is already accepted.",
      i18nKey: "errors.extractionDraftAlreadyAccepted"
    });
    expect(byId.get("bulk-draft-other-language")).toMatchObject({
      ok: false,
      error: `Extraction draft does not belong to language ${TEST_LANGUAGE_ID}.`,
      i18nKey: "errors.extractionDraftWrongLanguage",
      i18nParams: { languageId: TEST_LANGUAGE_ID }
    });
    expect(byId.get("bulk-draft-incomplete-lexeme")).toMatchObject({
      ok: false,
      error: "Lexeme draft is missing form or gloss.",
      i18nKey: "errors.lexemeDraftMissingFormOrGloss"
    });
  });

  it("fails the second identical lexeme in one accept batch as already existing", async () => {
    const app = createServer({ initialState: buildBulkReviewState() });

    const response = await bulkReview(app, {
      action: "accept",
      draftIds: ["bulk-draft-lexeme-dup-a", "bulk-draft-lexeme-dup-b"]
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accepted).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.results[0]).toMatchObject({ draftId: "bulk-draft-lexeme-dup-a", ok: true });
    expect(body.results[1]).toMatchObject({
      draftId: "bulk-draft-lexeme-dup-b",
      ok: false,
      error: "Lexeme already exists: kela (leaf)",
      i18nKey: "errors.lexemeAlreadyExists",
      i18nParams: { form: "kela", gloss: "leaf" }
    });
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
    expect(badAction.json()).toEqual({
      error: 'Body must include action: "accept" or "reject".',
      i18nKey: "errors.bulkReviewInvalidAction"
    });

    const emptyIds = await bulkReview(app, { action: "accept", draftIds: [] });
    expect(emptyIds.statusCode).toBe(400);
    expect(emptyIds.json()).toEqual({
      error: "Body must include draftIds: a non-empty array of draft id strings.",
      i18nKey: "errors.bulkReviewInvalidDraftIds"
    });

    const missingIds = await bulkReview(app, { action: "accept" });
    expect(missingIds.statusCode).toBe(400);
    expect(missingIds.json().i18nKey).toBe("errors.bulkReviewInvalidDraftIds");

    const nonArrayIds = await bulkReview(app, { action: "accept", draftIds: "bulk-draft-lexeme" });
    expect(nonArrayIds.statusCode).toBe(400);
    expect(nonArrayIds.json().i18nKey).toBe("errors.bulkReviewInvalidDraftIds");

    const nonStringIds = await bulkReview(app, { action: "accept", draftIds: [123] });
    expect(nonStringIds.statusCode).toBe(400);
    expect(nonStringIds.json().i18nKey).toBe("errors.bulkReviewInvalidDraftIds");

    const whitespaceIds = await bulkReview(app, { action: "accept", draftIds: ["  "] });
    expect(whitespaceIds.statusCode).toBe(400);
    expect(whitespaceIds.json().i18nKey).toBe("errors.bulkReviewInvalidDraftIds");

    const tooMany = await bulkReview(app, {
      action: "accept",
      draftIds: Array.from({ length: 51 }, (_, index) => `draft-${index}`)
    });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json()).toEqual({
      error: "Too many draftIds: at most 50 per request.",
      i18nKey: "errors.bulkReviewTooManyDraftIds",
      i18nParams: { max: 50 }
    });
  });

  it("accepts exactly 50 draft ids at the bulk limit", async () => {
    const fiftyDrafts = Array.from({ length: 50 }, (_, index) => ({
      ...draftBase,
      id: `bulk-limit-${index}`,
      kind: "lexeme" as const,
      payload: { ...emptyPayload, form: `form${index}`, gloss: `gloss${index}` },
      createdAt: `2026-06-10T01:${String(index).padStart(2, "0")}:00.000Z`
    }));
    const app = createServer({ initialState: buildBulkReviewState(fiftyDrafts) });

    const response = await bulkReview(app, {
      action: "accept",
      draftIds: fiftyDrafts.map((draft) => draft.id)
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accepted).toBe(50);
    expect(body.failed).toBe(0);
    expect(body.results).toHaveLength(50);
  });

  it("returns 404 for an unknown language", async () => {
    const app = createServer({ initialState: buildBulkReviewState() });

    const response = await bulkReview(
      app,
      { action: "accept", draftIds: ["bulk-draft-lexeme"] },
      { languageId: "nope" }
    );

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Language not found: nope",
      i18nKey: "errors.languageNotFound"
    });
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
    const acceptedEvents = audit
      .json()
      .filter(
        (event: { action: string; metadata?: { draftId?: string } }) =>
          event.action === "extraction_draft.accepted" &&
          (event.metadata?.draftId === "bulk-draft-lexeme" || event.metadata?.draftId === "bulk-draft-note")
      );
    expect(acceptedEvents).toHaveLength(2);
  });
});
