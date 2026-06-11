import type { FastifyInstance } from "fastify";
import { describeLlmProviderFromEnv, probeLlmProviderReachability } from "../llmProvider.js";
import { requireActor } from "../routeHelpers.js";
import type { RouteContext } from "./context.js";

export function registerLlmRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, checkRateLimit, authToken, prototypeSessions, ingestionFetch } = ctx;

  app.get("/llm/status", async () => describeLlmProviderFromEnv());

  app.post("/llm/health-check", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["programmer", "admin", "lead"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    return probeLlmProviderReachability({ env: process.env, fetchFn: ingestionFetch });
  });
}
