import type { FastifyInstance } from "fastify";
import { buildNeuralMap, requireActor, sanitizeNeuralMapForActor } from "../routeHelpers.js";
import type { RouteContext } from "./context.js";

export function registerObservabilityRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, authToken, prototypeSessions } = ctx;

  app.get("/observability/ai-sessions", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["programmer", "admin", "lead"]);
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
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["programmer", "admin", "lead"]);
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
