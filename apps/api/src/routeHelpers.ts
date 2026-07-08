import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  PROTOTYPE_SESSION_COOKIE,
  isPrototypeSessionActive,
  type PrototypeSessionMap,
  type PrototypeSessionRecord
} from "./prototypeSessions.js";
import {
  LOCAL_PROTOTYPE_USERS,
  type AuditEvent,
  type AppState,
  type NeuralMap,
  type User,
  type UserRole
} from "@assini/db";

export const MODEL_REQUIRED_MESSAGE =
  "A configured model is required to generate draft notes. Set ASSINI_LLM_* (see the configuration reference) and retry.";

export { parseStringArray } from "./parseArrays.js";
export {
  DEFAULT_PROTOTYPE_SESSION_TTL_MS,
  PROTOTYPE_SESSION_COOKIE,
  PROTOTYPE_SESSION_MAX_AGE_SECONDS,
  PROTOTYPE_SESSION_TTL_ENV_NAME,
  isPrototypeSessionActive,
  pruneExpiredPrototypeSessions,
  readPrototypeSessionTtlMs,
  serializeExpiredPrototypeSessionCookie,
  serializePrototypeSessionCookie
} from "./prototypeSessions.js";
export type { PrototypeSessionMap, PrototypeSessionRecord } from "./prototypeSessions.js";
export { redactConfiguredSecrets, redactErrorSecrets } from "./secretRedaction.js";
export {
  corpusPhonologyValidationError,
  corpusTargetContainsSurface,
  firstDuplicateNormalizedValue,
  normalizeAuthoredAnswer
} from "./corpusValidation.js";

export type ResolvedActor = {
  actor: User;
  authMethod: "prototype-session" | "server-token";
};

export type NeuralMapResponse = NeuralMap & {
  languageId: string;
};

export type AuditEventDraft = {
  actor: User;
  at?: string;
  action: string;
  entityType: AuditEvent["entityType"];
  entityId: string;
  languageId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
};

export function buildAuditEvent(state: AppState, draft: AuditEventDraft, offset: number): AuditEvent {
  return {
    id: `audit-${state.auditEvents.length + offset + 1}-${randomUUID()}`,
    at: draft.at ?? new Date().toISOString(),
    actorId: draft.actor.id,
    actorRole: draft.actor.role,
    action: draft.action,
    entityType: draft.entityType,
    entityId: draft.entityId,
    languageId: draft.languageId ?? null,
    summary: draft.summary,
    metadata: draft.metadata ?? {}
  };
}

export function appendAuditEvents(state: AppState, drafts: AuditEventDraft[]): AppState {
  if (drafts.length === 0) return state;
  const auditEvents = drafts.map((draft, index) => buildAuditEvent(state, draft, index));
  return {
    ...state,
    auditEvents: [...state.auditEvents, ...auditEvents]
  };
}

export function appendAuditEvent(state: AppState, draft: AuditEventDraft): AppState {
  return appendAuditEvents(state, [draft]);
}

export function sanitizeNeuralMapForActor(neuralMap: NeuralMap, actor: User): NeuralMap {
  const correctionNodeIds = new Set(
    neuralMap.nodes.filter((node) => node.type === "elder_correction").map((node) => node.id)
  );

  if (actor.role === "learner" || actor.role === "reviewer") {
    return {
      nodes: neuralMap.nodes.filter((node) => !correctionNodeIds.has(node.id)),
      edges: neuralMap.edges.filter((edge) => !correctionNodeIds.has(edge.source) && !correctionNodeIds.has(edge.target))
    };
  }

  if (actor.role === "programmer") {
    return {
      nodes: neuralMap.nodes.map((node) => (
        node.type === "elder_correction"
          ? { ...node, label: "Elder correction (redacted)", metadata: { ...node.metadata, redacted: true } }
          : node
      )),
      edges: neuralMap.edges
    };
  }

  return neuralMap;
}

export function getHeaderValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}

export function getBearerToken(request: FastifyRequest): string | undefined {
  const authorization = getHeaderValue(request, "authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : undefined;
}

export function usersForState(state: AppState): User[] {
  return state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
}

export function actorById(state: AppState, userId: string | undefined): User | undefined {
  if (!userId) return undefined;
  return usersForState(state).find((user) => user.id === userId);
}

export function cookieValue(request: FastifyRequest, name: string): string | undefined {
  const cookieHeader = getHeaderValue(request, "cookie");
  if (!cookieHeader) return undefined;

  for (const rawCookie of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = rawCookie.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rawValueParts.join("="));
    }
  }

  return undefined;
}

