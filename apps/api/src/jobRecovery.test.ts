import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID, type AppState, type SourceAsset } from "@assini/db";
import {
  DEFAULT_PROCESSING_STALE_MS,
  INTERRUPTED_PROCESSING_ERROR,
  PROCESSING_RECOVERED_ACTION,
  STALE_PROCESSING_ERROR,
  isProcessingHeartbeatStale,
  recoverInterruptedSources,
  recoverInterruptedSourcesState,
  recoverStaleProcessingSources,
  recoverStaleProcessingSourcesState
} from "./jobRecovery.js";

function buildSource(overrides: Partial<SourceAsset>): SourceAsset {
  return {
    id: "source-recovery-1",
    languageId: TEST_LANGUAGE_ID,
    kind: "text",
    title: "Interrupted source",
    status: "processing",
    createdBy: "reviewer-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("recoverInterruptedSourcesState", () => {
  it("resets interrupted processing sources to failed with an operator-visible error", () => {
    const state = buildTestWorkspaceState();
    state.sourceAssets.push(
      buildSource({ id: "source-interrupted" }),
      buildSource({ id: "source-pending", status: "pending" }),
      buildSource({ id: "source-processed", status: "processed" })
    );

    const recovered = recoverInterruptedSourcesState(state);

    const interrupted = recovered.sourceAssets.find((asset) => asset.id === "source-interrupted");
    expect(interrupted?.status).toBe("failed");
    expect(interrupted?.error).toBe(INTERRUPTED_PROCESSING_ERROR);
    expect(recovered.sourceAssets.find((asset) => asset.id === "source-pending")?.status).toBe("pending");
    expect(recovered.sourceAssets.find((asset) => asset.id === "source-processed")?.status).toBe("processed");
  });

  it("clears in-flight processing markers when recovering an interrupted source", () => {
    const state = buildTestWorkspaceState();
    state.sourceAssets.push(buildSource({
      id: "source-interrupted",
      processingStartedAt: "2026-06-06T00:00:30.000Z",
      processingHeartbeatAt: "2026-06-06T00:00:45.000Z",
      processingAttempts: 2
    }));

    const recovered = recoverInterruptedSourcesState(state, "2026-06-06T00:01:00.000Z");
    const interrupted = recovered.sourceAssets.find((asset) => asset.id === "source-interrupted");

    expect(interrupted).toMatchObject({
      status: "failed",
      error: INTERRUPTED_PROCESSING_ERROR,
      processedAt: "2026-06-06T00:01:00.000Z",
      processingAttempts: 2
    });
    expect(interrupted?.processingStartedAt).toBeUndefined();
    expect(interrupted?.processingHeartbeatAt).toBeUndefined();
  });

  it("appends a recovery audit event attributed to the local admin with minimal metadata", () => {
    const state = buildTestWorkspaceState();
    state.sourceAssets.push(buildSource({ id: "source-interrupted" }));

    const recovered = recoverInterruptedSourcesState(state);

    const event = recovered.auditEvents.find((item) => item.action === PROCESSING_RECOVERED_ACTION);
    expect(event).toBeDefined();
    expect(event?.actorId).toBe("admin-1");
    expect(event?.actorRole).toBe("admin");
    expect(event?.entityType).toBe("source_asset");
    expect(event?.entityId).toBe("source-interrupted");
    expect(event?.languageId).toBe(TEST_LANGUAGE_ID);
    expect(event?.metadata).toEqual({
      sourceId: "source-interrupted",
      previousStatus: "processing",
      reason: "interrupted_restart"
    });
  });

  it("includes processing metadata in recovery audit events when present", () => {
    const state = buildTestWorkspaceState();
    state.sourceAssets.push(buildSource({
      id: "source-interrupted",
      processingStartedAt: "2026-06-06T00:00:30.000Z",
      processingHeartbeatAt: "2026-06-06T00:00:45.000Z",
      processingAttempts: 2
    }));

    const recovered = recoverInterruptedSourcesState(state);

    const event = recovered.auditEvents.find((item) => item.action === PROCESSING_RECOVERED_ACTION);
    expect(event?.metadata).toEqual({
      sourceId: "source-interrupted",
      previousStatus: "processing",
      reason: "interrupted_restart",
      processingAttempts: 2,
      processingStartedAt: "2026-06-06T00:00:30.000Z",
      processingHeartbeatAt: "2026-06-06T00:00:45.000Z"
    });
  });

  it("appends one audit event per interrupted source", () => {
    const state = buildTestWorkspaceState();
    state.sourceAssets.push(
      buildSource({ id: "source-interrupted-a" }),
      buildSource({ id: "source-interrupted-b" })
    );

    const recovered = recoverInterruptedSourcesState(state);

    const events = recovered.auditEvents.filter((item) => item.action === PROCESSING_RECOVERED_ACTION);
    expect(events.map((item) => item.entityId).sort()).toEqual(["source-interrupted-a", "source-interrupted-b"]);
  });

  it("returns the state unchanged when no source is stuck in processing", () => {
    const state = buildTestWorkspaceState();
    state.sourceAssets.push(buildSource({ id: "source-pending", status: "pending" }));

    const recovered = recoverInterruptedSourcesState(state);

    expect(recovered).toBe(state);
  });
});

