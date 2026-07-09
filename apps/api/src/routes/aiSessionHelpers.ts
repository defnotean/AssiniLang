import type {
  AiMessage,
  AiSession,
  AiSessionMode,
  AppState,
  User
} from "@assini/db";
import type { LlmGenerationResult } from "../llmProvider.js";
import {
  buildNeuralMap,
  redactErrorSecrets,
  sanitizeNeuralMapForActor,
  type NeuralMapResponse
} from "../routeHelpers.js";

export type AiSessionBody = {
  languageId: string;
  mode: AiSessionMode;
  seedPrompt: string;
  contextNoteIds: string[];
  contextPassageIds: string[];
};

export type PublicAiSession = AiSession;

export function llmGenerationErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "LLM generation failed";

  const detail = error.message.trim().replace(/\s+/g, " ");
  if (!detail.startsWith("LLM provider ")) {
    return "LLM generation failed";
  }

  return `LLM generation failed: ${redactErrorSecrets(detail).slice(0, 500)}`;
}

export function toPublicAiSession(session: AiSession, actor: User): PublicAiSession {
  const canSeeActorIds = session.createdBy === actor.id || actor.role === "admin" || actor.role === "lead";

  return {
    ...session,
    createdBy: canSeeActorIds ? session.createdBy : "redacted",
    messages: session.messages.map((message) => ({
      ...message,
      content: canSeeActorIds || message.role !== "user" ? message.content : "[redacted user input]",
      createdBy: canSeeActorIds || message.createdBy === "local-ai" ? message.createdBy : "redacted"
    })),
    neuralMap: sanitizeNeuralMapForActor(session.neuralMap, actor),
    privacy: {
      redactions: Array.from(new Set([
        ...session.privacy.redactions,
        "hidden-chain-of-thought",
        "answer-keys",
        "learner-identifiers"
      ])),
      exposesHiddenChainOfThought: false
    }
  };
}

export function canReadAiSession(session: AiSession, actor: User): boolean {
  if (session.createdBy === actor.id || actor.role === "admin" || actor.role === "lead") {
    return true;
  }

  if (session.mode === "programmer_debug") {
    return actor.role === "programmer";
  }

  if (session.mode === "elder_review") {
    return actor.role === "elder";
  }

  return actor.role === "elder" || actor.role === "reviewer";
}

export function canWriteAiSessionMessage(session: AiSession, actor: User): boolean {
  if (!canReadAiSession(session, actor)) {
    return false;
  }

  return session.createdBy === actor.id || actor.role === "admin";
}

function buildThinkingSummary(state: AppState, languageId: string, mode: AiSessionMode): string {
  const notes = state.notes.filter((note) => note.languageId === languageId);
  const corpusCount = state.corpus.filter((passage) => passage.languageId === languageId).length;
  const exerciseCount = state.exercises.filter((exercise) => exercise.languageId === languageId).length;
  const approvedCount = notes.filter((note) => note.status === "approved").length;
  return `Safe reasoning summary: ${mode.replace(/_/g, " ")} used ${corpusCount} corpus passages, ${notes.length} notes (${approvedCount} approved), and ${exerciseCount} exercises. This is an observable trace, not hidden chain-of-thought.`;
}

export function buildTraceWarnings(baseWarning: string, generationWarnings: string[]): string[] {
  return Array.from(new Set([baseWarning, ...generationWarnings]));
}

function buildAiSessionNeuralMap(
  state: AppState,
  languageId: string,
  sessionId: string,
  mode: AiSessionMode,
  status: AiSession["status"]
): NeuralMapResponse {
  const neuralMap = buildNeuralMap(state, languageId);
  neuralMap.nodes.push({ id: `ai_session:${sessionId}`, type: "ai_session", label: mode, metadata: { status } });
  neuralMap.edges.push({ source: `language:${languageId}`, target: `ai_session:${sessionId}`, relation: "generated", weight: 0.75 });
  return neuralMap;
}

function buildAiSessionPrivacy(): AiSession["privacy"] {
  return {
    redactions: ["hidden-chain-of-thought", "answer-keys", "learner-identifiers"],
    exposesHiddenChainOfThought: false
  };
}

