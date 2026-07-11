import type { FastifyInstance } from "fastify";
import { sourceProcessingErrorI18n } from "@assini/api-contract";
import type { SourceAsset as PublicSourceAsset } from "@assini/api-contract";
import type { SourceAsset } from "@assini/db";
import { extractCandidatesForAsset, type SourceExtractionResult } from "../ingestion.js";
import { appendAuditEvent, redactErrorSecrets, requireActor } from "../routeHelpers.js";
import { toPublicSourceAsset } from "../sourceAssetViews.js";
import {
  applySourceProcessCompletion,
  createSourceProcessingRetryController,
  MAX_SOURCE_PROCESSING_ATTEMPTS,
  runSourceExtractionWithRetries,
  type SourceProcessCompletionOutput
} from "../sourceProcessingDurability.js";
import type { RouteContext } from "./context.js";

/** Error retained when an operator cancels a queued, not active, job. */
export const CANCELLED_PROCESSING_ERROR = "Queued source processing was cancelled. Use Retry when ready.";

export type SourceAssetView = PublicSourceAsset;

export function withProcessingQueuePhase(
  asset: SourceAsset,
  queue: { isPending(id: string): boolean; isActive(id: string): boolean }
): SourceAssetView {
  if (asset.status !== "processing") return toPublicSourceAsset(asset);
  if (queue.isPending(asset.id)) return toPublicSourceAsset(asset, "queued");
  if (queue.isActive(asset.id)) return toPublicSourceAsset(asset, "active");
  // Orphaned processing claim is not safely cancellable.
  return toPublicSourceAsset(asset, "active");
}

function isAsyncProcessRequested(body: unknown): boolean {
  return Boolean(
    body && typeof body === "object" && !Array.isArray(body) && (body as Record<string, unknown>).async === true
  );
}

