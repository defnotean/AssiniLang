import type { FastifyInstance } from "fastify";
import { toPublicEvaluationArtifact, toPublicLanguageSnapshot } from "../publicLanguageViews.js";
import { requireActor } from "../routeHelpers.js";
import type { RouteContext } from "./context.js";

export function registerExportRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, authToken, prototypeSessions } = ctx;

  app.get("/exports/languages/:languageId/snapshot", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["reviewer", "elder", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    const snapshot = toPublicLanguageSnapshot(state, languageId);
    if (!snapshot) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    return snapshot;
  });

  app.get("/exports/evaluations/artifact", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin", "programmer"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    return toPublicEvaluationArtifact(state);
  });
}
