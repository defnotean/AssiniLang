import type { FastifyInstance } from "fastify";
import { createAiSessionPayloadSchema } from "@assini/api-contract";
import {
  AI_SESSION_MODE_ROLES,
  type AiMessage,
  type AiSession
} from "@assini/db";
import { buildLlmGenerationInputFromState, type LlmGenerationResult } from "../llmProvider.js";
import {
  appendAuditEvent,
  requireActor
} from "../routeHelpers.js";
import {
  buildAiSession,
  buildFailedAiSession,
  buildTraceWarnings,
  canReadAiSession,
  llmGenerationErrorMessage,
  markAiSessionGenerationFailed,
  toPublicAiSession,
  validateAiSessionContext,
  type AiSessionBody
} from "./aiSessionHelpers.js";
import type { RouteContext } from "./context.js";
import { parseSchemaBody } from "./requestBody.js";

type AiMessageBody = {
  content: string;
};

function parseAiSessionBody(input: unknown): AiSessionBody | undefined {
  return parseSchemaBody(createAiSessionPayloadSchema, input);
}

function parseAiMessageBody(input: unknown): AiMessageBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  return content.length > 0 ? { content } : undefined;
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
