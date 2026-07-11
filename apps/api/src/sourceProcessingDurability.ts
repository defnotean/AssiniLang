import { randomUUID } from "node:crypto";
import type { AppState, ExtractionDraft, ExtractionDraftPayload, SourceAsset, User } from "@assini/db";
import type { SourceExtractionResult } from "./ingestion.js";
import { appendAuditEvent } from "./routeHelpers.js";

export const MAX_SOURCE_PROCESSING_ATTEMPTS = 5;
/** Short, bounded delays for retries that happen only inside the live process. */
export const SOURCE_PROCESSING_RETRY_DELAYS_MS = [250, 1_000] as const;

export type SourceProcessCompletionInput = {
  sourceId: string;
  actor: User;
  processedAt: string;
  extraction?: SourceExtractionResult;
  extractionError?: string;
};

export type SourceProcessCompletionOutput = {
  drafts: ExtractionDraft[];
  updatedAsset?: SourceAsset;
};

export type SourceProcessingTransientReason =
  "dns_temporary" | "network_refused" | "network_reset" | "provider_rate_limited" | "provider_unavailable" | "timeout";

type UpdateState = (updater: (state: AppState) => AppState) => Promise<AppState>;

type SourceProcessingRetryInput = {
  sourceId: string;
  actor: User;
  at: string;
  delayMs: number;
  reason: SourceProcessingTransientReason;
};

type SourceProcessingRetryOutput = {
  recorded: boolean;
  processingAttempts?: number;
};

export type SourceProcessingRetryControllerOptions = {
  sourceId: string;
  actor: User;
  updateState: UpdateState;
  now?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  delaysMs?: readonly number[];
};

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Returns a deliberately narrow retry category. Validation, unsupported
 * formats, auth failures, invalid model output, and other permanent errors are
 * never retried.
 */
export function transientSourceProcessingReason(error: unknown): SourceProcessingTransientReason | undefined {
  const details =
    error && typeof error === "object"
      ? (error as { code?: unknown; name?: unknown; status?: unknown; statusCode?: unknown })
      : undefined;
  const name = typeof details?.name === "string" ? details.name.toLowerCase() : "";
  const code = typeof details?.code === "string" ? details.code.toUpperCase() : "";
  const statusValue = details?.status ?? details?.statusCode;
  const status = typeof statusValue === "number" ? statusValue : undefined;
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  if (name === "aborterror" || status === 408 || /\b(?:timed? out|timeout)\b/.test(message)) return "timeout";
  if (status === 429 || /\bstatus 429\b|\brate limit(?:ed)?\b/.test(message)) return "provider_rate_limited";
  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /\bstatus (?:502|503|504)\b|\bservice unavailable\b|\bbad gateway\b|\bgateway timeout\b/.test(message)
  )
    return "provider_unavailable";
  if (code === "EAI_AGAIN" || message.includes("eai_again")) return "dns_temporary";
  if (code === "ECONNRESET" || code === "EPIPE" || /\beconnreset\b|\bsocket hang up\b|\bbroken pipe\b/.test(message)) {
    return "network_reset";
  }
  if (code === "ECONNREFUSED" || message.includes("econnrefused")) return "network_refused";
  return undefined;
}

/** Pure state transition used before sleeping for an in-process retry. */
export function applySourceProcessingRetry(
  state: AppState,
  input: SourceProcessingRetryInput,
  output: SourceProcessingRetryOutput
): AppState {
  const stored = state.sourceAssets.find((item) => item.id === input.sourceId);
  if (!stored || stored.status !== "processing") return state;

  const currentAttempts = stored.processingAttempts ?? 0;
  if (currentAttempts >= MAX_SOURCE_PROCESSING_ATTEMPTS) return state;

  const processingAttempts = currentAttempts + 1;
  const updatedAsset: SourceAsset = {
    ...stored,
    processingAttempts,
    processingHeartbeatAt: input.at
  };
  output.recorded = true;
  output.processingAttempts = processingAttempts;

  return appendAuditEvent(
    {
      ...state,
      sourceAssets: state.sourceAssets.map((item) => (item.id === input.sourceId ? updatedAsset : item))
    },
    {
      actor: input.actor,
      at: input.at,
      action: "source_asset.process_retry_scheduled",
      entityType: "source_asset",
      entityId: stored.id,
      languageId: stored.languageId,
      summary: `Retrying a transient processing failure for source "${stored.title}".`,
      metadata: {
        delayMs: input.delayMs,
        processingAttempts,
        reason: input.reason
      }
    }
  );
}

/** Each accepted retry is persisted and audited before the bounded sleep. */
export function createSourceProcessingRetryController(
  options: SourceProcessingRetryControllerOptions
): (error: unknown) => Promise<boolean> {
  const delaysMs = options.delaysMs ?? SOURCE_PROCESSING_RETRY_DELAYS_MS;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  let retryIndex = 0;

  return async (error: unknown) => {
    const reason = transientSourceProcessingReason(error);
    const delayMs = delaysMs[retryIndex];
    if (!reason || delayMs === undefined) return false;

    const output: SourceProcessingRetryOutput = { recorded: false };
    const at = new Date(now()).toISOString();
    await options.updateState((state) =>
      applySourceProcessingRetry(
        state,
        {
          sourceId: options.sourceId,
          actor: options.actor,
          at,
          delayMs,
          reason
        },
        output
      )
    );
    if (!output.recorded) return false;

    retryIndex += 1;
    await sleep(delayMs);
    return true;
  };
}