describe("isProcessingHeartbeatStale", () => {
  it("treats missing or unparseable markers as stale while status is processing", () => {
    expect(isProcessingHeartbeatStale({ status: "processing" }, Date.parse("2026-06-06T00:20:00.000Z"))).toBe(true);
    expect(isProcessingHeartbeatStale({
      status: "processing",
      processingStartedAt: "not-a-date"
    }, Date.parse("2026-06-06T00:20:00.000Z"))).toBe(true);
  });

  it("uses heartbeat over startedAt and respects the stale window", () => {
    const nowMs = Date.parse("2026-06-06T00:20:00.000Z");
    expect(isProcessingHeartbeatStale({
      status: "processing",
      processingStartedAt: "2026-06-06T00:00:00.000Z",
      processingHeartbeatAt: "2026-06-06T00:15:00.000Z"
    }, nowMs, DEFAULT_PROCESSING_STALE_MS)).toBe(false);
    expect(isProcessingHeartbeatStale({
      status: "processing",
      processingStartedAt: "2026-06-06T00:00:00.000Z",
      processingHeartbeatAt: "2026-06-06T00:09:00.000Z"
    }, nowMs, DEFAULT_PROCESSING_STALE_MS)).toBe(true);
  });

  it("ignores non-processing assets", () => {
    expect(isProcessingHeartbeatStale({
      status: "failed",
      processingHeartbeatAt: "2026-06-06T00:00:00.000Z"
    }, Date.parse("2026-06-06T01:00:00.000Z"))).toBe(false);
  });
});

