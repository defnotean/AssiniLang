import type { FastifyInstance } from "fastify";
import { createAiSessionPayloadSchema } from "@assini/api-contract";
import {
  AI_SESSION_MODE_ROLES,
  type AiMessage,
  type AiSession,
  type AiSessionMode,
  type AppState,
  type User
} from "@assini/db";
import { buildLlmGenerationInputFromState, type LlmGenerationResult } from "../llmProvider.js";
import {
  appendAuditEvent,
  buildNeuralMap,
  redactErrorSecrets,
  requireActor,
  sanitizeNeuralMapForActor,
  type NeuralMapResponse
} from "../routeHelpers.js";
import type { RouteContext } from "./context.js";

type AiSessionBody = {
  languageId: string;
  mode: AiSessionMode;
  seedPrompt: string;
  contextNoteIds: string[];
  contextPassageIds: string[];
};

type AiMessageBody = {
  content: string;
};

type PublicAiSession = AiSession;

const AI_SESSION_MODES: AiSessionMode[] = ["learner_practice", "elder_review", "programmer_debug"];

function llmGenerationErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "LLM generation failed";

  const detail = error.message.trim().replace(/\s+/g, " ");
  if (!detail.startsWith("LLM provider ")) {
    return "LLM generation failed";
  }

  return `LLM generation failed: ${redactErrorSecrets(detail).slice(0, 500)}`;
}

function toPublicAiSession(session: AiSession, actor: User): PublicAiSession {
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

function parseAiSessionBody(input: unknown): AiSessionBody | undefined {
  const result = createAiSessionPayloadSchema.safeParse(input);
  return result.success ? (result.data as AiSessionBody) : undefined;
}

function parseAiMessageBody(input: unknown): AiMessageBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  return content.length > 0 ? { content } : undefined;
}

