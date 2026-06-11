import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { UserRole } from "@assini/db";
import {
  actorById,
  actorCan,
  pruneExpiredPrototypeSessions,
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
  const { readState, enablePrototypeAuth, prototypeSessions } = ctx;

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
    pruneExpiredPrototypeSessions(prototypeSessions);
    const actor = actorById(state, body.userId);
    if (!actor || !actorCan(actor, PROTOTYPE_AUTH_ROLES)) {
      reply.code(403);
      return { error: "Forbidden" };
    }

    const sessionId = randomUUID();
    prototypeSessions.set(sessionId, { userId: actor.id, createdAt: Date.now() });
    reply.header("Set-Cookie", serializePrototypeSessionCookie(sessionId));
    return actor;
  });
}