describe("recoverStaleProcessingSourcesState", () => {
  it("resets only heartbeat-stale processing sources and keeps attempts", () => {
    const state = buildTestWorkspaceState();
    state.sourceAssets.push(
      buildSource({
        id: "source-stale",
        processingStartedAt: "2026-06-06T00:00:00.000Z",
        processingHeartbeatAt: "2026-06-06T00:01:00.000Z",
        processingAttempts: 3
      }),
      buildSource({
        id: "source-fresh",
        processingStartedAt: "2026-06-06T00:15:00.000Z",
        processingHeartbeatAt: "2026-06-06T00:19:00.000Z",
        processingAttempts: 1
      }),
      buildSource({ id: "source-pending", status: "pending" })
    );

    const recovered = recoverStaleProcessingSourcesState(state, {
      recoveredAt: "2026-06-06T00:20:00.000Z",
      nowMs: Date.parse("2026-06-06T00:20:00.000Z")
    });

    const stale = recovered.sourceAssets.find((asset) => asset.id === "source-stale");
    expect(stale).toMatchObject({
      status: "failed",
      error: STALE_PROCESSING_ERROR,
      processedAt: "2026-06-06T00:20:00.000Z",
      processingAttempts: 3
    });
    expect(stale?.processingStartedAt).toBeUndefined();
    expect(stale?.processingHeartbeatAt).toBeUndefined();

    expect(recovered.sourceAssets.find((asset) => asset.id === "source-fresh")?.status).toBe("processing");
    expect(recovered.sourceAssets.find((asset) => asset.id === "source-pending")?.status).toBe("pending");

    const event = recovered.auditEvents.find(
      (item) => item.action === PROCESSING_RECOVERED_ACTION && item.entityId === "source-stale"
    );
    expect(event?.metadata).toEqual({
      sourceId: "source-stale",
      previousStatus: "processing",
      reason: "stale_heartbeat",
      staleMs: DEFAULT_PROCESSING_STALE_MS,
      lastProgressAt: "2026-06-06T00:01:00.000Z",
      processingAttempts: 3,
      processingStartedAt: "2026-06-06T00:00:00.000Z",
      processingHeartbeatAt: "2026-06-06T00:01:00.000Z"
    });
  });

  it("honors skipIds so queued-but-not-started claims are left alone", () => {
    const state = buildTestWorkspaceState();
    state.sourceAssets.push(buildSource({
      id: "source-queued",
      processingStartedAt: "2026-06-06T00:00:00.000Z",
      processingHeartbeatAt: "2026-06-06T00:00:00.000Z",
      processingAttempts: 1
    }));

    const recovered = recoverStaleProcessingSourcesState(state, {
      recoveredAt: "2026-06-06T00:20:00.000Z",
      nowMs: Date.parse("2026-06-06T00:20:00.000Z"),
      skipIds: new Set(["source-queued"])
    });

    expect(recovered).toBe(state);
  });

  it("returns the state unchanged when nothing is stale", () => {
    const state = buildTestWorkspaceState();
    state.sourceAssets.push(buildSource({
      id: "source-fresh",
      processingStartedAt: "2026-06-06T00:19:30.000Z",
      processingHeartbeatAt: "2026-06-06T00:19:45.000Z"
    }));

    const recovered = recoverStaleProcessingSourcesState(state, {
      recoveredAt: "2026-06-06T00:20:00.000Z",
      nowMs: Date.parse("2026-06-06T00:20:00.000Z")
    });

    expect(recovered).toBe(state);
  });
});

describe("recoverInterruptedSources", () => {
  it("applies the sweep through the store update seam", async () => {
    let state = buildTestWorkspaceState();
    state.sourceAssets.push(buildSource({ id: "source-interrupted" }));
    const store = {
      async update(updater: (current: AppState) => AppState): Promise<AppState> {
        state = updater(state);
        return state;
      }
    };

    const recoveredCount = await recoverInterruptedSources(store);

    expect(recoveredCount).toBe(1);
    const interrupted = state.sourceAssets.find((asset) => asset.id === "source-interrupted");
    expect(interrupted?.status).toBe("failed");
    expect(interrupted?.error).toBe(INTERRUPTED_PROCESSING_ERROR);
    expect(state.auditEvents.some((item) => item.action === PROCESSING_RECOVERED_ACTION)).toBe(true);
  });

  it("reports zero recovered sources when nothing was interrupted", async () => {
    let state = buildTestWorkspaceState();
    const store = {
      async update(updater: (current: AppState) => AppState): Promise<AppState> {
        state = updater(state);
        return state;
      }
    };

    await expect(recoverInterruptedSources(store)).resolves.toBe(0);
    expect(state.auditEvents.some((item) => item.action === PROCESSING_RECOVERED_ACTION)).toBe(false);
  });
});

describe("recoverStaleProcessingSources", () => {
  it("applies the stale sweep through the store update seam", async () => {
    let state = buildTestWorkspaceState();
    state.sourceAssets.push(buildSource({
      id: "source-stale",
      processingStartedAt: "2026-06-06T00:00:00.000Z",
      processingHeartbeatAt: "2026-06-06T00:00:30.000Z",
      processingAttempts: 2
    }));
    const store = {
      async update(updater: (current: AppState) => AppState): Promise<AppState> {
        state = updater(state);
        return state;
      }
    };

    const recoveredCount = await recoverStaleProcessingSources(store, {
      recoveredAt: "2026-06-06T00:20:00.000Z",
      nowMs: Date.parse("2026-06-06T00:20:00.000Z")
    });

    expect(recoveredCount).toBe(1);
    expect(state.sourceAssets.find((asset) => asset.id === "source-stale")).toMatchObject({
      status: "failed",
      error: STALE_PROCESSING_ERROR,
      processingAttempts: 2
    });
  });
});

