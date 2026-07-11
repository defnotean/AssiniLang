import type { AiSession, AiSessionMode, NeuralMap } from "@assini/api-contract";
import { actorRequest, assertOk, getJson, type LocalActor } from "../lib/apiClient";

export type ObservabilityData = {
  totals: {
    sessions: number;
    activeSessions: number;
    messages: number;
    elderCorrections: number;
  };
  sessions: Array<{
    id: string;
    languageId: string;
    mode: AiSessionMode;
    status: AiSession["status"];
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
    contextNoteIds: string[];
    contextPassageIds: string[];
    thinkingSummary: string;
    privacy: AiSession["privacy"];
  }>;
};

export type NeuralMapResponse = NeuralMap & {
  languageId: string;
};

export type CreateAiSessionPayload = {
  languageId: string;
  mode: AiSessionMode;
  seedPrompt: string;
  contextNoteIds: string[];
  contextPassageIds: string[];
};

function actorForAiMode(mode: AiSessionMode): LocalActor {
  if (mode === "programmer_debug") return "programmer";
  if (mode === "elder_review") return "elder";
  return "learner";
}

export async function fetchObservability(): Promise<ObservabilityData> {
  return getJson<ObservabilityData>("/observability/ai-sessions", "programmer");
}

export async function fetchNeuralMap(languageId: string): Promise<NeuralMapResponse> {
  return getJson<NeuralMapResponse>(
    `/observability/neural-map?languageId=${encodeURIComponent(languageId)}`,
    "programmer"
  );
}

export async function createAiSession(payload: CreateAiSessionPayload): Promise<AiSession> {
  const response = await fetch("/api/ai/sessions", {
    method: "POST",
    ...(await actorRequest(actorForAiMode(payload.mode), true)),
    body: JSON.stringify(payload)
  });

  await assertOk(response, "AI session creation failed");

  return response.json() as Promise<AiSession>;
}

export async function fetchAiSession(sessionId: string, actor: LocalActor = "programmer"): Promise<AiSession> {
  return getJson<AiSession>(`/ai/sessions/${encodeURIComponent(sessionId)}`, actor);
}

/**
 * Appends a follow-up message to an existing AI session. The actor must match
 * the session creator, so callers pass the session mode and we reuse the same
 * mode-to-actor convention as createAiSession.
 */
export async function continueAiSession(
  sessionId: string,
  content: string,
  mode: AiSessionMode = "learner_practice"
): Promise<AiSession> {
  const response = await fetch(`/api/ai/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    ...(await actorRequest(actorForAiMode(mode), true)),
    body: JSON.stringify({ content })
  });

  await assertOk(response, "AI session message failed");

  return response.json() as Promise<AiSession>;
}
