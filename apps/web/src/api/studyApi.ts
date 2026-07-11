import type { CorpusPassage, Note } from "@assini/api-contract";
import { actorJsonRequest, actorRequest, assertOk } from "../lib/apiClient";

export type CorpusImportPayload = Omit<CorpusPassage, "id" | "languageId">;
export type CorpusImportDryRunResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  preview: CorpusImportPayload | null;
};
export type ReviewNotePayload = Partial<Pick<Note, "status" | "explanation" | "examples">> & {
  reviewerComment?: string;
  dispositionAssigneeId?: string;
  dispositionDueAt?: string;
};

export type ModelDraftGroundingCheck = {
  passed: boolean;
  detail: string;
};

export type ModelDraftGrounding = {
  score: number;
  checks: {
    groundedEvidence: ModelDraftGroundingCheck;
    knownForms: ModelDraftGroundingCheck;
    topicAlignment: ModelDraftGroundingCheck;
    exampleCoverage: ModelDraftGroundingCheck;
  };
  failures: string[];
};

export type ModelDraftNote = Note & { grounding?: ModelDraftGrounding };

export async function generateDraftNotes(languageId: string): Promise<Note[]> {
  return actorJsonRequest<Note[]>(
    "reviewer",
    "/api/study-loop/draft",
    {
      method: "POST",
      body: JSON.stringify({ languageId })
    },
    "Draft generation failed"
  );
}

export async function generateModelDraftNotes(
  languageId: string
): Promise<{ notes: ModelDraftNote[]; warnings: string[]; generated: number }> {
  const response = await fetch(`/api/languages/${encodeURIComponent(languageId)}/study-loop/model-draft`, {
    method: "POST",
    ...(await actorRequest("reviewer", true))
  });
  await assertOk(response, "Model draft generation failed");
  return response.json() as Promise<{ notes: ModelDraftNote[]; warnings: string[]; generated: number }>;
}

export async function reviewNote(noteId: string, payload: ReviewNotePayload): Promise<Note> {
  const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}/review`, {
    method: "PATCH",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify(payload)
  });

  await assertOk(response, "Note review failed");

  return response.json() as Promise<Note>;
}

export async function importCorpusPassage(languageId: string, payload: CorpusImportPayload): Promise<CorpusPassage> {
  const response = await fetch(`/api/languages/${encodeURIComponent(languageId)}/corpus`, {
    method: "POST",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify(payload)
  });

  await assertOk(response, "Corpus import failed");

  return response.json() as Promise<CorpusPassage>;
}

export async function validateCorpusImport(
  languageId: string,
  payload: CorpusImportPayload
): Promise<CorpusImportDryRunResult> {
  const response = await fetch(`/api/languages/${encodeURIComponent(languageId)}/corpus?dryRun=1`, {
    method: "POST",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify(payload)
  });

  await assertOk(response, "Corpus validation failed");

  return response.json() as Promise<CorpusImportDryRunResult>;
}

export type CorpusBulkImportRowResult =
  | {
      index: number;
      ok: true;
      warnings: string[];
      passage?: CorpusPassage;
      preview?: CorpusImportPayload;
    }
  | {
      index: number;
      ok: false;
      error: string;
      i18nKey: string;
      warnings: string[];
    };

export type CorpusBulkImportResponse = {
  ok: boolean;
  dryRun: boolean;
  imported: number;
  failed: number;
  results: CorpusBulkImportRowResult[];
};

export async function importCorpusBulk(
  languageId: string,
  passages: CorpusImportPayload[]
): Promise<CorpusBulkImportResponse> {
  const response = await fetch(`/api/languages/${encodeURIComponent(languageId)}/corpus/bulk`, {
    method: "POST",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify({ passages })
  });

  await assertOk(response, "Corpus bulk import failed");

  return response.json() as Promise<CorpusBulkImportResponse>;
}

export async function validateCorpusBulk(
  languageId: string,
  passages: CorpusImportPayload[]
): Promise<CorpusBulkImportResponse> {
  const response = await fetch(`/api/languages/${encodeURIComponent(languageId)}/corpus/bulk?dryRun=1`, {
    method: "POST",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify({ passages })
  });

  await assertOk(response, "Corpus bulk validation failed");

  return response.json() as Promise<CorpusBulkImportResponse>;
}
