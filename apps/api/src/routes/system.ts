import type { FastifyInstance } from "fastify";
import { createReadinessReport } from "../readiness.js";
import {
  expireStalePrototypeSessionCookie,
  refreshPrototypeSessionCookie,
  resolveActorContext
} from "../routeHelpers.js";
import type { RouteContext } from "./context.js";

const PROBE_CACHE_CONTROL = "no-store, max-age=0";

export function registerSystemRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, authToken, prototypeSessions, jobQueue, recoveryMetrics } = ctx;

  app.get("/health", async (_request, reply) => {
    // Liveness must stay cheap and independent of storage/queue readiness.
    reply.header("Cache-Control", PROBE_CACHE_CONTROL);
    reply.header("Pragma", "no-cache");
    return { ok: true };
  });

  app.get("/users/me", async (request, reply) => {
    const state = await readState();
    const resolved = resolveActorContext(state, request, authToken, prototypeSessions);
    if (!resolved) {
      expireStalePrototypeSessionCookie(request, reply);
      reply.code(401);
      return { error: "Unauthorized" };
    }
    refreshPrototypeSessionCookie(reply, resolved);
    return resolved.actor;
  });

  app.get("/ready", async (_request, reply) => {
    reply.header("Cache-Control", PROBE_CACHE_CONTROL);
    reply.header("Pragma", "no-cache");
    const report = await createReadinessReport(
      readState,
      () => jobQueue.getStatus(),
      () => recoveryMetrics.startup
    );
    if (!report.ok) {
      reply.code(503);
    }
    return report;
  });
}
