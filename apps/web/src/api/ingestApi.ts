import type { CorpusPassage, ExtractionDraft, Lexeme, Note, SourceAsset } from "@assini/db";
import type { SourceRegistrationPayload } from "@assini/api-contract";
import { actorRequest, assertOk, getJson } from "../lib/apiClient";

export type ProcessSourceResult = {
  asset: SourceAsset;
  drafts: ExtractionDraft[];
  warnings: string[];
};

/**
 * Read-time duplicate flag computed by the API when listing extraction
 * drafts. Never persisted; informs the reviewer without blocking review.
 */
export type ExtractionDraftDuplicate =
  | { kind: "exact"; entityId: string }
  | { kind: "form"; entityId: string }
  | { kind: "topic"; entityId: string }
  | { kind: "pending"; draftId: string };

/**
 * Read-time grounding flag computed by the API against the accepted
 * lexicon when listing extraction drafts. Advisory only; never persisted
 * and never blocks review.
 */
export type DraftGroundingFlag = {
  kind: "gloss_conflict" | "decomposable_form" | "segmentation_conflict";
  message: string;
};

export type ExtractionDraftView = ExtractionDraft & {
  duplicate?: ExtractionDraftDuplicate;
  grounding?: DraftGroundingFlag[];
};

export type AcceptExtractionDraftResult = {
  draft: ExtractionDraft;
  entity: Lexeme | CorpusPassage | Note;
};

export type BulkReviewAction = "accept" | "reject";

export type BulkReviewItemResult = {
  draftId: string;
  ok: boolean;
  error?: string;
  committedEntityId?: string;
};

export type BulkReviewExtractionDraftsResult = {
  results: BulkReviewItemResult[];
  accepted: number;
  rejected: number;
  failed: number;
};

export async function fetchSources(languageId: string): Promise<SourceAsset[]> {
  return getJson<SourceAsset[]>(`/languages/${encodeURIComponent(languageId)}/sources`);
}

export async function registerSource(languageId: string, payload: SourceRegistrationPayload): Promise<SourceAsset> {
  const response = await fetch(`/api/languages/${encodeURIComponent(languageId)}/sources`, {
    method: "POST",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify(payload)
  });

  await assertOk(response, "Source registration failed");

  return response.json() as Promise<SourceAsset>;
}

export async function uploadSourceFile(languageId: string, file: File, title?: string): Promise<SourceAsset> {
  const formData = new FormData();
  formData.append("file", file);
  const trimmedTitle = title?.trim();
  if (trimmedTitle) {
    formData.append("title", trimmedTitle);
  }

  // No manual Content-Type header: the browser sets the multipart boundary itself.
  const response = await fetch(`/api/languages/${encodeURIComponent(languageId)}/sources/upload`, {
    method: "POST",
    ...(await actorRequest("reviewer")),
    body: formData
  });

  await assertOk(response, "Source upload failed");

  return response.json() as Promise<SourceAsset>;
}

export async function processSource(
  sourceId: string,
  options?: { async?: boolean }
): Promise<ProcessSourceResult> {
  const useAsync = options?.async === true;
  const response = await fetch(`/api/sources/${encodeURIComponent(sourceId)}/process`, {
    method: "POST",
    ...(await actorRequest("reviewer", useAsync)),
    ...(useAsync ? { body: JSON.stringify({ async: true }) } : {})
  });

  await assertOk(response, "Source processing failed");

  return response.json() as Promise<ProcessSourceResult>;
}

export async function fetchExtractionDrafts(
  languageId: string,
  status?: ExtractionDraft["status"]
): Promise<ExtractionDraftView[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return getJson<ExtractionDraftView[]>(`/languages/${encodeURIComponent(languageId)}/extraction-drafts${query}`);
}

export async function acceptExtractionDraft(draftId: string): Promise<AcceptExtractionDraftResult> {
  const response = await fetch(`/api/extraction-drafts/${encodeURIComponent(draftId)}/accept`, {
    method: "POST",
    ...(await actorRequest("reviewer"))
  });

  await assertOk(response, "Extraction draft accept failed");

  return response.json() as Promise<AcceptExtractionDraftResult>;
}

export async function rejectExtractionDraft(draftId: string): Promise<ExtractionDraft> {
  const response = await fetch(`/api/extraction-drafts/${encodeURIComponent(draftId)}/reject`, {
    method: "POST",
    ...(await actorRequest("reviewer"))
  });

  await assertOk(response, "Extraction draft reject failed");

  return response.json() as Promise<ExtractionDraft>;
}

export async function bulkReviewExtractionDrafts(
  languageId: string,
  action: BulkReviewAction,
  draftIds: string[]
): Promise<BulkReviewExtractionDraftsResult> {
  const response = await fetch(`/api/languages/${encodeURIComponent(languageId)}/extraction-drafts/bulk-review`, {
    method: "POST",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify({ action, draftIds })
  });

  await assertOk(response, "Bulk extraction draft review failed");

  return response.json() as Promise<BulkReviewExtractionDraftsResult>;
}
