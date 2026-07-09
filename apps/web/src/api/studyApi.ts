import type { CorpusPassage, Note } from "@assini/db";
import { actorJsonRequest, actorRequest, assertOk } from "../lib/apiClient";

export type CorpusImportPayload = Omit<CorpusPassage, "id" | "languageId">;
export type CorpusImportDryRunResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  preview: CorpusImportPayload | null;
};
export type ReviewNotePayload = Partial<Pick<Note, "status" | "explanation">> & {
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
  return actorJsonRequest<Note[]>("reviewer", "/api/study-loop/draft", {
    method: "POST",
    body: JSON.stringify({ languageId })
  }, "Draft generation failed");
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

export async function reviewNote(
  noteId: string,
  payload: ReviewNotePayload
): Promise<Note> {
  const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}/review`, {
    method: "PATCH",
    ...(await actorRequest("reviewer", true)),
    body: JSON.stringify(payload)
  });

  await assertOk(response, "Note review failed");

  return response.json() as Promise<Note>;
}

export async function importCorpusPassage(
  languageId: string,
  payload: CorpusImportPayload
): Promise<CorpusPassage> {
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
