import type { CorpusPassage, ElderCorrection, GovernanceRecord, Language, Note } from "@assini/db";
import type { ElderCorrectionPayload } from "@assini/api-contract";
import { actorRequest, assertOk, getJson } from "../lib/apiClient";

export type ElderContext = {
  language: Language;
  corpus: CorpusPassage[];
  notes: Note[];
  corrections: ElderCorrection[];
  governance: GovernanceRecord[];
};

export type ElderCorrectionReviewStatus = Extract<ElderCorrection["status"], "accepted" | "rejected">;
export type ElderCorrectionApplyResult = {
  correction: ElderCorrection;
  note: Note;
};

export async function fetchElderContext(languageId: string): Promise<ElderContext> {
  return getJson<ElderContext>(`/languages/${encodeURIComponent(languageId)}/elder-context`, "elder");
}

export async function submitElderCorrection(payload: ElderCorrectionPayload): Promise<ElderCorrection> {
  const response = await fetch("/api/elder/corrections", {
    method: "POST",
    ...(await actorRequest("elder", true)),
    body: JSON.stringify(payload)
  });

  await assertOk(response, "Elder correction submission failed");

  return response.json() as Promise<ElderCorrection>;
}

export async function reviewElderCorrection(
  correctionId: string,
  status: ElderCorrectionReviewStatus
): Promise<ElderCorrection> {
  const response = await fetch(`/api/elder/corrections/${encodeURIComponent(correctionId)}/review`, {
    method: "PATCH",
    ...(await actorRequest("elder", true)),
    body: JSON.stringify({ status })
  });

  await assertOk(response, "Elder correction review failed");

  return response.json() as Promise<ElderCorrection>;
}

export async function applyElderCorrection(
  correctionId: string,
  explanation: string
): Promise<ElderCorrectionApplyResult> {
  const response = await fetch(`/api/elder/corrections/${encodeURIComponent(correctionId)}/apply`, {
    method: "PATCH",
    ...(await actorRequest("elder", true)),
    body: JSON.stringify({ explanation })
  });

  await assertOk(response, "Elder correction apply failed");

  return response.json() as Promise<ElderCorrectionApplyResult>;
}