export function buildAiSession(
  state: AppState,
  body: AiSessionBody,
  actor: User,
  now: string,
  generation: LlmGenerationResult
): AiSession {
  const firstNote = state.notes.find((note) => note.languageId === body.languageId);
  const sessionId = `ai-session-${body.languageId}-${state.aiSessions.length + 1}-${now}`;

  const messages: AiMessage[] = [
    {
      id: `${sessionId}-message-1`,
      role: "user",
      content: body.seedPrompt,
      createdAt: now,
      createdBy: actor.id
    },
    {
      id: `${sessionId}-message-2`,
      role: "assistant",
      content: generation.content,
      createdAt: now,
      createdBy: "local-ai"
    }
  ];

  return {
    id: sessionId,
    languageId: body.languageId,
    mode: body.mode,
    status: "active",
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
    contextNoteIds: body.contextNoteIds,
    contextPassageIds: body.contextPassageIds,
    messages,
    thinkingSummary: buildThinkingSummary(state, body.languageId, body.mode),
    trace: [
      {
        id: `${sessionId}-trace-input`,
        kind: "input",
        label: "Input",
        summary: "Captured the user's input prompt.",
        referencedIds: [],
        warnings: []
      },
      {
        id: `${sessionId}-trace-retrieval`,
        kind: "retrieval",
        label: "Evidence selection",
        summary: "Linked selected notes and corpus passages as observable evidence.",
        referencedIds: [...body.contextNoteIds, ...body.contextPassageIds],
        warnings: []
      },
      {
        id: `${sessionId}-trace-output`,
        kind: "output",
        label: "Output",
        summary: "Generated a safe response and redacted hidden chain-of-thought.",
        referencedIds: firstNote ? [firstNote.id] : [],
        warnings: buildTraceWarnings("Hidden chain-of-thought is not exposed.", generation.warnings)
      }
    ],
    neuralMap: buildAiSessionNeuralMap(state, body.languageId, sessionId, body.mode, "active"),
    privacy: buildAiSessionPrivacy()
  };
}

export function buildFailedAiSession(
  state: AppState,
  body: AiSessionBody,
  actor: User,
  now: string,
  failureMessage: string
): AiSession {
  const sessionId = `ai-session-${body.languageId}-${state.aiSessions.length + 1}-${now}`;

  return {
    id: sessionId,
    languageId: body.languageId,
    mode: body.mode,
    status: "failed",
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
    contextNoteIds: body.contextNoteIds,
    contextPassageIds: body.contextPassageIds,
    messages: [
      {
        id: `${sessionId}-message-1`,
        role: "user",
        content: body.seedPrompt,
        createdAt: now,
        createdBy: actor.id
      }
    ],
    thinkingSummary: buildThinkingSummary(state, body.languageId, body.mode),
    trace: [
      {
        id: `${sessionId}-trace-input`,
        kind: "input",
        label: "Input",
        summary: "Captured the user's input prompt.",
        referencedIds: [],
        warnings: []
      },
      {
        id: `${sessionId}-trace-retrieval`,
        kind: "retrieval",
        label: "Evidence selection",
        summary: "Linked selected notes and corpus passages as observable evidence.",
        referencedIds: [...body.contextNoteIds, ...body.contextPassageIds],
        warnings: []
      },
      {
        id: `${sessionId}-trace-provider-failure`,
        kind: "generation",
        label: "Provider failure",
        summary: failureMessage,
        referencedIds: [...body.contextNoteIds, ...body.contextPassageIds],
        warnings: ["Hidden chain-of-thought is not exposed."]
      }
    ],
    neuralMap: buildAiSessionNeuralMap(state, body.languageId, sessionId, body.mode, "failed"),
    privacy: buildAiSessionPrivacy()
  };
}

export function markAiSessionGenerationFailed(
  session: AiSession,
  actor: User,
  content: string,
  now: string,
  failureMessage: string
): AiSession {
  const nextMessages: AiMessage[] = [
    ...session.messages,
    {
      id: `${session.id}-message-${session.messages.length + 1}`,
      role: "user",
      content,
      createdAt: now,
      createdBy: actor.id
    }
  ];

  return {
    ...session,
    status: "failed",
    updatedAt: now,
    messages: nextMessages,
    trace: [
      ...session.trace,
      {
        id: `${session.id}-trace-provider-failure-${nextMessages.length}`,
        kind: "generation",
        label: "Provider failure",
        summary: failureMessage,
        referencedIds: [...session.contextNoteIds, ...session.contextPassageIds],
        warnings: ["Hidden chain-of-thought is not exposed."]
      }
    ],
    neuralMap: {
      ...session.neuralMap,
      nodes: session.neuralMap.nodes.map((node) => (
        node.id === `ai_session:${session.id}`
          ? { ...node, metadata: { ...node.metadata, status: "failed" } }
          : node
      ))
    },
    privacy: buildAiSessionPrivacy()
  };
}

export function validateAiSessionContext(state: AppState, body: AiSessionBody): string | undefined {
  const noteIds = new Set(state.notes.filter((note) => note.languageId === body.languageId).map((note) => note.id));
  const passageIds = new Set(state.corpus.filter((passage) => passage.languageId === body.languageId).map((passage) => passage.id));

  for (const noteId of body.contextNoteIds) {
    if (!noteIds.has(noteId)) return `Context note not found for language: ${noteId}`;
  }

  for (const passageId of body.contextPassageIds) {
    if (!passageIds.has(passageId)) return `Context passage not found for language: ${passageId}`;
  }

  return undefined;
}