/** Retries whole extraction only when a transient failure escapes its provider call. */
export async function runSourceExtractionWithRetries<T>(
  extraction: (onTransientFailure: (error: unknown) => Promise<boolean>) => Promise<T>,
  onTransientFailure: (error: unknown) => Promise<boolean>
): Promise<T> {
  while (true) {
    try {
      return await extraction(onTransientFailure);
    } catch (error) {
      if (await onTransientFailure(error)) continue;
      throw error;
    }
  }
}

function normalizedIdentityText(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toLocaleLowerCase("en") ?? "";
}

/** Matches the product's duplicate semantics for pending extraction drafts. */
export function extractionDraftIdentity(kind: ExtractionDraft["kind"], payload: ExtractionDraftPayload): string {
  if (kind === "lexeme") {
    return `lexeme:${normalizedIdentityText(payload.form)}::${normalizedIdentityText(payload.gloss)}`;
  }
  if (kind === "corpus_passage") {
    return `corpus_passage:${normalizedIdentityText(payload.textTarget)}`;
  }
  return `grammar_note:${normalizedIdentityText(payload.topic)}`;
}

/**
 * Applies one source extraction result atomically. Existing equivalent
 * proposals are reused; reviewed equivalents remain historical decisions and
 * are not silently proposed again.
 */
export function applySourceProcessCompletion(
  state: AppState,
  input: SourceProcessCompletionInput,
  output: SourceProcessCompletionOutput
): AppState {
  const { sourceId, actor, processedAt, extraction, extractionError } = input;
  const stored = state.sourceAssets.find((item) => item.id === sourceId);
  if (!stored) return state;
  if (stored.status !== "processing") {
    output.updatedAsset = stored;
    return state;
  }

  if (!extraction) {
    const failedAsset: SourceAsset = {
      ...stored,
      status: "failed",
      error: extractionError ?? "Source processing failed.",
      processedAt,
      processingStartedAt: undefined,
      processingHeartbeatAt: undefined
    };
    output.updatedAsset = failedAsset;
    return appendAuditEvent(
      {
        ...state,
        sourceAssets: state.sourceAssets.map((item) => (item.id === sourceId ? failedAsset : item))
      },
      {
        actor,
        at: processedAt,
        action: "source_asset.process_failed",
        entityType: "source_asset",
        entityId: sourceId,
        languageId: stored.languageId,
        summary: `Processing failed for source "${stored.title}".`,
        metadata: { reason: extractionError ?? "unknown" }
      }
    );
  }

  output.drafts = [];
  const newDrafts: ExtractionDraft[] = [];
  const draftsByIdentity = new Map<string, ExtractionDraft[]>();
  for (const draft of state.extractionDrafts) {
    if (draft.sourceAssetId !== stored.id) continue;
    const identity = extractionDraftIdentity(draft.kind, draft.payload);
    const matches = draftsByIdentity.get(identity) ?? [];
    matches.push(draft);
    draftsByIdentity.set(identity, matches);
  }

  const redundantProposedDraftIds = new Set<string>();
  for (const matches of draftsByIdentity.values()) {
    const proposed = matches.filter((draft) => draft.status === "proposed");
    for (const duplicate of proposed.slice(1)) {
      redundantProposedDraftIds.add(duplicate.id);
    }
  }

  let reusedDraftCount = 0;
  let skippedReviewedDraftCount = 0;
  for (const candidate of extraction.candidates) {
    const identity = extractionDraftIdentity(candidate.kind, candidate.payload);
    const matches = draftsByIdentity.get(identity) ?? [];
    const proposed = matches.find((draft) => draft.status === "proposed");
    if (proposed) {
      if (!output.drafts.some((draft) => draft.id === proposed.id)) {
        output.drafts.push(proposed);
        reusedDraftCount += 1;
      }
      continue;
    }
    if (matches.length > 0) {
      skippedReviewedDraftCount += 1;
      continue;
    }

    const draft: ExtractionDraft = {
      id: `draft-${randomUUID()}`,
      languageId: stored.languageId,
      sourceAssetId: stored.id,
      kind: candidate.kind,
      payload: candidate.payload,
      confidence: candidate.confidence,
      rationale: candidate.rationale,
      status: "proposed",
      createdAt: processedAt
    };
    newDrafts.push(draft);
    output.drafts.push(draft);
    draftsByIdentity.set(identity, [draft]);
  }

  const updatedAsset: SourceAsset = {
    ...stored,
    status: "processed",
    error: undefined,
    summary: extraction.summary,
    transcript: extraction.transcript ?? stored.transcript,
    warnings: extraction.warnings.length > 0 ? extraction.warnings : undefined,
    processedAt,
    processingStartedAt: undefined,
    processingHeartbeatAt: undefined,
    processingAttempts: undefined
  };
  output.updatedAsset = updatedAsset;

  return appendAuditEvent(
    {
      ...state,
      sourceAssets: state.sourceAssets.map((item) => (item.id === sourceId ? updatedAsset : item)),
      extractionDrafts: [
        ...state.extractionDrafts.filter((draft) => !redundantProposedDraftIds.has(draft.id)),
        ...newDrafts
      ]
    },
    {
      actor,
      at: processedAt,
      action: "source_asset.processed",
      entityType: "source_asset",
      entityId: sourceId,
      languageId: stored.languageId,
      summary: `Processed source "${stored.title}" into ${output.drafts.length} extraction drafts.`,
      metadata: {
        draftCount: output.drafts.length,
        candidateCount: extraction.candidates.length,
        createdDraftCount: newDrafts.length,
        removedDuplicateDraftCount: redundantProposedDraftIds.size,
        reusedDraftCount,
        skippedReviewedDraftCount,
        warningCount: extraction.warnings.length
      }
    }
  );
}
