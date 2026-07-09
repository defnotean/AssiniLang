import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID, type AppState, type Lexeme } from "@assini/db";
import { createServer } from "./server.js";
import { parseAcceptDraftBody } from "./routes/extractionDrafts.js";

const SOURCE_ASSET_ID = "source-seg-conflict";
const emptyPayload = { tags: [], morphologicalSegmentation: [], topicTags: [] };

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

function lexeme(form: string, gloss: string, tags: string[] = []): Lexeme {
  return {
    id: `lex-${form}`,
    languageId: TEST_LANGUAGE_ID,
    form,
    gloss,
    partOfSpeech: "unknown",
    tags,
    sourceAssetIds: [],
    createdBy: "tester",
    createdAt: "2026-06-10T00:00:00.000Z"
  };
}

function buildConflictState(): AppState {
  const baseState = buildTestWorkspaceState();
  return {
    ...baseState,
    lexemes: [
      lexeme("mira", "river", ["place"]),
      lexeme("talo", "walk", ["motion"]),
      lexeme("-na", "first person singular", ["person"])
    ],
    sourceAssets: [
      ...baseState.sourceAssets,
      {
        id: SOURCE_ASSET_ID,
        languageId: TEST_LANGUAGE_ID,
        kind: "text" as const,
        title: "Segmentation conflict source",
        rawText: "talo-na mira = I walk by the river.",
        status: "processed" as const,
        createdBy: "reviewer-1",
        createdAt: "2026-06-12T00:00:00.000Z"
      }
    ],
    extractionDrafts: [
      {
        id: "draft-seg-conflict",
        languageId: TEST_LANGUAGE_ID,
        sourceAssetId: SOURCE_ASSET_ID,
        kind: "corpus_passage" as const,
        payload: {
          ...emptyPayload,
          textTarget: "talo-na mira",
          textTranslation: "I walk by the river.",
          morphologicalSegmentation: [
            { surface: "talo", lemma: "talo", gloss: "run", features: ["verb"] },
            { surface: "-na", lemma: "-na", gloss: "first person singular", features: ["person"] },
            { surface: "mira", lemma: "mira", gloss: "lake", features: ["noun"] }
          ]
        },
        confidence: "medium" as const,
        status: "proposed" as const,
        createdAt: "2026-06-12T00:00:01.000Z"
      }
    ]
  };
}

describe("parseAcceptDraftBody", () => {
  it("accepts an empty body as keep-draft", () => {
    expect(parseAcceptDraftBody(undefined)).toEqual({ ok: true, options: {} });
    expect(parseAcceptDraftBody(null)).toEqual({ ok: true, options: {} });
  });

  it("parses preferLexiconSegmentation", () => {
    expect(parseAcceptDraftBody({ preferLexiconSegmentation: true })).toEqual({
      ok: true,
      options: { preferLexiconSegmentation: true }
    });
  });

  it("rejects preferLexiconSegmentation combined with morphologicalSegmentation", () => {
    const result = parseAcceptDraftBody({
      preferLexiconSegmentation: true,
      morphologicalSegmentation: [
        { surface: "mira", lemma: "mira", gloss: "river", features: [] }
      ]
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.i18nKey).toBe("errors.invalidExtractionDraftAcceptBody");
    }
  });
});

