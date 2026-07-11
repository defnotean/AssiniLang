import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildTestWorkspaceState, JsonStore, TEST_LANGUAGE_ID } from "@assini/db";
import type { LlmProvider } from "./llmProvider.js";
import { createServer } from "./server.js";

describe("source processing integration", () => {
  function authHeaders(userId: string) {
    return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
  }

  function restoreEnv(key: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  describe("background source processing", () => {
    async function registerWordlistSource(app: ReturnType<typeof createServer>, title: string): Promise<string> {
      const registered = await app.inject({
        method: "POST",
        url: `/languages/${TEST_LANGUAGE_ID}/sources`,
        headers: authHeaders("reviewer-1"),
        payload: { kind: "wordlist", title, rawText: "mira = river\nsaku = child" }
      });
      expect(registered.statusCode).toBe(201);
      return registered.json().id as string;
    }

    async function fetchStoredSource(app: ReturnType<typeof createServer>, sourceId: string) {
      const sources = await app.inject({
        method: "GET",
        url: `/languages/${TEST_LANGUAGE_ID}/sources`,
        headers: authHeaders("reviewer-1")
      });
      expect(sources.statusCode).toBe(200);
      return sources.json().find((item: { id: string }) => item.id === sourceId);
    }

    it("imports Obsidian Markdown files as pending text sources", async () => {
      const previousVaultRoots = process.env.ASSINI_OBSIDIAN_VAULT_ROOTS;
      const app = createServer({ initialState: buildTestWorkspaceState() });
      const vaultPath = await mkdtemp(join(tmpdir(), "assini-vault-"));
      process.env.ASSINI_OBSIDIAN_VAULT_ROOTS = vaultPath;
      await writeFile(
        join(vaultPath, "Story.md"),
        "---\ntags: [river]\n---\n[[mira|river]] water note\n![[field-image.png]]",
        "utf8"
      );
      await writeFile(join(vaultPath, "Empty.md"), "---\ntags: [empty]\n---\n", "utf8");

      try {
        const response = await app.inject({
          method: "POST",
          url: `/languages/${TEST_LANGUAGE_ID}/sources/obsidian-vault`,
          headers: authHeaders("reviewer-1"),
          payload: {
            vaultPath,
            includeSubfolders: true,
            maxFiles: 10
          }
        });

        expect(response.statusCode).toBe(201);
        expect(response.json().summary).toMatchObject({ scanned: 2, imported: 1, skipped: 1 });
        expect(response.json().imported[0]).toMatchObject({
          kind: "text",
          title: "Story",
          status: "pending"
        });
        expect(response.json().imported[0]).not.toHaveProperty("rawText");
        expect(response.body).not.toContain("river water note");
        expect(response.json().skipped[0]).toMatchObject({ path: "Empty.md" });

        const audit = await app.inject({
          method: "GET",
          url: "/audit/events",
          headers: authHeaders("programmer-1")
        });
        expect(audit.statusCode).toBe(200);
        const importEvent = audit
          .json()
          .find((event: { action: string }) => event.action === "source_asset.obsidian_vault_imported");
        expect(importEvent).toBeDefined();
        expect(importEvent.summary).toContain(basename(vaultPath));
        expect(importEvent.summary).not.toContain(vaultPath);
        expect(importEvent.metadata).toMatchObject({ vaultName: basename(vaultPath), imported: 1, skipped: 1 });
        expect(importEvent.metadata).not.toHaveProperty("vaultPath");

        const sources = await app.inject({
          method: "GET",
          url: `/languages/${TEST_LANGUAGE_ID}/sources`,
          headers: authHeaders("reviewer-1")
        });
        expect(sources.statusCode).toBe(200);
        expect(sources.json().some((source: { title: string }) => source.title === "Story")).toBe(true);
      } finally {
        restoreEnv("ASSINI_OBSIDIAN_VAULT_ROOTS", previousVaultRoots);
      }
    });

    it("rejects Obsidian vault paths outside ASSINI_OBSIDIAN_VAULT_ROOTS with 400", async () => {
      const previousVaultRoots = process.env.ASSINI_OBSIDIAN_VAULT_ROOTS;
      const allowedRoot = await mkdtemp(join(tmpdir(), "assini-allowed-"));
      const outsideVault = await mkdtemp(join(tmpdir(), "assini-outside-"));
      process.env.ASSINI_OBSIDIAN_VAULT_ROOTS = allowedRoot;
      await writeFile(join(outsideVault, "Secret.md"), "should not import", "utf8");

      try {
        const app = createServer({ initialState: buildTestWorkspaceState() });
        const response = await app.inject({
          method: "POST",
          url: `/languages/${TEST_LANGUAGE_ID}/sources/obsidian-vault`,
          headers: authHeaders("reviewer-1"),
          payload: {
            vaultPath: outsideVault,
            includeSubfolders: true,
            maxFiles: 10
          }
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
          error: expect.stringMatching(/ASSINI_OBSIDIAN_VAULT_ROOTS allowlist/),
          i18nKey: "ingest.errorVaultOutsideAllowlist"
        });
      } finally {
        restoreEnv("ASSINI_OBSIDIAN_VAULT_ROOTS", previousVaultRoots);
      }
    });

    it("rejects Obsidian vault import when ASSINI_OBSIDIAN_VAULT_ROOTS is unset", async () => {
      const previousVaultRoots = process.env.ASSINI_OBSIDIAN_VAULT_ROOTS;
      delete process.env.ASSINI_OBSIDIAN_VAULT_ROOTS;
      const vaultPath = await mkdtemp(join(tmpdir(), "assini-vault-"));
      await writeFile(join(vaultPath, "Note.md"), "note text", "utf8");

      try {
        const app = createServer({ initialState: buildTestWorkspaceState() });
        const response = await app.inject({
          method: "POST",
          url: `/languages/${TEST_LANGUAGE_ID}/sources/obsidian-vault`,
          headers: authHeaders("reviewer-1"),
          payload: {
            vaultPath,
            includeSubfolders: true,
            maxFiles: 10
          }
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
          error: expect.stringMatching(/ASSINI_OBSIDIAN_VAULT_ROOTS is set/),
          i18nKey: "ingest.errorVaultRootsUnset"
        });
      } finally {
        restoreEnv("ASSINI_OBSIDIAN_VAULT_ROOTS", previousVaultRoots);
      }
    });

    it("accepts async processing with 202, then persists drafts and the processed status", async () => {
      const app = createServer({ initialState: buildTestWorkspaceState() });
      const sourceId = await registerWordlistSource(app, "Background word list");

      const accepted = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1"),
        payload: { async: true }
      });

      expect(accepted.statusCode).toBe(202);
      expect(accepted.json()).toMatchObject({
        asset: { id: sourceId, status: "processing" },
        drafts: [],
        warnings: []
      });

      await vi.waitFor(async () => {
        const stored = await fetchStoredSource(app, sourceId);
        expect(stored.status).toBe("processed");
      });

      const stored = await fetchStoredSource(app, sourceId);
      expect(stored.error).toBeUndefined();
      expect(typeof stored.processedAt).toBe("string");

      const drafts = await app.inject({
        method: "GET",
        url: `/languages/${TEST_LANGUAGE_ID}/extraction-drafts?status=proposed`,
        headers: authHeaders("reviewer-1")
      });
      expect(drafts.statusCode).toBe(200);
      const sourceDrafts = drafts.json().filter((draft: { sourceAssetId: string }) => draft.sourceAssetId === sourceId);
      expect(sourceDrafts.length).toBeGreaterThanOrEqual(2);

      const audit = await app.inject({
        method: "GET",
        url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
        headers: authHeaders("programmer-1")
      });
      expect(audit.statusCode).toBe(200);
      const actions = audit.json().map((event: { action: string }) => event.action);
      expect(actions).toContain("source_asset.process_started");
      expect(actions).toContain("source_asset.processed");
    });

    it("records a failed status and sanitized error when background extraction throws", async () => {
      const baseState = buildTestWorkspaceState();
      const documentAssetId = "source-async-unsupported-document";
      const app = createServer({
        initialState: {
          ...baseState,
          sourceAssets: [
            ...baseState.sourceAssets,
            {
              id: documentAssetId,
              languageId: TEST_LANGUAGE_ID,
              kind: "document" as const,
              title: "Legacy ebook",
              originalName: "notes.epub",
              filePath: "assets/testlang/notes.epub",
              status: "pending" as const,
              createdBy: "reviewer-1",
              createdAt: "2026-06-09T00:00:00.000Z"
            }
          ]
        }
      });

      const accepted = await app.inject({
        method: "POST",
        url: `/sources/${documentAssetId}/process`,
        headers: authHeaders("reviewer-1"),
        payload: { async: true }
      });
      expect(accepted.statusCode).toBe(202);
      expect(accepted.json().asset.status).toBe("processing");

      await vi.waitFor(async () => {
        const stored = await fetchStoredSource(app, documentAssetId);
        expect(stored.status).toBe("failed");
      });

      const stored = await fetchStoredSource(app, documentAssetId);
      expect(stored.error).toMatch(/not supported yet/);

      const audit = await app.inject({
        method: "GET",
        url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
        headers: authHeaders("programmer-1")
      });
      expect(audit.statusCode).toBe(200);
      const actions = audit.json().map((event: { action: string }) => event.action);
      expect(actions).toContain("source_asset.process_failed");
    });

    it("returns 409 in both modes while a source is already processing", async () => {
      let release: (value: string) => void = () => {};
      const blocked = new Promise<string>((resolve) => {
        release = resolve;
      });
      const llmProvider: LlmProvider = {
        name: "blocking-provider",
        async generateAssistantMessage() {
          return { content: "unused", warnings: [] };
        },
        async completeChat() {
          return blocked;
        }
      };
      const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });
      const sourceId = await registerWordlistSource(app, "Slow word list");

      const accepted = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1"),
        payload: { async: true }
      });
      expect(accepted.statusCode).toBe(202);

      const conflictAsync = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1"),
        payload: { async: true }
      });
      expect(conflictAsync.statusCode).toBe(409);
      expect(conflictAsync.json()).toMatchObject({
        error: expect.stringContaining("already processing"),
        i18nKey: "ingest.sourceAlreadyProcessing"
      });

      const conflictSync = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });
      expect(conflictSync.statusCode).toBe(409);
      expect(conflictSync.json()).toMatchObject({
        error: expect.stringContaining("already processing"),
        i18nKey: "ingest.sourceAlreadyProcessing"
      });

      release(JSON.stringify({ summary: "Done.", lexemes: [{ form: "mira", gloss: "river" }] }));

      await vi.waitFor(async () => {
        const stored = await fetchStoredSource(app, sourceId);
        expect(stored.status).toBe("processed");
      });
    });

    it("cancels a pending queued process job and marks the asset failed", async () => {
      let releaseActive: (value: string) => void = () => {};
      const blocked = new Promise<string>((resolve) => {
        releaseActive = resolve;
      });
      const llmProvider: LlmProvider = {
        name: "blocking-provider",
        async generateAssistantMessage() {
          return { content: "unused", warnings: [] };
        },
        async completeChat() {
          return blocked;
        }
      };
      const app = createServer({
        initialState: buildTestWorkspaceState(),
        llmProvider,
        concurrency: 1
      });
      const activeId = await registerWordlistSource(app, "Active blocker");
      const pendingId = await registerWordlistSource(app, "Queued for cancel");

      const activeAccepted = await app.inject({
        method: "POST",
        url: `/sources/${activeId}/process`,
        headers: authHeaders("reviewer-1"),
        payload: { async: true }
      });
      expect(activeAccepted.statusCode).toBe(202);

      const pendingAccepted = await app.inject({
        method: "POST",
        url: `/sources/${pendingId}/process`,
        headers: authHeaders("reviewer-1"),
        payload: { async: true }
      });
      expect(pendingAccepted.statusCode).toBe(202);
      expect(pendingAccepted.json().asset).toMatchObject({
        id: pendingId,
        status: "processing",
        processingAttempts: 1,
        processingQueuePhase: "queued"
      });
      expect(activeAccepted.json().asset).toMatchObject({
        id: activeId,
        status: "processing",
        processingQueuePhase: "active"
      });

      const listed = await app.inject({
        method: "GET",
        url: `/languages/${TEST_LANGUAGE_ID}/sources`,
        headers: authHeaders("reviewer-1")
      });
      expect(listed.statusCode).toBe(200);
      const listedAssets = listed.json() as Array<{ id: string; processingQueuePhase?: string }>;
      expect(listedAssets.find((asset) => asset.id === pendingId)?.processingQueuePhase).toBe("queued");
      expect(listedAssets.find((asset) => asset.id === activeId)?.processingQueuePhase).toBe("active");

      const cancelled = await app.inject({
        method: "POST",
        url: `/sources/${pendingId}/cancel-processing`,
        headers: authHeaders("reviewer-1")
      });
      expect(cancelled.statusCode).toBe(200);
      expect(cancelled.json().asset).toMatchObject({
        id: pendingId,
        status: "failed",
        error: "Queued source processing was cancelled. Use Retry when ready.",
        processingAttempts: 1
      });
      expect(cancelled.json().asset.processingStartedAt).toBeUndefined();
      expect(cancelled.json().asset.processingHeartbeatAt).toBeUndefined();

      const storedPending = await fetchStoredSource(app, pendingId);
      expect(storedPending).toMatchObject({
        status: "failed",
        error: "Queued source processing was cancelled. Use Retry when ready.",
        processingAttempts: 1
      });
      expect(storedPending.processingQueuePhase).toBeUndefined();

      const audit = await app.inject({
        method: "GET",
        url: "/audit/events",
        headers: authHeaders("admin-1")
      });
      expect(audit.statusCode).toBe(200);
      expect(
        audit
          .json()
          .some(
            (event: { action: string; entityId: string }) =>
              event.action === "source_asset.process_cancelled" && event.entityId === pendingId
          )
      ).toBe(true);

      const activeCancel = await app.inject({
        method: "POST",
        url: `/sources/${activeId}/cancel-processing`,
        headers: authHeaders("reviewer-1")
      });
      expect(activeCancel.statusCode).toBe(409);
      expect(activeCancel.json()).toEqual({
        error: "Source processing is already running and cannot be cancelled.",
        i18nKey: "ingest.sourceProcessingCancelActive"
      });

      const notQueued = await app.inject({
        method: "POST",
        url: `/sources/${pendingId}/cancel-processing`,
        headers: authHeaders("reviewer-1")
      });
      expect(notQueued.statusCode).toBe(409);
      expect(notQueued.json()).toEqual({
        error: "Source is not queued for processing.",
        i18nKey: "ingest.sourceProcessingNotQueued"
      });

      releaseActive(JSON.stringify({ summary: "Done.", lexemes: [{ form: "mira", gloss: "river" }] }));
      await vi.waitFor(async () => {
        const stored = await fetchStoredSource(app, activeId);
        expect(stored.status).toBe("processed");
      });

      const stillFailed = await fetchStoredSource(app, pendingId);
      expect(stillFailed.status).toBe("failed");
    });

    it("keeps the synchronous response shape when async is not requested", async () => {
      const app = createServer({ initialState: buildTestWorkspaceState() });
      const sourceId = await registerWordlistSource(app, "Synchronous word list");

      const processed = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });

      expect(processed.statusCode).toBe(200);
      expect(processed.json().asset).toMatchObject({ id: sourceId, status: "processed" });
      expect(processed.json().drafts.length).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(processed.json().warnings)).toBe(true);
    });

    it("clears processingAttempts and in-flight markers after successful completion", async () => {
      const app = createServer({ initialState: buildTestWorkspaceState() });
      const sourceId = await registerWordlistSource(app, "Attempt-tracked word list");

      const first = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });
      expect(first.statusCode).toBe(200);
      expect(first.json().asset).toMatchObject({
        id: sourceId,
        status: "processed"
      });
      // Success clears the attempt counter and in-flight markers so healthy reprocessing is not capped.
      expect(first.json().asset.processingAttempts).toBeUndefined();
      expect(first.json().asset.processingStartedAt).toBeUndefined();
      expect(first.json().asset.processingHeartbeatAt).toBeUndefined();

      const second = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });
      expect(second.statusCode).toBe(200);
      expect(second.json().asset).toMatchObject({
        id: sourceId,
        status: "processed"
      });
      expect(second.json().asset.processingAttempts).toBeUndefined();
      expect(second.json().asset.processingStartedAt).toBeUndefined();
      expect(second.json().asset.processingHeartbeatAt).toBeUndefined();
    });

    it("returns 409 with i18n metadata after five failed processing attempts", async () => {
      const llmProvider: LlmProvider = {
        name: "always-failing-provider",
        async generateAssistantMessage() {
          return { content: "unused", warnings: [] };
        },
        async completeChat() {
          throw new Error("Simulated extraction failure");
        }
      };
      const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });
      const sourceId = await registerWordlistSource(app, "Max-attempt word list");

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await app.inject({
          method: "POST",
          url: `/sources/${sourceId}/process`,
          headers: authHeaders("reviewer-1")
        });
        expect(response.statusCode).toBe(422);
        expect(response.json().asset).toMatchObject({
          id: sourceId,
          status: "failed",
          processingAttempts: attempt
        });
      }

      const refused = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toEqual({
        error: "Source processing attempt limit reached (5).",
        i18nKey: "ingest.sourceMaxProcessingAttempts",
        i18nParams: { max: 5, count: 5 }
      });
    });

    it("returns 409 for a concurrent synchronous process request", async () => {
      let release: (value: string) => void = () => {};
      let markStarted: () => void = () => {};
      const blocked = new Promise<string>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const llmProvider: LlmProvider = {
        name: "blocking-provider",
        async generateAssistantMessage() {
          return { content: "unused", warnings: [] };
        },
        async completeChat() {
          markStarted();
          return blocked;
        }
      };
      const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });
      const sourceId = await registerWordlistSource(app, "Slow sync word list");

      const firstRequest = app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });
      await started;

      const conflict = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({
        error: expect.stringContaining("already processing"),
        i18nKey: "ingest.sourceAlreadyProcessing"
      });

      release(JSON.stringify({ summary: "Done.", lexemes: [{ form: "mira", gloss: "river" }] }));
      const processed = await firstRequest;
      expect(processed.statusCode).toBe(200);
      expect(processed.json().asset).toMatchObject({ id: sourceId, status: "processed" });
    });

    it("persists source processing failures with audit-safe redacted secrets", async () => {
      const dir = await mkdtemp(join(tmpdir(), "assini-source-failure-"));
      const store = new JsonStore(join(dir, "local-db.json"));
      await store.write(buildTestWorkspaceState());
      const llmProvider: LlmProvider = {
        name: "secret-failing-provider",
        async generateAssistantMessage() {
          return { content: "unused", warnings: [] };
        },
        async completeChat() {
          throw new Error("Remote failure OPENAI_API_KEY=plain-provider-secret Bearer sk-route-secret");
        }
      };
      const app = createServer({ store, llmProvider });
      const sourceId = await registerWordlistSource(app, "Secret failure word list");

      const processed = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });

      expect(processed.statusCode).toBe(422);
      expect(processed.json().error).toBe("Remote failure [redacted-secret] [redacted-secret]");
      expect(JSON.stringify(processed.json())).not.toContain("plain-provider-secret");
      expect(JSON.stringify(processed.json())).not.toContain("sk-route-secret");

      const stored = await fetchStoredSource(app, sourceId);
      expect(stored).toMatchObject({
        id: sourceId,
        status: "failed",
        error: "Remote failure [redacted-secret] [redacted-secret]"
      });

      const audit = await app.inject({
        method: "GET",
        url: "/audit/events",
        headers: authHeaders("programmer-1")
      });
      expect(audit.statusCode).toBe(200);
      expect(audit.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "source_asset.process_failed",
            metadata: { reason: "Remote failure [redacted-secret] [redacted-secret]" }
          })
        ])
      );
    });

    it("persists deterministic-mode warnings onto the source asset (sync path)", async () => {
      const app = createServer({ initialState: buildTestWorkspaceState() });
      const sourceId = await registerWordlistSource(app, "Deterministic word list");

      const processed = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });
      expect(processed.statusCode).toBe(200);
      expect(processed.json().warnings.some((warning: string) => warning.includes("deterministic mode"))).toBe(true);

      const stored = await fetchStoredSource(app, sourceId);
      expect(Array.isArray(stored.warnings)).toBe(true);
      expect(stored.warnings.some((warning: string) => warning.includes("deterministic mode"))).toBe(true);
    });

    it("persists deterministic-mode warnings onto the source asset (async path)", async () => {
      const app = createServer({ initialState: buildTestWorkspaceState() });
      const sourceId = await registerWordlistSource(app, "Async deterministic word list");

      const accepted = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1"),
        payload: { async: true }
      });
      expect(accepted.statusCode).toBe(202);

      await vi.waitFor(async () => {
        const stored = await fetchStoredSource(app, sourceId);
        expect(stored.status).toBe("processed");
      });

      const stored = await fetchStoredSource(app, sourceId);
      expect(Array.isArray(stored.warnings)).toBe(true);
      expect(stored.warnings.some((warning: string) => warning.includes("deterministic mode"))).toBe(true);
    });

    it("leaves the warnings array unset when processing yields no warnings", async () => {
      const llmProvider: LlmProvider = {
        name: "clean-provider",
        async generateAssistantMessage() {
          return { content: "unused", warnings: [] };
        },
        async completeChat() {
          return JSON.stringify({ summary: "Clean extraction.", lexemes: [{ form: "mira", gloss: "river" }] });
        }
      };
      const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });
      const sourceId = await registerWordlistSource(app, "Clean word list");

      const processed = await app.inject({
        method: "POST",
        url: `/sources/${sourceId}/process`,
        headers: authHeaders("reviewer-1")
      });
      expect(processed.statusCode).toBe(200);
      expect(processed.json().warnings).toEqual([]);

      const stored = await fetchStoredSource(app, sourceId);
      expect(stored.status).toBe("processed");
      expect(stored.warnings).toBeUndefined();
    });
  });

  describe("server startup self-healing", () => {
    it("resets stuck processing source assets to failed on startup ready", async () => {
      const state = buildTestWorkspaceState();
      state.sourceAssets.push({
        id: "stuck-asset-id",
        languageId: TEST_LANGUAGE_ID,
        kind: "text",
        title: "Stuck raw source",
        status: "processing",
        createdBy: "reviewer-1",
        createdAt: new Date().toISOString()
      });

      const app = createServer({ initialState: state });
      await app.ready();

      const sources = await app.inject({
        method: "GET",
        url: `/languages/${TEST_LANGUAGE_ID}/sources`,
        headers: authHeaders("reviewer-1")
      });
      const stuck = sources.json().find((item: { id: string }) => item.id === "stuck-asset-id");
      expect(stuck).toBeDefined();
      expect(stuck.status).toBe("failed");
      expect(stuck.error).toContain("interrupted by a server restart");

      const audit = await app.inject({
        method: "GET",
        url: `/audit/events?languageId=${TEST_LANGUAGE_ID}`,
        headers: authHeaders("admin-1")
      });
      expect(audit.statusCode).toBe(200);
      const recoveryEvent = audit
        .json()
        .find(
          (item: { action: string; entityId: string }) =>
            item.action === "source_asset.processing_recovered" && item.entityId === "stuck-asset-id"
        );
      expect(recoveryEvent).toBeDefined();
      expect(recoveryEvent.metadata).toEqual({
        sourceId: "stuck-asset-id",
        previousStatus: "processing",
        reason: "interrupted_restart"
      });
    });

    it("allows a recovered source to be processed again", async () => {
      const state = buildTestWorkspaceState();
      state.sourceAssets.push({
        id: "stuck-asset-id",
        languageId: TEST_LANGUAGE_ID,
        kind: "wordlist",
        title: "Stuck word list",
        rawText: "mira = river",
        status: "processing",
        processingStartedAt: "2026-06-06T00:00:30.000Z",
        processingAttempts: 1,
        createdBy: "reviewer-1",
        createdAt: new Date().toISOString()
      });

      const app = createServer({ initialState: state });
      await app.ready();

      const processed = await app.inject({
        method: "POST",
        url: "/sources/stuck-asset-id/process",
        headers: authHeaders("reviewer-1")
      });
      expect(processed.statusCode).toBe(200);
      expect(processed.json().asset.status).toBe("processed");
      expect(processed.json().asset.error).toBeUndefined();
      // Successful reprocess after recovery clears the attempt counter.
      expect(processed.json().asset.processingAttempts).toBeUndefined();
    });

    it("reclaims orphaned stale-heartbeat processing assets without a restart", async () => {
      const { recoverStaleProcessingSources, STALE_PROCESSING_ERROR } = await import("./jobRecovery.js");
      const state = buildTestWorkspaceState();
      state.sourceAssets.push({
        id: "orphan-stale-id",
        languageId: TEST_LANGUAGE_ID,
        kind: "text",
        title: "Orphaned processing source",
        status: "processing",
        processingStartedAt: "2026-06-06T00:00:00.000Z",
        processingHeartbeatAt: "2026-06-06T00:00:30.000Z",
        processingAttempts: 2,
        createdBy: "reviewer-1",
        createdAt: "2026-06-06T00:00:00.000Z"
      });

      let memory = state;
      const recoveredCount = await recoverStaleProcessingSources(
        {
          async update(updater) {
            memory = updater(memory);
            return memory;
          }
        },
        {
          recoveredAt: "2026-06-06T00:20:00.000Z",
          nowMs: Date.parse("2026-06-06T00:20:00.000Z")
        }
      );

      expect(recoveredCount).toBe(1);
      const orphan = memory.sourceAssets.find((item) => item.id === "orphan-stale-id");
      expect(orphan).toMatchObject({
        status: "failed",
        error: STALE_PROCESSING_ERROR,
        processingAttempts: 2
      });
      expect(orphan?.processingStartedAt).toBeUndefined();
      expect(orphan?.processingHeartbeatAt).toBeUndefined();
      expect(
        memory.auditEvents.some(
          (item) =>
            item.action === "source_asset.processing_recovered" &&
            item.entityId === "orphan-stale-id" &&
            (item.metadata as { reason?: string } | undefined)?.reason === "stale_heartbeat"
        )
      ).toBe(true);
    });
  });
});
