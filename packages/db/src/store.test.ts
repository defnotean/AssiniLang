import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptyState, JsonStore } from "./store";
import type { Language } from "./schema";
import { createTestLanguage, createTestCorpusPassage } from "./storeTestFixtures";

describe("JsonStore migrations and corruption", () => {
  it("writes and reads a seeded state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const state = createEmptyState();
      state.languages.push({
        id: "test-lang",
        name: "Test Lang",
        typology: "isolating",
        description: "Test language.",
        orthography: "Latin test alphabet",
        status: "draft"
      });

      await store.write(state);
      const loaded = await store.read();
      const raw = JSON.parse(await readFile(dbPath, "utf8"));

      expect(loaded.languages[0]?.id).toBe("test-lang");
      expect(raw.schemaVersion).toBe(9);
      expect(loaded.auditEvents).toEqual([]);
      expect(loaded.reviewPolicies).toEqual([]);
      expect(loaded.reviewApprovals).toEqual([]);
      expect(loaded.reviewDispositions).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("migrates legacy v1 state without note answer keys", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const legacyState = createEmptyState();
      legacyState.languages.push(createTestLanguage({ id: "legacy-language", name: "Legacy Language" }));
      legacyState.corpus.push(
        createTestCorpusPassage({
          id: "legacy-corpus",
          languageId: "legacy-language"
        })
      );
      legacyState.notes.push({
        id: "legacy-note",
        languageId: "legacy-language",
        topic: "legacy/topic",
        explanation: "Legacy answer key text.",
        examples: [],
        evidencePassageIds: ["legacy-corpus"],
        evidenceCount: 1,
        confidence: "medium",
        status: "draft",
        reviewer: {
          lastReviewedBy: null,
          lastReviewedAt: null,
          comments: []
        },
        dialectScope: "legacy",
        editHistory: []
      });

      const { noteAnswerKeys: _removed, ...legacyWithoutAnswerKeys } = legacyState;
      await writeFile(dbPath, `${JSON.stringify({ ...legacyWithoutAnswerKeys, schemaVersion: 1 })}\n`, "utf8");

      const loaded = await store.read();

      expect(loaded.schemaVersion).toBe(9);
      expect(loaded.notes).toHaveLength(1);
      expect(loaded.noteAnswerKeys).toHaveLength(1);
      expect(loaded.exerciseSubmissions).toEqual([]);
      expect(loaded.auditEvents).toEqual([]);
      expect(loaded.reviewPolicies).toEqual([]);
      expect(loaded.reviewApprovals).toEqual([]);
      expect(loaded.reviewDispositions).toEqual([]);
      expect(loaded.noteAnswerKeys[0]).toMatchObject({
        id: "legacy-note",
        topic: "legacy/topic",
        explanation: "Legacy answer key text.",
        status: "approved"
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("migrates v2 state with answer keys to empty exercise submissions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const v2State = createEmptyState();
      const { exerciseSubmissions: _removed, ...v2WithoutSubmissions } = v2State;
      await writeFile(dbPath, `${JSON.stringify({ ...v2WithoutSubmissions, schemaVersion: 2 })}\n`, "utf8");

      const loaded = await store.read();

      expect(loaded.schemaVersion).toBe(9);
      expect(loaded.exerciseSubmissions).toEqual([]);
      expect(loaded.auditEvents).toEqual([]);
      expect(loaded.reviewPolicies).toEqual([]);
      expect(loaded.reviewApprovals).toEqual([]);
      expect(loaded.reviewDispositions).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reports the database path when local JSON is corrupted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      await writeFile(dbPath, "{ not valid json", "utf8");

      await expect(store.read()).rejects.toThrow(`Failed to read local database at ${dbPath}:`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("migrates v4 state into empty audit and review-policy ledgers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const v4State = createEmptyState();
      const { auditEvents: _removed, ...v4WithoutAuditEvents } = v4State;
      await writeFile(dbPath, `${JSON.stringify({ ...v4WithoutAuditEvents, schemaVersion: 4 })}\n`, "utf8");

      const loaded = await store.read();

      expect(loaded.schemaVersion).toBe(9);
      expect(loaded.auditEvents).toEqual([]);
      expect(loaded.reviewPolicies).toEqual([]);
      expect(loaded.reviewApprovals).toEqual([]);
      expect(loaded.reviewDispositions).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("migrates v5 state into empty review-policy ledgers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const v5State = createEmptyState();
      const { reviewPolicies: _policies, reviewApprovals: _approvals, ...v5WithoutReviewPolicy } = v5State;
      await writeFile(dbPath, `${JSON.stringify({ ...v5WithoutReviewPolicy, schemaVersion: 5 })}\n`, "utf8");

      const loaded = await store.read();

      expect(loaded.schemaVersion).toBe(9);
      expect(loaded.reviewPolicies).toEqual([]);
      expect(loaded.reviewApprovals).toEqual([]);
      expect(loaded.reviewDispositions).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("migrates v6 state into an empty review disposition ledger", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const v6State = createEmptyState();
      const { reviewDispositions: _dispositions, ...v6WithoutDispositionLedger } = v6State;
      await writeFile(dbPath, `${JSON.stringify({ ...v6WithoutDispositionLedger, schemaVersion: 6 })}\n`, "utf8");

      const loaded = await store.read();

      expect(loaded.schemaVersion).toBe(9);
      expect(loaded.reviewDispositions).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("migrates v8 state without changing persisted records", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const v8State = createEmptyState();
      v8State.languages = [createTestLanguage()];
      v8State.sourceAssets = [
        {
          id: "source-v8-processing",
          languageId: "avenik",
          kind: "text",
          title: "Legacy processing source",
          rawText: "mira talo",
          status: "failed",
          processingStartedAt: "2026-06-06T00:00:30.000Z",
          processingHeartbeatAt: "2026-06-06T00:00:45.000Z",
          processingAttempts: 2,
          error: "Processing interrupted by a server restart. Re-run processing.",
          createdBy: "programmer-1",
          createdAt: "2026-06-06T00:00:00.000Z"
        }
      ];
      await writeFile(dbPath, `${JSON.stringify({ ...v8State, schemaVersion: 8 })}\n`, "utf8");

      const loaded = await store.read();

      expect(loaded.schemaVersion).toBe(9);
      expect(loaded.sourceAssets[0]).toMatchObject({
        id: "source-v8-processing",
        processingStartedAt: "2026-06-06T00:00:30.000Z",
        processingHeartbeatAt: "2026-06-06T00:00:45.000Z",
        processingAttempts: 2
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
