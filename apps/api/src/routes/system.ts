import type { FastifyInstance } from "fastify";
import { createReadinessReport } from "../readiness.js";
import { resolveActor } from "../routeHelpers.js";
import type { RouteContext } from "./context.js";

export function registerSystemRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, authToken, prototypeSessions, jobQueue } = ctx;

  app.get("/health", async () => ({ ok: true }));

  app.get("/users/me", async (request, reply) => {
    const state = await readState();
    const actor = resolveActor(state, request, authToken, prototypeSessions);
    if (!actor) {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    return actor;
  });

  app.get("/ready", async (request, reply) => {
    const report = await createReadinessReport(readState, () => jobQueue.getStatus());
    if (!report.ok) {
      reply.code(503);
    }
    return report;
  });
}