function canReadAiSession(session: AiSession, actor: User): boolean {
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

function buildThinkingSummary(state: AppState, languageId: string, mode: AiSessionMode): string {
  const notes = state.notes.filter((note) => note.languageId === languageId);
  const corpusCount = state.corpus.filter((passage) => passage.languageId === languageId).length;
  const exerciseCount = state.exercises.filter((exercise) => exercise.languageId === languageId).length;
  const approvedCount = notes.filter((note) => note.status === "approved").length;
  return `Safe reasoning summary: ${mode.replace(/_/g, " ")} used ${corpusCount} corpus passages, ${notes.length} notes (${approvedCount} approved), and ${exerciseCount} exercises. This is an observable trace, not hidden chain-of-thought.`;
}

function buildTraceWarnings(baseWarning: string, generationWarnings: string[]): string[] {
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

function buildAiSession(
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

function buildFailedAiSession(
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

function markAiSessionGenerationFailed(
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

function validateAiSessionContext(state: AppState, body: AiSessionBody): string | undefined {
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

export function registerAiSessionRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, updateState, checkRateLimit, authToken, prototypeSessions, llmProvider } = ctx;

  app.post("/ai/sessions", async (request, reply) => {
    const body = parseAiSessionBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid AI session body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, AI_SESSION_MODE_ROLES[body.mode]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    if (!current.languages.some((language) => language.id === body.languageId)) {
      reply.code(404);
      return { error: `Language not found: ${body.languageId}` };
    }

    const contextError = validateAiSessionContext(current, body);
    if (contextError) {
      reply.code(400);
      return { error: contextError };
    }

    let generation: LlmGenerationResult;
    try {
      generation = await llmProvider.generateAssistantMessage(buildLlmGenerationInputFromState(current, {
        languageId: body.languageId,
        mode: body.mode,
        prompt: body.seedPrompt,
        contextNoteIds: body.contextNoteIds,
        contextPassageIds: body.contextPassageIds
      }));
    } catch (error) {
      const failureMessage = llmGenerationErrorMessage(error);
      await updateState((state) => {
        const now = new Date().toISOString();
        const failedSession = buildFailedAiSession(state, body, actor, now, failureMessage);
        return appendAuditEvent({
          ...state,
          aiSessions: [...state.aiSessions, failedSession]
        }, {
          actor,
          at: now,
          action: "ai_session.failed",
          entityType: "ai_session",
          entityId: failedSession.id,
          languageId: failedSession.languageId,
          summary: "Stored failed AI session attempt with sanitized diagnostics.",
          metadata: {
            mode: failedSession.mode,
            contextNoteCount: failedSession.contextNoteIds.length,
            contextPassageCount: failedSession.contextPassageIds.length
          }
        });
      });
      reply.code(502);
      return { error: failureMessage };
    }

    let session: AiSession | undefined;
    await updateState((state) => {
      const now = new Date().toISOString();
      session = buildAiSession(state, body, actor, now, generation);
      return appendAuditEvent({
        ...state,
        aiSessions: [...state.aiSessions, session as AiSession]
      }, {
        actor,
        at: now,
        action: "ai_session.created",
        entityType: "ai_session",
        entityId: session.id,
        languageId: session.languageId,
        summary: `Created ${session.mode.replace(/_/g, " ")} AI session.`,
        metadata: {
          mode: session.mode,
          status: session.status,
          contextNoteCount: session.contextNoteIds.length,
          contextPassageCount: session.contextPassageIds.length
        }
      });
    });

    reply.code(201);
    return toPublicAiSession(session as AiSession, actor);
  });

  app.get("/ai/sessions/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions);
    if (!actor) return { error: "Unauthorized" };

    const session = state.aiSessions.find((item) => item.id === sessionId);
    if (!session) {
      reply.code(404);
      return { error: `AI session not found: ${sessionId}` };
    }

    if (!canReadAiSession(session, actor)) {
      reply.code(403);
      return { error: "Forbidden" };
    }

    return toPublicAiSession(session, actor);
  });

  app.post("/ai/sessions/:sessionId/messages", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = parseAiMessageBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid AI message body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions);
    if (!actor) return { error: "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    const currentSession = current.aiSessions.find((item) => item.id === sessionId);
    if (!currentSession) {
      reply.code(404);
      return { error: `AI session not found: ${sessionId}` };
    }

    if (currentSession.createdBy !== actor.id && actor.role !== "admin") {
      reply.code(403);
      return { error: "Forbidden" };
    }

    let generation: LlmGenerationResult;
    try {
      generation = await llmProvider.generateAssistantMessage(buildLlmGenerationInputFromState(current, {
        languageId: currentSession.languageId,
        mode: currentSession.mode,
        prompt: body.content,
        contextNoteIds: currentSession.contextNoteIds,
        contextPassageIds: currentSession.contextPassageIds,
        previousMessages: currentSession.messages
      }));
    } catch (error) {
      const failureMessage = llmGenerationErrorMessage(error);
      await updateState((state) => {
        const now = new Date().toISOString();
        const failedSession = state.aiSessions.find((session) => session.id === sessionId);
        const failedMessageIndex = (failedSession?.messages.length ?? 0) + 1;
        const nextSessions = state.aiSessions.map((session) => (
          session.id === sessionId
            ? markAiSessionGenerationFailed(session, actor, body.content, now, failureMessage)
            : session
        ));
        return appendAuditEvent({
          ...state,
          aiSessions: nextSessions
        }, {
          actor,
          at: now,
          action: "ai_message.failed",
          entityType: "ai_message",
          entityId: `${sessionId}-failed-message-${failedMessageIndex}`,
          languageId: failedSession?.languageId ?? null,
          summary: "Stored failed AI follow-up attempt with sanitized diagnostics.",
          metadata: {
            sessionId,
            mode: failedSession?.mode ?? "unknown"
          }
        });
      });
      reply.code(502);
      return { error: failureMessage };
    }

    let updatedSession: AiSession | undefined;
    await updateState((state) => {
      const session = state.aiSessions.find((item) => item.id === sessionId);
      if (!session) return state;

      const now = new Date().toISOString();
      const nextMessages: AiMessage[] = [
        ...session.messages,
        {
          id: `${session.id}-message-${session.messages.length + 1}`,
          role: "user",
          content: body.content,
          createdAt: now,
          createdBy: actor.id
        },
        {
          id: `${session.id}-message-${session.messages.length + 2}`,
          role: "assistant",
          content: generation.content,
          createdAt: now,
          createdBy: "local-ai"
        }
      ];

      updatedSession = {
        ...session,
        updatedAt: now,
        messages: nextMessages,
        trace: [
          ...session.trace,
          {
            id: `${session.id}-trace-message-${nextMessages.length}`,
            kind: "generation",
            label: "Follow-up response",
            summary: "Appended a new user input and safe model output.",
            referencedIds: [],
            warnings: buildTraceWarnings("No hidden chain-of-thought exposed.", generation.warnings)
          }
        ]
      };

      return appendAuditEvent({
        ...state,
        aiSessions: state.aiSessions.map((item) => (item.id === sessionId ? updatedSession as AiSession : item))
      }, {
        actor,
        at: now,
        action: "ai_message.created",
        entityType: "ai_message",
        entityId: nextMessages[nextMessages.length - 2].id,
        languageId: session.languageId,
        summary: "Appended AI session follow-up message and response.",
        metadata: {
          sessionId: session.id,
          mode: session.mode,
          messageCount: nextMessages.length
        }
      });
    });

    return toPublicAiSession(updatedSession as AiSession, actor);
  });
}
