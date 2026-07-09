import type { AppState, User } from "@assini/db";
import { appendAuditEvents, usersForState, type AuditEventDraft } from "./routeHelpers.js";

/**
 * Operator-visible error left on a source asset whose background processing
 * was interrupted by a crash or restart. The asset moves back to "failed",
 * so /sources/:sourceId/process accepts it again.
 */
export const INTERRUPTED_PROCESSING_ERROR =
  "Processing interrupted by a server restart. Re-run processing.";

export const PROCESSING_RECOVERED_ACTION = "source_asset.processing_recovered";

type UpdatableStore = {
  update(updater: (state: AppState) => AppState): Promise<AppState>;
};

function recoveryActor(state: AppState): User {
  const users = usersForState(state);
  return users.find((user) => user.role === "admin") ?? users[0];
}

/**
 * Resets every source asset stuck in "processing" (a process crash or
 * restart lost its in-flight job) to "failed" with an operator-visible
 * error, and appends one audit event per recovered asset. Returns the
 * state unchanged when nothing is stuck, so startup is a no-op for
 * healthy databases.
 */
export function recoverInterruptedSourcesState(state: AppState, recoveredAt = new Date().toISOString()): AppState {
  const interrupted = state.sourceAssets.filter((asset) => asset.status === "processing");
  if (interrupted.length === 0) return state;

  const actor = recoveryActor(state);
  const interruptedIds = new Set(interrupted.map((asset) => asset.id));
  const drafts: AuditEventDraft[] = interrupted.map((asset) => ({
    actor,
    at: recoveredAt,
    action: PROCESSING_RECOVERED_ACTION,
    entityType: "source_asset",
    entityId: asset.id,
    languageId: asset.languageId,
    summary: `Recovered source "${asset.title}" from an interrupted processing run; marked failed for re-processing.`,
    metadata: {
      sourceId: asset.id,
      previousStatus: "processing",
      ...(asset.processingAttempts !== undefined ? { processingAttempts: asset.processingAttempts } : {}),
      ...(asset.processingStartedAt !== undefined ? { processingStartedAt: asset.processingStartedAt } : {})
    }
  }));

  return appendAuditEvents({
    ...state,
    sourceAssets: state.sourceAssets.map((asset) => (
      interruptedIds.has(asset.id)
        ? { ...asset, status: "failed" as const, error: INTERRUPTED_PROCESSING_ERROR, processedAt: recoveredAt }
        : asset
    ))
  }, drafts);
}

/**
 * Startup recovery sweep: applies {@link recoverInterruptedSourcesState}
 * through the store's serialized update seam and reports how many source
 * assets were recovered.
 */
export async function recoverInterruptedSources(store: UpdatableStore): Promise<number> {
  let recoveredCount = 0;
  await store.update((state) => {
    recoveredCount = state.sourceAssets.filter((asset) => asset.status === "processing").length;
    return recoverInterruptedSourcesState(state);
  });
  return recoveredCount;
}