export function resolveActorContext(
  state: AppState,
  request: FastifyRequest,
  authToken: string | undefined,
  prototypeSessions: PrototypeSessionMap,
  now?: () => number
): ResolvedActor | undefined {
  const sessionId = cookieValue(request, PROTOTYPE_SESSION_COOKIE);
  const prototypeSession = sessionId ? prototypeSessions.get(sessionId) : undefined;
  if (sessionId && prototypeSession) {
    const currentTime = (now ?? prototypeSessions.now ?? Date.now)();
    if (!isPrototypeSessionActive(prototypeSession, currentTime)) {
      // Lazy eviction: expired sessions are treated as absent and removed.
      prototypeSessions.delete(sessionId);
    } else {
      const sessionActor = actorById(state, prototypeSession.userId);
      if (sessionActor) {
        // Sliding renewal: each successful use within the TTL extends the deadline.
        prototypeSession.expiresAt = currentTime + prototypeSession.ttlMs;
        return { actor: sessionActor, authMethod: "prototype-session" };
      }
    }
  }

  const requestedUserId = getHeaderValue(request, "x-assini-user-id");
  const suppliedToken = getHeaderValue(request, "x-assini-dev-token") ?? getBearerToken(request);

  if (!authToken || !requestedUserId || suppliedToken !== authToken) {
    return undefined;
  }

  const tokenActor = actorById(state, requestedUserId);
  return tokenActor ? { actor: tokenActor, authMethod: "server-token" } : undefined;
}

export function resolveActor(
  state: AppState,
  request: FastifyRequest,
  authToken: string | undefined,
  prototypeSessions: PrototypeSessionMap,
  now?: () => number
): User | undefined {
  return resolveActorContext(state, request, authToken, prototypeSessions, now)?.actor;
}

export function actorCan(actor: User, allowedRoles: readonly UserRole[]): boolean {
  return allowedRoles.includes(actor.role);
}

export function requireActor(
  state: AppState,
  request: FastifyRequest,
  reply: FastifyReply,
  authToken: string | undefined,
  prototypeSessions: Map<string, PrototypeSessionRecord>,
  allowedRoles?: readonly UserRole[],
  prototypeSessionAdditionalRoles: readonly UserRole[] = [],
  now?: () => number
): User | undefined {
  const resolved = resolveActorContext(state, request, authToken, prototypeSessions, now);
  if (!resolved) {
    reply.code(401);
    return undefined;
  }

  const { actor } = resolved;
  const allowedByPrimaryRole = !allowedRoles || actorCan(actor, allowedRoles);
  const allowedByPrototypeException = resolved.authMethod === "prototype-session"
    && actorCan(actor, prototypeSessionAdditionalRoles);
  if (!allowedByPrimaryRole && !allowedByPrototypeException) {
    reply.code(403);
    return undefined;
  }

  return actor;
}

export function buildNeuralMap(state: AppState, languageId: string): NeuralMapResponse {
  const language = state.languages.find((item) => item.id === languageId);
  const corpus = state.corpus.filter((passage) => passage.languageId === languageId);
  const notes = state.notes.filter((note) => note.languageId === languageId);
  const exercises = state.exercises.filter((exercise) => exercise.languageId === languageId);
  const sessions = state.aiSessions.filter((session) => session.languageId === languageId);
  const corrections = state.elderCorrections.filter((correction) => correction.languageId === languageId);

  const nodes: NeuralMap["nodes"] = [];
  const edges: NeuralMap["edges"] = [];

  if (language) {
    nodes.push({ id: `language:${language.id}`, type: "language", label: language.name, metadata: { typology: language.typology } });
  }

  for (const passage of corpus) {
    nodes.push({ id: `corpus:${passage.id}`, type: "corpus", label: passage.textTarget, metadata: { source: passage.source } });
    edges.push({ source: `language:${languageId}`, target: `corpus:${passage.id}`, relation: "has_corpus", weight: 1 });
  }

  for (const note of notes) {
    nodes.push({ id: `note:${note.id}`, type: "note", label: note.topic, metadata: { status: note.status, confidence: note.confidence } });
    edges.push({ source: `language:${languageId}`, target: `note:${note.id}`, relation: "has_note", weight: note.confidence === "high" ? 1 : 0.7 });
    for (const passageId of note.evidencePassageIds) {
      edges.push({ source: `corpus:${passageId}`, target: `note:${note.id}`, relation: "uses_context", weight: 0.85 });
    }
  }

  for (const exercise of exercises) {
    nodes.push({ id: `exercise:${exercise.id}`, type: "exercise", label: exercise.prompt, metadata: { type: exercise.type } });
    edges.push({ source: `language:${languageId}`, target: `exercise:${exercise.id}`, relation: "has_exercise", weight: 0.8 });
  }

  for (const session of sessions) {
    nodes.push({ id: `ai_session:${session.id}`, type: "ai_session", label: session.mode, metadata: { status: session.status } });
    edges.push({ source: `language:${languageId}`, target: `ai_session:${session.id}`, relation: "generated", weight: 0.75 });
    for (const noteId of session.contextNoteIds) {
      edges.push({ source: `note:${noteId}`, target: `ai_session:${session.id}`, relation: "uses_context", weight: 0.7 });
    }
    for (const passageId of session.contextPassageIds) {
      edges.push({ source: `corpus:${passageId}`, target: `ai_session:${session.id}`, relation: "uses_context", weight: 0.7 });
    }
  }

  for (const correction of corrections) {
    nodes.push({ id: `elder_correction:${correction.id}`, type: "elder_correction", label: correction.correction, metadata: { severity: correction.severity, status: correction.status } });
    edges.push({
      source: correction.noteId ? `note:${correction.noteId}` : `language:${languageId}`,
      target: `elder_correction:${correction.id}`,
      relation: "proposed_correction",
      weight: correction.severity === "safety" ? 1 : 0.8
    });
  }

  return { languageId, nodes, edges };
}
