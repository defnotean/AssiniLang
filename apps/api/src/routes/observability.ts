import type { FastifyInstance } from "fastify";
import { createEmptyState, type AppState } from "@assini/db";
import { buildNeuralMap, requireActor, sanitizeNeuralMapForActor } from "../routeHelpers.js";
import type { RouteContext } from "./context.js";

const PRIVILEGED_OBSERVABILITY_ROLES = ["programmer", "admin", "lead"] as const;
const STORAGE_READ_FAILED = "Storage read failed";

export function registerObservabilityRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, authToken, prototypeSessions, jobQueue, requestMetrics, now } = ctx;

  app.get("/observability/metrics", async (request, reply) => {
    let state: AppState | undefined;
    try {
      state = await readState();
    } catch {
      // Keep this diagnostic endpoint safe even when persistence throws with
      // local paths or parser details. Auth falls back to the built-in local
      // prototype users, matching older empty databases.
    }

    const actor = requireActor(
      state ?? createEmptyState(),
      request,
      reply,
      authToken,
      prototypeSessions,
      PRIVILEGED_OBSERVABILITY_ROLES
    );
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    const snapshotTime = now();
    const queuedJobs = jobQueue.getPendingAndActiveIds();
    return {
      uptimeMs: Math.max(0, snapshotTime - requestMetrics.startedAtMs),
      serverTime: new Date(snapshotTime).toISOString(),
      requests: {
        total: requestMetrics.requests.total,
        byStatusClass: { ...requestMetrics.requests.byStatusClass }
      },
      jobQueue: {
        pending: queuedJobs.pending.length,
        active: queuedJobs.active.length
      },
      storage: state
        ? { ok: true, schemaVersion: state.schemaVersion }
        : { ok: false, error: STORAGE_READ_FAILED }
    };
  });

  app.get("/observability/ai-sessions", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, PRIVILEGED_OBSERVABILITY_ROLES);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    return {
      totals: {
        sessions: state.aiSessions.length,
        activeSessions: state.aiSessions.filter((session) => session.status === "active").length,
        messages: state.aiSessions.reduce((total, session) => total + session.messages.length, 0),
        elderCorrections: state.elderCorrections.length
      },
      sessions: state.aiSessions.map((session) => ({
        id: session.id,
        languageId: session.languageId,
        mode: session.mode,
        status: session.status,
        createdBy: session.createdBy,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
        contextNoteIds: session.contextNoteIds,
        contextPassageIds: session.contextPassageIds,
        thinkingSummary: session.thinkingSummary,
        privacy: session.privacy
      }))
    };
  });

  app.get("/observability/neural-map", async (request, reply) => {
    const query = request.query as { languageId?: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, PRIVILEGED_OBSERVABILITY_ROLES);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    if (!query.languageId) {
      reply.code(400);
      return { error: "Missing languageId" };
    }

    if (!state.languages.some((language) => language.id === query.languageId)) {
      reply.code(404);
      return { error: `Language not found: ${query.languageId}` };
    }

    return sanitizeNeuralMapForActor(buildNeuralMap(state, query.languageId), actor);
  });
}
