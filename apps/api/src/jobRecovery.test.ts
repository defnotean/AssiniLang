import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID, type AppState, type SourceAsset } from "@assini/db";
import {
  INTERRUPTED_PROCESSING_ERROR,
  PROCESSING_RECOVERED_ACTION,
  recoverInterruptedSources,
  recoverInterruptedSourcesState
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
    expect(event?.metadata).toEqual({ sourceId: "source-interrupted", previousStatus: "processing" });
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