export function registerSourceProcessingRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const {
    readState,
    updateState,
    checkRateLimit,
    authToken,
    prototypeSessions,
    llmProvider,
    dataDir,
    ingestionFetch,
    jobQueue,
    now,
    sourceProcessingSleep
  } = ctx;

  app.post("/sources/:sourceId/process", async (request, reply) => {
    const { sourceId } = request.params as { sourceId: string };

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    const asset = current.sourceAssets.find((item) => item.id === sourceId);
    if (!asset) {
      reply.code(404);
      return {
        error: `Source not found: ${sourceId}`,
        i18nKey: "errors.sourceNotFound"
      };
    }

    const language = current.languages.find((item) => item.id === asset.languageId);
    if (!language) {
      reply.code(404);
      return {
        error: `Language not found: ${asset.languageId}`,
        i18nKey: "errors.languageNotFound"
      };
    }

    if (asset.status === "processing" || jobQueue.isQueuedOrActive(sourceId)) {
      reply.code(409);
      return {
        error: `Source is already processing: ${sourceId}`,
        i18nKey: "ingest.sourceAlreadyProcessing"
      };
    }

    if ((asset.processingAttempts ?? 0) >= MAX_SOURCE_PROCESSING_ATTEMPTS) {
      reply.code(409);
      return {
        error: `Source processing attempt limit reached (${MAX_SOURCE_PROCESSING_ATTEMPTS}).`,
        i18nKey: "ingest.sourceMaxProcessingAttempts",
        i18nParams: { max: MAX_SOURCE_PROCESSING_ATTEMPTS, count: asset.processingAttempts ?? 0 }
      };
    }

    const asyncRequested = isAsyncProcessRequested(request.body);
    let claimed: SourceAsset | undefined;
    let alreadyProcessing = false;

    await updateState((state) => {
      const stored = state.sourceAssets.find((item) => item.id === sourceId);
      if (!stored) return state;
      if (stored.status === "processing" || jobQueue.isQueuedOrActive(sourceId)) {
        alreadyProcessing = true;
        return state;
      }

      const processingStartedAt = new Date(now()).toISOString();
      const processingHeartbeatAt = processingStartedAt;
      const processingAttempts = (stored.processingAttempts ?? 0) + 1;
      claimed = {
        ...stored,
        status: "processing",
        error: undefined,
        processingStartedAt,
        processingHeartbeatAt,
        processingAttempts
      };
      return appendAuditEvent(
        {
          ...state,
          sourceAssets: state.sourceAssets.map((item) => (item.id === sourceId ? (claimed as SourceAsset) : item))
        },
        {
          actor,
          action: "source_asset.process_started",
          entityType: "source_asset",
          entityId: sourceId,
          languageId: stored.languageId,
          summary: asyncRequested
            ? `Started background processing for source "${stored.title}".`
            : `Started processing for source "${stored.title}".`,
          metadata: {
            kind: stored.kind,
            async: asyncRequested,
            processingAttempts,
            processingStartedAt,
            processingHeartbeatAt
          }
        }
      );
    });

    if (alreadyProcessing) {
      reply.code(409);
      return {
        error: `Source is already processing: ${sourceId}`,
        i18nKey: "ingest.sourceAlreadyProcessing"
      };
    }

    if (!claimed) {
      reply.code(404);
      return {
        error: `Source not found: ${sourceId}`,
        i18nKey: "errors.sourceNotFound"
      };
    }

    const claimedAsset = claimed;
    const transientRetry = createSourceProcessingRetryController({
      sourceId,
      actor,
      updateState,
      now,
      sleep: sourceProcessingSleep
    });

    const extractClaimedSource = (onProgress?: () => void | Promise<void>) =>
      runSourceExtractionWithRetries(
        (onTransientFailure) =>
          extractCandidatesForAsset({
            asset: claimedAsset,
            language,
            provider: llmProvider,
            dataDir,
            fetchFn: ingestionFetch,
            onProgress,
            onTransientFailure
          }),
        transientRetry
      );

    if (asyncRequested) {
      const touchProcessingHeartbeat = async () => {
        const heartbeatAt = new Date(now()).toISOString();
        await updateState((state) => ({
          ...state,
          sourceAssets: state.sourceAssets.map((item) =>
            item.id === sourceId && item.status === "processing"
              ? { ...item, processingHeartbeatAt: heartbeatAt }
              : item
          )
        }));
      };

      jobQueue.add(sourceId, async () => {
        let extraction: SourceExtractionResult | undefined;
        let extractionError: string | undefined;
        try {
          extraction = await extractClaimedSource(touchProcessingHeartbeat);
        } catch (error) {
          extractionError = redactErrorSecrets(error instanceof Error ? error.message : "Source processing failed.");
        }

        const output: SourceProcessCompletionOutput = { drafts: [] };
        try {
          await updateState((state) =>
            applySourceProcessCompletion(
              state,
              {
                sourceId,
                actor,
                processedAt: new Date(now()).toISOString(),
                extraction,
                extractionError
              },
              output
            )
          );
        } catch (error) {
          // Persistence failed after extraction: mark failed so the asset is not
          // left stuck in "processing" until restart or the stale-heartbeat sweep.
          const persistError = redactErrorSecrets(error instanceof Error ? error.message : "Source processing failed.");
          try {
            await updateState((state) =>
              applySourceProcessCompletion(
                state,
                {
                  sourceId,
                  actor,
                  processedAt: new Date(now()).toISOString(),
                  extraction: undefined,
                  extractionError: persistError
                },
                { drafts: [] }
              )
            );
          } catch {
            // Stale-heartbeat recovery will reclaim if this also fails.
          }
        }
      });

      reply.code(202);
      return {
        asset: withProcessingQueuePhase(claimedAsset, jobQueue),
        drafts: [],
        warnings: []
      };
    }

    let extraction: SourceExtractionResult | undefined;
    let extractionError: string | undefined;
    try {
      extraction = await extractClaimedSource();
    } catch (error) {
      extractionError = redactErrorSecrets(error instanceof Error ? error.message : "Source processing failed.");
    }

    const processedAt = new Date(now()).toISOString();
    const output: SourceProcessCompletionOutput = { drafts: [] };

    await updateState((state) =>
      applySourceProcessCompletion(
        state,
        {
          sourceId,
          actor,
          processedAt,
          extraction,
          extractionError
        },
        output
      )
    );

    if (!output.updatedAsset) {
      reply.code(500);
      return {
        error: "Source could not be processed",
        i18nKey: "errors.sourceProcessFailed"
      };
    }

    if (!extraction) {
      reply.code(422);
      const i18n = extractionError ? sourceProcessingErrorI18n(extractionError) : undefined;
      return {
        error: extractionError ?? "Source processing failed.",
        asset: toPublicSourceAsset(output.updatedAsset),
        ...(i18n ? { i18nKey: i18n.i18nKey, i18nParams: i18n.i18nParams } : {})
      };
    }

    return {
      asset: toPublicSourceAsset(output.updatedAsset),
      drafts: output.drafts,
      warnings: extraction.warnings
    };
  });

  app.post("/sources/:sourceId/cancel-processing", async (request, reply) => {
    const { sourceId } = request.params as { sourceId: string };

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    const asset = current.sourceAssets.find((item) => item.id === sourceId);
    if (!asset) {
      reply.code(404);
      return {
        error: `Source not found: ${sourceId}`,
        i18nKey: "errors.sourceNotFound"
      };
    }

    if (jobQueue.isActive(sourceId)) {
      reply.code(409);
      return {
        error: "Source processing is already running and cannot be cancelled.",
        i18nKey: "ingest.sourceProcessingCancelActive"
      };
    }

    if (!jobQueue.isPending(sourceId)) {
      reply.code(409);
      return {
        error:
          asset.status === "processing"
            ? "Source processing is already running and cannot be cancelled."
            : "Source is not queued for processing.",
        i18nKey:
          asset.status === "processing" ? "ingest.sourceProcessingCancelActive" : "ingest.sourceProcessingNotQueued"
      };
    }

    if (!jobQueue.cancel(sourceId)) {
      reply.code(409);
      return {
        error: "Source processing is already running and cannot be cancelled.",
        i18nKey: "ingest.sourceProcessingCancelActive"
      };
    }

    const cancelledAt = new Date(now()).toISOString();
    let cancelledAsset: SourceAsset | undefined;

    await updateState((state) => {
      const stored = state.sourceAssets.find((item) => item.id === sourceId);
      if (!stored || stored.status !== "processing") {
        return state;
      }
      const failedAsset: SourceAsset = {
        ...stored,
        status: "failed",
        error: CANCELLED_PROCESSING_ERROR,
        processedAt: cancelledAt,
        processingStartedAt: undefined,
        processingHeartbeatAt: undefined
      };
      cancelledAsset = failedAsset;
      return appendAuditEvent(
        {
          ...state,
          sourceAssets: state.sourceAssets.map((item) => (item.id === sourceId ? failedAsset : item))
        },
        {
          actor,
          at: cancelledAt,
          action: "source_asset.process_cancelled",
          entityType: "source_asset",
          entityId: sourceId,
          languageId: stored.languageId,
          summary: `Cancelled queued processing for source "${stored.title}".`,
          metadata: {
            reason: "operator_cancel",
            ...(stored.processingAttempts !== undefined ? { processingAttempts: stored.processingAttempts } : {})
          }
        }
      );
    });

    if (!cancelledAsset) {
      reply.code(409);
      return {
        error: "Source is not queued for processing.",
        i18nKey: "ingest.sourceProcessingNotQueued"
      };
    }

    return { asset: toPublicSourceAsset(cancelledAsset) };
  });
}
