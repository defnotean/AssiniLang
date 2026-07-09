import type { AppState, SourceAsset, User } from "@assini/db";
import { appendAuditEvents, usersForState, type AuditEventDraft } from "./routeHelpers.js";

/**
 * Operator-visible error left on a source asset whose background processing
 * was interrupted by a crash or restart. The asset moves back to "failed",
 * so /sources/:sourceId/process accepts it again.
 */
export const INTERRUPTED_PROCESSING_ERROR =
  "Processing interrupted by a server restart. Re-run processing.";

/**
 * Operator-visible error left when an in-flight processing run stops reporting
 * heartbeats (orphaned async job, hung extraction, or failed completion persist)
 * while the API process is still up.
 */
export const STALE_PROCESSING_ERROR =
  "Processing stalled without progress. Re-run processing.";

export const PROCESSING_RECOVERED_ACTION = "source_asset.processing_recovered";

/** Matches the Build console stale-progress warning (10 minutes). */
export const DEFAULT_PROCESSING_STALE_MS = 10 * 60 * 1000;

/** How often the live process re-checks for stale heartbeats. */
export const DEFAULT_STALE_RECOVERY_INTERVAL_MS = 60_000;

type UpdatableStore = {
  update(updater: (state: AppState) => AppState): Promise<AppState>;
};

function recoveryActor(state: AppState): User {
  const users = usersForState(state);
  return users.find((user) => user.role === "admin") ?? users[0];
}

function processingProgressMarker(asset: SourceAsset): string | undefined {
  return asset.processingHeartbeatAt ?? asset.processingStartedAt;
}

/**
 * True when a processing asset's last progress marker is older than `staleMs`,
 * or when markers are missing/unparseable (legacy or corrupt in-flight rows).
 */
export function isProcessingHeartbeatStale(
  asset: Pick<SourceAsset, "status" | "processingHeartbeatAt" | "processingStartedAt">,
  nowMs: number,
  staleMs: number = DEFAULT_PROCESSING_STALE_MS
): boolean {
  if (asset.status !== "processing") return false;
  const marker = asset.processingHeartbeatAt ?? asset.processingStartedAt;
  if (!marker) return true;
  const parsed = Date.parse(marker);
  if (Number.isNaN(parsed)) return true;
  return nowMs - parsed > staleMs;
}

function markRecoveredAsset(
  asset: SourceAsset,
  recoveredAt: string,
  error: string
): SourceAsset {
  return {
    ...asset,
    status: "failed" as const,
    error,
    processedAt: recoveredAt,
    // Drop in-flight markers so a recovered asset does not look mid-run
    // to operators or to any tooling that inspects heartbeat fields.
    processingStartedAt: undefined,
    processingHeartbeatAt: undefined
  };
}

function recoveryAuditDraft(
  actor: User,
  asset: SourceAsset,
  recoveredAt: string,
  summary: string,
  extraMetadata: Record<string, string | number>
): AuditEventDraft {
  return {
    actor,
    at: recoveredAt,
    action: PROCESSING_RECOVERED_ACTION,
    entityType: "source_asset",
    entityId: asset.id,
    languageId: asset.languageId,
    summary,
    metadata: {
      sourceId: asset.id,
      previousStatus: "processing",
      ...extraMetadata,
      ...(asset.processingAttempts !== undefined ? { processingAttempts: asset.processingAttempts } : {}),
      ...(asset.processingStartedAt !== undefined ? { processingStartedAt: asset.processingStartedAt } : {}),
      ...(asset.processingHeartbeatAt !== undefined ? { processingHeartbeatAt: asset.processingHeartbeatAt } : {})
    }
  };
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
  const drafts: AuditEventDraft[] = interrupted.map((asset) => (
    recoveryAuditDraft(
      actor,
      asset,
      recoveredAt,
      `Recovered source "${asset.title}" from an interrupted processing run; marked failed for re-processing.`,
      { reason: "interrupted_restart" }
    )
  ));

  return appendAuditEvents({
    ...state,
    sourceAssets: state.sourceAssets.map((asset) => (
      interruptedIds.has(asset.id)
        ? markRecoveredAsset(asset, recoveredAt, INTERRUPTED_PROCESSING_ERROR)
        : asset
    ))
  }, drafts);
}

export type RecoverStaleProcessingOptions = {
  recoveredAt?: string;
  nowMs?: number;
  staleMs?: number;
  /** Optional ids to leave alone (for example, a test harness holding a live job). */
  skipIds?: ReadonlySet<string>;
};

/**
 * Resets processing assets whose heartbeat (or start) marker is older than
 * `staleMs` to "failed", keeping `processingAttempts` so the attempt cap still
 * applies. Used by the in-process sweep so operators do not need a restart
 * when an async job orphans or stops reporting progress.
 */
export function recoverStaleProcessingSourcesState(
  state: AppState,
  options: RecoverStaleProcessingOptions = {}
): AppState {
  const recoveredAt = options.recoveredAt ?? new Date().toISOString();
  const nowMs = options.nowMs ?? Date.parse(recoveredAt);
  const staleMs = options.staleMs ?? DEFAULT_PROCESSING_STALE_MS;
  const skipIds = options.skipIds;

  const stale = state.sourceAssets.filter((asset) => {
    if (skipIds?.has(asset.id)) return false;
    return isProcessingHeartbeatStale(asset, nowMs, staleMs);
  });
  if (stale.length === 0) return state;

  const actor = recoveryActor(state);
  const staleIds = new Set(stale.map((asset) => asset.id));
  const drafts: AuditEventDraft[] = stale.map((asset) => {
    const marker = processingProgressMarker(asset);
    return recoveryAuditDraft(
      actor,
      asset,
      recoveredAt,
      `Recovered source "${asset.title}" from a stale processing heartbeat; marked failed for re-processing.`,
      {
        reason: "stale_heartbeat",
        staleMs,
        ...(marker !== undefined ? { lastProgressAt: marker } : {})
      }
    );
  });

  return appendAuditEvents({
    ...state,
    sourceAssets: state.sourceAssets.map((asset) => (
      staleIds.has(asset.id)
        ? markRecoveredAsset(asset, recoveredAt, STALE_PROCESSING_ERROR)
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

/**
 * In-process stale-heartbeat sweep: applies {@link recoverStaleProcessingSourcesState}
 * through the store's serialized update seam and reports how many source
 * assets were recovered.
 */
export async function recoverStaleProcessingSources(
  store: UpdatableStore,
  options: RecoverStaleProcessingOptions = {}
): Promise<number> {
  let recoveredCount = 0;
  const nowMs = options.nowMs ?? Date.now();
  const staleMs = options.staleMs ?? DEFAULT_PROCESSING_STALE_MS;
  await store.update((state) => {
    recoveredCount = state.sourceAssets.filter((asset) => (
      !(options.skipIds?.has(asset.id))
      && isProcessingHeartbeatStale(asset, nowMs, staleMs)
    )).length;
    return recoverStaleProcessingSourcesState(state, { ...options, nowMs, staleMs });
  });
  return recoveredCount;
}
