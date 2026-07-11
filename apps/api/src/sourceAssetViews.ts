import type { SourceAsset as PublicSourceAsset, ProcessingQueuePhase } from "@assini/api-contract";
import type { SourceAsset as PersistedSourceAsset } from "@assini/db";

/**
 * Projects a persisted source record onto the browser-safe wire contract.
 * Local paths, source text, URLs (which may contain credentials), and full
 * transcripts intentionally never leave the API process.
 */
export function toPublicSourceAsset(
  asset: PersistedSourceAsset,
  processingQueuePhase?: ProcessingQueuePhase
): PublicSourceAsset {
  return {
    id: asset.id,
    languageId: asset.languageId,
    kind: asset.kind,
    title: asset.title,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    status: asset.status,
    error: asset.error,
    summary: asset.summary,
    warnings: asset.warnings,
    createdBy: asset.createdBy,
    createdAt: asset.createdAt,
    processedAt: asset.processedAt,
    processingStartedAt: asset.processingStartedAt,
    processingAttempts: asset.processingAttempts,
    processingHeartbeatAt: asset.processingHeartbeatAt,
    transcriptAvailable: Boolean(asset.transcript),
    processingQueuePhase
  };
}