/**
 * Operator recovery pack — interrupted-processing drill log.
 * Mirrors the runbook checklist: stuck asset → startup sweep → failed + audit → reprocess-ready.
 */
describe("interrupted-processing drill log", () => {
  it("records a pasteable drill log for the acceptance pack", async () => {
    const recoveredAt = "2026-07-09T15:00:00.000Z";
    let state = buildTestWorkspaceState();
    state.sourceAssets.push(buildSource({
      id: "drill-interrupted-1",
      title: "Drill interrupted source",
      processingStartedAt: "2026-07-09T14:59:00.000Z",
      processingHeartbeatAt: "2026-07-09T14:59:30.000Z",
      processingAttempts: 1
    }));

    const store = {
      async update(updater: (current: AppState) => AppState): Promise<AppState> {
        state = updater(state);
        return state;
      }
    };

    const steps: Array<{ name: string; ok: boolean; detail: string }> = [];

    steps.push({
      name: "seedStuckProcessing",
      ok: state.sourceAssets.some((asset) => asset.id === "drill-interrupted-1" && asset.status === "processing"),
      detail: "Source left in processing to simulate a crash mid-run."
    });

    const recoveredCount = await recoverInterruptedSources(store, recoveredAt);
    const recovered = state.sourceAssets.find((asset) => asset.id === "drill-interrupted-1");
    const auditEvent = state.auditEvents.find(
      (item) => item.action === PROCESSING_RECOVERED_ACTION && item.entityId === "drill-interrupted-1"
    );

    steps.push({
      name: "startupRecoverySweep",
      ok: recoveredCount === 1,
      detail: `recoverInterruptedSources recoveredCount=${recoveredCount}`
    });
    steps.push({
      name: "assetFailedWithOperatorError",
      ok: recovered?.status === "failed" && recovered.error === INTERRUPTED_PROCESSING_ERROR,
      detail: recovered?.error ?? "missing error"
    });
    steps.push({
      name: "markersClearedAttemptsKept",
      ok: recovered?.processingStartedAt === undefined
        && recovered?.processingHeartbeatAt === undefined
        && recovered?.processingAttempts === 1,
      detail: `processingAttempts=${recovered?.processingAttempts ?? "missing"}`
    });
    steps.push({
      name: "auditProcessingRecovered",
      ok: auditEvent?.metadata?.reason === "interrupted_restart",
      detail: "source_asset.processing_recovered with reason interrupted_restart"
    });
    steps.push({
      name: "reprocessReady",
      ok: recovered?.status === "failed",
      detail: "Failed status accepts a fresh Process call (see server ready-hook coverage)."
    });

    const drillLog = {
      drill: "interrupted-processing",
      pack: "operator-recovery",
      startedAt: "2026-07-09T14:59:00.000Z",
      finishedAt: recoveredAt,
      sourceId: "drill-interrupted-1",
      recoveredCount,
      operatorVisibleError: INTERRUPTED_PROCESSING_ERROR,
      auditAction: PROCESSING_RECOVERED_ACTION,
      auditReason: "interrupted_restart",
      steps,
      outcome: steps.every((step) => step.ok) ? "pass" : "fail",
      notes:
        "Automated acceptance drill via apps/api/src/jobRecovery.test.ts; manual operators restart the API and confirm the same audit + failed status in Build."
    };

    expect(drillLog.outcome).toBe("pass");
    expect(drillLog.steps).toHaveLength(6);
    expect(drillLog.steps.every((step) => step.ok)).toBe(true);
    expect(JSON.stringify(drillLog)).toContain("source_asset.processing_recovered");
    expect(JSON.stringify(drillLog)).toContain(INTERRUPTED_PROCESSING_ERROR);
  });
});
