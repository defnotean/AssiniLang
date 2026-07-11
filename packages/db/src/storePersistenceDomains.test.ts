import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptyState, JsonStore } from "./store";
import { buildTestWorkspaceState } from "./testing";
import { parseAppState } from "./schema";
import type { ExtractionDraft, Lexeme, Note, SourceAsset } from "./schema";
import { createTestLanguage, createTestCorpusPassage } from "./storeTestFixtures";

describe("JsonStore persistence and source records", () => {
  it("does not write a db file when updating a missing note", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);

      await expect(store.updateNote("missing-note", { status: "approved" })).rejects.toThrow(
        "Note not found: missing-note"
      );
      await expect(readFile(dbPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("serializes concurrent updates through the latest persisted state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      await store.write(createEmptyState());

      await Promise.all(
        Array.from({ length: 20 }, async (_, index) =>
          store.update((state) => ({
            ...state,
            languages: [
              ...state.languages,
              {
                id: `lang-${index}`,
                name: `Lang ${index}`,
                typology: "isolating",
                description: "Concurrent update test language.",
                orthography: "Latin",
                status: "draft"
              }
            ]
          }))
        )
      );

      const loaded = await store.read();

      expect(loaded.languages.map((language) => language.id).sort()).toEqual(
        Array.from({ length: 20 }, (_, index) => `lang-${index}`).sort()
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.each([
    [
      "missing language",
      {
        id: "source-1",
        languageId: "missing-language",
        kind: "text" as const,
        title: "Notes",
        rawText: "mira",
        status: "pending" as const,
        createdBy: "programmer-1",
        createdAt: "2026-06-06T00:00:00.000Z"
      },
      "Source asset references missing language: missing-language"
    ],
    [
      "failed without error",
      {
        id: "source-1",
        languageId: "avenik",
        kind: "text" as const,
        title: "Notes",
        rawText: "mira",
        status: "failed" as const,
        createdBy: "programmer-1",
        createdAt: "2026-06-06T00:00:00.000Z"
      },
      "Failed source asset requires an error: source-1"
    ],
    [
      "non-failed with error",
      {
        id: "source-1",
        languageId: "avenik",
        kind: "text" as const,
        title: "Notes",
        rawText: "mira",
        status: "pending" as const,
        error: "stale failure",
        createdBy: "programmer-1",
        createdAt: "2026-06-06T00:00:00.000Z"
      },
      "Non-failed source asset must not carry an error: source-1"
    ]
  ])("rejects persisted source assets with %s", (_caseName, asset, errorMessage) => {
    const state = createEmptyState();
    state.languages = [createTestLanguage()];
    state.sourceAssets = [asset];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    [
      "missing source asset",
      {
        id: "draft-1",
        languageId: "avenik",
        sourceAssetId: "missing-source",
        kind: "lexeme" as const,
        payload: { form: "mira", gloss: "river", tags: [], morphologicalSegmentation: [], topicTags: [] },
        confidence: "medium" as const,
        status: "proposed" as const,
        createdAt: "2026-06-06T00:00:00.000Z"
      },
      "Extraction draft references missing source asset: missing-source"
    ],
    [
      "accepted without committed entity",
      {
        id: "draft-1",
        languageId: "avenik",
        sourceAssetId: "source-1",
        kind: "lexeme" as const,
        payload: { form: "mira", gloss: "river", tags: [], morphologicalSegmentation: [], topicTags: [] },
        confidence: "medium" as const,
        status: "accepted" as const,
        createdAt: "2026-06-06T00:00:00.000Z",
        reviewedBy: "reviewer-1",
        reviewedAt: "2026-06-06T00:01:00.000Z"
      },
      "Accepted extraction draft requires committedEntityId: draft-1"
    ],
    [
      "rejected with committed entity",
      {
        id: "draft-1",
        languageId: "avenik",
        sourceAssetId: "source-1",
        kind: "lexeme" as const,
        payload: { form: "mira", gloss: "river", tags: [], morphologicalSegmentation: [], topicTags: [] },
        confidence: "medium" as const,
        status: "rejected" as const,
        createdAt: "2026-06-06T00:00:00.000Z",
        reviewedBy: "reviewer-1",
        reviewedAt: "2026-06-06T00:01:00.000Z",
        committedEntityId: "lex-1"
      },
      "Non-accepted extraction draft must not carry committedEntityId: draft-1"
    ]
  ])("rejects persisted extraction drafts with %s", (_caseName, draft, errorMessage) => {
    const state = createEmptyState();
    state.languages = [createTestLanguage()];
    state.sourceAssets = [
      {
        id: "source-1",
        languageId: "avenik",
        kind: "text",
        title: "Notes",
        rawText: "mira = river",
        status: "processed",
        createdBy: "programmer-1",
        createdAt: "2026-06-06T00:00:00.000Z",
        processedAt: "2026-06-06T00:01:00.000Z"
      }
    ];
    state.extractionDrafts = [draft as ExtractionDraft];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it("rejects accepted extraction drafts whose committed entity belongs to another language", () => {
    const state = createEmptyState();
    state.languages = [
      createTestLanguage(),
      createTestLanguage({ id: "solari", name: "Solari", typology: "isolating" })
    ];
    state.sourceAssets = [
      {
        id: "source-1",
        languageId: "avenik",
        kind: "text",
        title: "Notes",
        rawText: "mira = river",
        status: "processed",
        createdBy: "programmer-1",
        createdAt: "2026-06-06T00:00:00.000Z",
        processedAt: "2026-06-06T00:01:00.000Z"
      }
    ];
    state.lexemes = [
      {
        id: "lex-solari",
        languageId: "solari",
        form: "xara",
        gloss: "stone",
        partOfSpeech: "noun",
        tags: [],
        sourceAssetIds: []
      } satisfies Lexeme
    ];
    state.extractionDrafts = [
      {
        id: "draft-1",
        languageId: "avenik",
        sourceAssetId: "source-1",
        kind: "lexeme",
        payload: { form: "mira", gloss: "river", tags: [], morphologicalSegmentation: [], topicTags: [] },
        confidence: "medium",
        status: "accepted",
        createdAt: "2026-06-06T00:00:00.000Z",
        reviewedBy: "reviewer-1",
        reviewedAt: "2026-06-06T00:01:00.000Z",
        committedEntityId: "lex-solari"
      } satisfies ExtractionDraft
    ];

    expect(() => parseAppState(state)).toThrow(
      "Extraction draft committedEntityId lex-solari belongs to language solari, not avenik"
    );
  });

  it("rejects lexemes that reference missing or cross-language source assets", () => {
    const state = createEmptyState();
    state.languages = [
      createTestLanguage(),
      createTestLanguage({ id: "solari", name: "Solari", typology: "isolating" })
    ];
    state.sourceAssets = [
      {
        id: "source-solari",
        languageId: "solari",
        kind: "text",
        title: "Other language notes",
        rawText: "x",
        status: "processed",
        createdBy: "programmer-1",
        createdAt: "2026-06-06T00:00:00.000Z",
        processedAt: "2026-06-06T00:01:00.000Z"
      } satisfies SourceAsset
    ];
    state.lexemes = [
      {
        id: "lex-1",
        languageId: "avenik",
        form: "mira",
        gloss: "river",
        partOfSpeech: "noun",
        tags: [],
        sourceAssetIds: ["source-solari"]
      } satisfies Lexeme
    ];

    expect(() => parseAppState(state)).toThrow(
      "Lexeme source asset source-solari belongs to language solari, not avenik"
    );
  });

  it("rejects corpus passages that reference missing source assets", () => {
    const state = createEmptyState();
    state.languages = [createTestLanguage()];
    state.corpus = [createTestCorpusPassage({ sourceAssetId: "missing-source" })];

    expect(() => parseAppState(state)).toThrow("Corpus passage references missing source asset: missing-source");
  });

  it("round-trips a source asset with extraction warnings through the store", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const state = createEmptyState();
      state.languages = [createTestLanguage()];
      state.sourceAssets = [
        {
          id: "source-asset-warned",
          languageId: "avenik",
          kind: "text",
          title: "Warned source",
          rawText: "mira talo",
          status: "processed",
          warnings: [
            "No model configured (deterministic mode); used offline heuristic parsing.",
            "Model output was not valid extraction JSON; fell back to offline heuristics."
          ],
          createdBy: "programmer-1",
          createdAt: "2026-06-06T00:00:00.000Z",
          processedAt: "2026-06-06T00:01:00.000Z"
        }
      ];

      await store.write(state);
      const loaded = await store.read();
      const raw = JSON.parse(await readFile(dbPath, "utf8"));

      expect(loaded.sourceAssets).toHaveLength(1);
      expect(loaded.sourceAssets[0]?.warnings).toEqual([
        "No model configured (deterministic mode); used offline heuristic parsing.",
        "Model output was not valid extraction JSON; fell back to offline heuristics."
      ]);
      expect(raw.sourceAssets[0]?.warnings).toHaveLength(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("parses a source asset without warnings for back-compat", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const state = createEmptyState();
      state.languages = [createTestLanguage()];
      state.sourceAssets = [
        {
          id: "source-asset-plain",
          languageId: "avenik",
          kind: "text",
          title: "Plain source",
          rawText: "mira talo",
          status: "pending",
          createdBy: "programmer-1",
          createdAt: "2026-06-06T00:00:00.000Z"
        }
      ];

      await store.write(state);
      const loaded = await store.read();

      expect(loaded.sourceAssets).toHaveLength(1);
      expect(loaded.sourceAssets[0]?.warnings).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ["JSON", "local-db.json"],
    ["SQLite", "local-db.sqlite"]
  ])("round-trips source asset processing metadata through the %s store", async (_backend, fileName) => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, fileName);

    try {
      const store = new JsonStore(dbPath);
      const state = createEmptyState();
      state.languages = [createTestLanguage()];
      state.sourceAssets = [
        {
          id: "source-asset-processing",
          languageId: "avenik",
          kind: "text",
          title: "Retried source",
          rawText: "mira talo",
          status: "failed",
          processingStartedAt: "2026-06-06T00:00:30.000Z",
          processingHeartbeatAt: "2026-06-06T00:00:45.000Z",
          processingAttempts: 2,
          error: "Processing interrupted by a server restart. Re-run processing.",
          createdBy: "programmer-1",
          createdAt: "2026-06-06T00:00:00.000Z",
          processedAt: "2026-06-06T00:01:00.000Z"
        }
      ];

      await store.write(state);
      const loaded = await store.read();

      expect(loaded.sourceAssets[0]).toMatchObject({
        processingStartedAt: "2026-06-06T00:00:30.000Z",
        processingHeartbeatAt: "2026-06-06T00:00:45.000Z",
        processingAttempts: 2
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("parses a source asset without processing metadata for back-compat", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const state = createEmptyState();
      state.languages = [createTestLanguage()];
      state.sourceAssets = [
        {
          id: "source-asset-legacy",
          languageId: "avenik",
          kind: "text",
          title: "Legacy source",
          rawText: "mira talo",
          status: "pending",
          createdBy: "programmer-1",
          createdAt: "2026-06-06T00:00:00.000Z"
        }
      ];

      await store.write(state);
      const loaded = await store.read();

      expect(loaded.sourceAssets[0]?.processingStartedAt).toBeUndefined();
      expect(loaded.sourceAssets[0]?.processingHeartbeatAt).toBeUndefined();
      expect(loaded.sourceAssets[0]?.processingAttempts).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("round-trips state in SQLite mode when the path does not end in .json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-sqlite-"));
    const dbPath = join(dir, "local-db.sqlite");

    try {
      const store = new JsonStore(dbPath);
      const state = buildTestWorkspaceState();

      await store.write(state);
      const loaded = await store.read();

      expect(loaded.languages).toHaveLength(state.languages.length);
      expect(loaded.languages[0]?.id).toBe(state.languages[0]?.id);
      expect(loaded.corpus).toHaveLength(state.corpus.length);
      expect(loaded.corpusAnswerKeys).toHaveLength(state.corpusAnswerKeys?.length ?? 0);
      expect(loaded.noteAnswerKeys).toHaveLength(state.noteAnswerKeys.length);
      expect(loaded.notes).toHaveLength(state.notes.length);
      expect(loaded.exercises).toHaveLength(state.exercises.length);
      expect(loaded.reviewPolicies).toHaveLength(state.reviewPolicies.length);
      expect(loaded.users).toHaveLength(state.users.length);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
