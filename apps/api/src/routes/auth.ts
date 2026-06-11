import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { UserRole } from "@assini/db";
import {
  actorById,
  actorCan,
  cookieValue,
  PROTOTYPE_SESSION_COOKIE,
  pruneExpiredPrototypeSessions,
  serializeExpiredPrototypeSessionCookie,
  serializePrototypeSessionCookie
} from "../routeHelpers.js";
import type { RouteContext } from "./context.js";

const PROTOTYPE_AUTH_ROLES: readonly UserRole[] = ["learner", "elder", "programmer", "reviewer"];

type PrototypeSessionBody = {
  userId: string;
};

function parsePrototypeSessionBody(input: unknown): PrototypeSessionBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  if (typeof body.userId !== "string") {
    return undefined;
  }

  const userId = body.userId.trim();
  return userId.length > 0 ? { userId } : undefined;
}

export function registerAuthRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, enablePrototypeAuth, prototypeSessions, prototypeSessionTtlMs, now } = ctx;

  app.post("/auth/prototype-session", async (request, reply) => {
    if (!enablePrototypeAuth) {
      reply.code(404);
      return { error: "Prototype auth is disabled" };
    }

    const body = parsePrototypeSessionBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid prototype session body" };
    }

    const state = await readState();
    // Opportunistic eviction sweep: keeps the map bounded without a timer.
    pruneExpiredPrototypeSessions(prototypeSessions, now());
    const actor = actorById(state, body.userId);
    if (!actor || !actorCan(actor, PROTOTYPE_AUTH_ROLES)) {
      reply.code(403);
      return { error: "Forbidden" };
    }

    const sessionId = randomUUID();
    const createdAt = now();
    prototypeSessions.set(sessionId, {
      userId: actor.id,
      createdAt,
      expiresAt: createdAt + prototypeSessionTtlMs,
      ttlMs: prototypeSessionTtlMs
    });
    reply.header("Set-Cookie", serializePrototypeSessionCookie(sessionId, Math.ceil(prototypeSessionTtlMs / 1000)));
    return actor;
  });

  app.delete("/auth/prototype-session", async (request, reply) => {
    if (!enablePrototypeAuth) {
      reply.code(404);
      return { error: "Prototype auth is disabled" };
    }

    const sessionId = cookieValue(request, PROTOTYPE_SESSION_COOKIE);
    if (sessionId) {
      prototypeSessions.delete(sessionId);
    }

    reply.header("Set-Cookie", serializeExpiredPrototypeSessionCookie());
    return reply.code(204).send();
  });
}