describe("segmentation conflict resolution on accept", () => {
  it("lists lexiconSegmentationProposal alongside segmentation_conflict grounding", async () => {
    const app = createServer({ initialState: buildConflictState() });

    const response = await app.inject({
      method: "GET",
      url: `/languages/${TEST_LANGUAGE_ID}/extraction-drafts?status=proposed`,
      headers: authHeaders("reviewer-1")
    });

    expect(response.statusCode).toBe(200);
    const drafts = response.json() as Array<{
      id: string;
      grounding?: Array<{ kind: string }>;
      lexiconSegmentationProposal?: Array<{ surface: string; gloss: string }>;
    }>;
    const draft = drafts.find((item) => item.id === "draft-seg-conflict");
    expect(draft?.grounding?.some((flag) => flag.kind === "segmentation_conflict")).toBe(true);
    expect(draft?.lexiconSegmentationProposal).toEqual([
      { surface: "talo", lemma: "talo", gloss: "walk", features: ["motion"] },
      { surface: "-na", lemma: "-na", gloss: "first person singular", features: ["person"] },
      { surface: "mira", lemma: "mira", gloss: "river", features: ["place"] }
    ]);
  });

  it("keeps draft segmentation when accept has no override body", async () => {
    const app = createServer({ initialState: buildConflictState() });

    const accept = await app.inject({
      method: "POST",
      url: "/extraction-drafts/draft-seg-conflict/accept",
      headers: authHeaders("reviewer-1")
    });

    expect(accept.statusCode).toBe(200);
    const body = accept.json() as {
      entity: { morphologicalSegmentation: Array<{ surface: string; gloss: string }> };
    };
    expect(body.entity.morphologicalSegmentation).toEqual([
      { surface: "talo", lemma: "talo", gloss: "run", features: ["verb"] },
      { surface: "-na", lemma: "-na", gloss: "first person singular", features: ["person"] },
      { surface: "mira", lemma: "mira", gloss: "lake", features: ["noun"] }
    ]);
  });

  it("commits lexicon proposal when preferLexiconSegmentation is true", async () => {
    const app = createServer({ initialState: buildConflictState() });

    const accept = await app.inject({
      method: "POST",
      url: "/extraction-drafts/draft-seg-conflict/accept",
      headers: { ...authHeaders("reviewer-1"), "content-type": "application/json" },
      payload: { preferLexiconSegmentation: true }
    });

    expect(accept.statusCode).toBe(200);
    const body = accept.json() as {
      entity: { morphologicalSegmentation: Array<{ surface: string; gloss: string }> };
    };
    expect(body.entity.morphologicalSegmentation).toEqual([
      { surface: "talo", lemma: "talo", gloss: "walk", features: ["motion"] },
      { surface: "-na", lemma: "-na", gloss: "first person singular", features: ["person"] },
      { surface: "mira", lemma: "mira", gloss: "river", features: ["place"] }
    ]);
  });

  it("commits a reviewer-edited morphologicalSegmentation override", async () => {
    const app = createServer({ initialState: buildConflictState() });
    const edited = [
      { surface: "talo", lemma: "talo", gloss: "walk", features: ["verb"] },
      { surface: "-na", lemma: "-na", gloss: "first person singular", features: ["person"] },
      { surface: "mira", lemma: "mira", gloss: "stream", features: ["noun"] }
    ];

    const accept = await app.inject({
      method: "POST",
      url: "/extraction-drafts/draft-seg-conflict/accept",
      headers: { ...authHeaders("reviewer-1"), "content-type": "application/json" },
      payload: { morphologicalSegmentation: edited }
    });

    expect(accept.statusCode).toBe(200);
    const body = accept.json() as {
      entity: { morphologicalSegmentation: Array<{ surface: string; gloss: string }> };
    };
    expect(body.entity.morphologicalSegmentation).toEqual(edited);
  });

  it("rejects segmentation overrides on lexeme drafts", async () => {
    const base = buildConflictState();
    const app = createServer({
      initialState: {
        ...base,
        extractionDrafts: [
          {
            id: "draft-lexeme",
            languageId: TEST_LANGUAGE_ID,
            sourceAssetId: SOURCE_ASSET_ID,
            kind: "lexeme" as const,
            payload: { ...emptyPayload, form: "kora", gloss: "stone" },
            confidence: "medium" as const,
            status: "proposed" as const,
            createdAt: "2026-06-12T00:00:02.000Z"
          }
        ]
      }
    });

    const accept = await app.inject({
      method: "POST",
      url: "/extraction-drafts/draft-lexeme/accept",
      headers: { ...authHeaders("reviewer-1"), "content-type": "application/json" },
      payload: { preferLexiconSegmentation: true }
    });

    expect(accept.statusCode).toBe(400);
    expect(accept.json()).toMatchObject({
      i18nKey: "errors.invalidExtractionDraftAcceptBody"
    });
  });
});
