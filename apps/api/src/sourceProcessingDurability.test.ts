import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID, type AppState, type SourceAsset, type User } from "@assini/db";
import type { LlmProvider } from "./llmProvider.js";
import { createServer } from "./server.js";
import {
  createSourceProcessingRetryController,
  transientSourceProcessingReason
} from "./sourceProcessingDurability.js";
import { CANCELLED_PROCESSING_ERROR } from "./routes/sources.js";

const actor: User = { id: "reviewer-1", name: "Local Reviewer", role: "reviewer" };

function authHeaders(userId: string) {
  return { "x-assini-user-id": userId, "x-assini-dev-token": "test" };
}

function processingSource(overrides: Partial<SourceAsset> = {}): SourceAsset {
  return {
    id: "source-durable",
    languageId: TEST_LANGUAGE_ID,
    kind: "wordlist",
    title: "Durable word list",
    rawText: "mira = river",
    status: "processing",
    processingStartedAt: "2026-07-11T12:00:00.000Z",
    processingHeartbeatAt: "2026-07-11T12:00:00.000Z",
    processingAttempts: 1,
    createdBy: actor.id,
    createdAt: "2026-07-11T11:59:00.000Z",
    ...overrides
  };
}

describe("source processing retry durability", () => {
  it.each([
    [Object.assign(new Error("provider busy"), { status: 429 }), "provider_rate_limited"],
    [new Error("LLM provider request timed out after 20ms"), "timeout"],
    [Object.assign(new Error("temporary lookup"), { code: "EAI_AGAIN" }), "dns_temporary"],
    [new Error("connect ECONNREFUSED 127.0.0.1"), "network_refused"],
    [new Error("socket hang up"), "network_reset"],
    [Object.assign(new Error("upstream unavailable"), { statusCode: 503 }), "provider_unavailable"]
  ])("classifies only an explicit transient failure: %s", (error, reason) => {
    expect(transientSourceProcessingReason(error)).toBe(reason);
  });

  it.each([
    new Error("invalid extraction JSON"),
    Object.assign(new Error("unauthorized"), { status: 401 }),
    new Error("Document type .epub is not supported yet")
  ])("does not retry permanent failures: %s", (error) => {
    expect(transientSourceProcessingReason(error)).toBeUndefined();
  });

  it("persists and audits each bounded retry before sleeping", async () => {
    let state = buildTestWorkspaceState();
    state.sourceAssets.push(processingSource());
    const sleeps: number[] = [];
    const retry = createSourceProcessingRetryController({
      sourceId: "source-durable",
      actor,
      delaysMs: [10, 20],
      now: () => Date.parse("2026-07-11T12:00:30.000Z") + sleeps.length * 1_000,
      sleep: async (delayMs) => {
        sleeps.push(delayMs);
      },
      async updateState(updater) {
        state = updater(state);
        return state;
      }
    });

    expect(await retry(Object.assign(new Error("busy"), { status: 429 }))).toBe(true);
    expect(await retry(new Error("connect ECONNRESET"))).toBe(true);
    expect(await retry(new Error("connect ECONNRESET"))).toBe(false);

    expect(sleeps).toEqual([10, 20]);
    expect(state.sourceAssets.find((asset) => asset.id === "source-durable")).toMatchObject({
      status: "processing",
      processingAttempts: 3,
      processingHeartbeatAt: "2026-07-11T12:00:31.000Z"
    });
    const retries = state.auditEvents.filter((event) => event.action === "source_asset.process_retry_scheduled");
    expect(retries.map((event) => event.metadata)).toEqual([
      { delayMs: 10, processingAttempts: 2, reason: "provider_rate_limited" },
      { delayMs: 20, processingAttempts: 3, reason: "network_reset" }
    ]);
  });

  it("does not sleep or audit after cancellation or the attempt cap", async () => {
    for (const source of [
      processingSource({
        status: "failed",
        error: CANCELLED_PROCESSING_ERROR,
        processingStartedAt: undefined,
        processingHeartbeatAt: undefined
      }),
      processingSource({ processingAttempts: 5 })
    ]) {
      let state = buildTestWorkspaceState();
      state.sourceAssets.push(source);
      const sleeps: number[] = [];
      const retry = createSourceProcessingRetryController({
        sourceId: source.id,
        actor,
        delaysMs: [10],
        sleep: async (delayMs) => {
          sleeps.push(delayMs);
        },
        async updateState(updater) {
          state = updater(state);
          return state;
        }
      });

      expect(await retry(new Error("connect ECONNREFUSED"))).toBe(false);
      expect(sleeps).toEqual([]);
      expect(state.auditEvents.some((event) => event.action === "source_asset.process_retry_scheduled")).toBe(false);
    }
  });

  it("never sleeps when persisting retry truth fails", async () => {
    const sleeps: number[] = [];
    const retry = createSourceProcessingRetryController({
      sourceId: "source-durable",
      actor,
      delaysMs: [10],
      sleep: async (delayMs) => {
        sleeps.push(delayMs);
      },
      async updateState(_updater) {
        throw new Error("simulated persistence failure");
      }
    });

    await expect(retry(new Error("connect ECONNREFUSED"))).rejects.toThrow("simulated persistence failure");
    expect(sleeps).toEqual([]);
  });

  it("retries a transient provider failure and reuses drafts on explicit reprocessing", async () => {
    let calls = 0;
    const llmProvider: LlmProvider = {
      name: "one-transient-failure",
      async generateAssistantMessage() {
        return { content: "unused", warnings: [] };
      },
      async completeChat() {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error("provider rate limited"), { status: 429 });
        return JSON.stringify({ summary: "Recovered.", lexemes: [{ form: "mira", gloss: "river" }] });
      }
    };
    const app = createServer({ initialState: buildTestWorkspaceState(), llmProvider });
    const registered = await app.inject({
      method: "POST",
      url: `/languages/${TEST_LANGUAGE_ID}/sources`,
      headers: authHeaders(actor.id),
      payload: { kind: "wordlist", title: "Retry integration", rawText: "mira = river" }
    });
    expect(registered.statusCode).toBe(201);
    const sourceId = registered.json().id as string;

    const first = await app.inject({
      method: "POST",
      url: `/sources/${sourceId}/process`,
      headers: authHeaders(actor.id)
    });
    expect(first.statusCode).toBe(200);
    expect(calls).toBe(2);
    const firstDraftIds = first.json().drafts.map((draft: { id: string }) => draft.id);
    expect(firstDraftIds).toHaveLength(1);

    const second = await app.inject({
      method: "POST",
      url: `/sources/${sourceId}/process`,
      headers: authHeaders(actor.id)
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().drafts.map((draft: { id: string }) => draft.id)).toEqual(firstDraftIds);

    const audit = await app.inject({ method: "GET", url: "/audit/events", headers: authHeaders("programmer-1") });
    const events = audit.json() as AppState["auditEvents"];
    expect(events.find((event) => event.action === "source_asset.process_retry_scheduled")?.metadata).toEqual({
      delayMs: 250,
      processingAttempts: 2,
      reason: "provider_rate_limited"
    });
    expect(events.filter((event) => event.action === "source_asset.processed").at(-1)?.metadata).toMatchObject({
      candidateCount: 1,
      createdDraftCount: 0,
      reusedDraftCount: 1
    });

    await app.close();
  });
});
