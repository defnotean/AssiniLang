import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { UserRole } from "@assini/db";
import { z } from "zod";
import {
  actorById,
  actorCan,
  cookieValue,
  PROTOTYPE_SESSION_COOKIE,
  pruneExpiredPrototypeSessions,
  revokePrototypeSessionsForUser,
  serializeExpiredPrototypeSessionCookie,
  serializePrototypeSessionCookie,
  usersForState
} from "../routeHelpers.js";
import type { RouteContext } from "./context.js";
import { parseSchemaBody } from "./requestBody.js";

const PROTOTYPE_AUTH_ROLES: readonly UserRole[] = ["learner", "elder", "programmer", "reviewer"];

const prototypeSessionBodySchema = z.object({
  userId: z.string().trim().min(1)
});

type PrototypeSessionBody = z.infer<typeof prototypeSessionBodySchema>;

function parsePrototypeSessionBody(input: unknown): PrototypeSessionBody | undefined {
  return parseSchemaBody(prototypeSessionBodySchema, input);
}

export function registerAuthRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const {
    readState,
    enablePrototypeAuth,
    prototypeSessions,
    prototypeSessionTtlMs,
    prototypeSessionAbsoluteMaxMs,
    now
  } = ctx;

  app.post("/auth/prototype-session", async (request, reply) => {
    if (!enablePrototypeAuth) {
      reply.code(404);
      return {
        error: "Prototype auth is disabled",
        i18nKey: "errors.prototypeAuthDisabled"
      };
    }

    const body = parsePrototypeSessionBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return {
        error: "Invalid prototype session body",
        i18nKey: "errors.invalidPrototypeSessionBody"
      };
    }

    const state = await readState();
    // Opportunistic eviction sweep: expired + orphan (missing userId) records.
    // Keeps the map bounded without a timer; matches documented create-path sweep.
    const knownUserIds = new Set(usersForState(state).map((user) => user.id));
    pruneExpiredPrototypeSessions(prototypeSessions, now(), knownUserIds);
    const actor = actorById(state, body.userId);
    if (!actor || !actorCan(actor, PROTOTYPE_AUTH_ROLES)) {
      reply.code(403);
      return {
        error: "Forbidden",
        i18nKey: "errors.prototypeAuthForbidden"
      };
    }

    const sessionId = randomUUID();
    const createdAt = now();
    // One active session per user: minting replaces prior ids (multi-tab / remint).
    revokePrototypeSessionsForUser(prototypeSessions, actor.id);
    prototypeSessions.set(sessionId, {
      userId: actor.id,
      createdAt,
      expiresAt: createdAt + prototypeSessionTtlMs,
      ttlMs: prototypeSessionTtlMs,
      absoluteMaxMs: prototypeSessionAbsoluteMaxMs
    });
    reply.header("Set-Cookie", serializePrototypeSessionCookie(sessionId, Math.ceil(prototypeSessionTtlMs / 1000)));
    return actor;
  });

  app.delete("/auth/prototype-session", async (request, reply) => {
    if (!enablePrototypeAuth) {
      reply.code(404);
      return {
        error: "Prototype auth is disabled",
        i18nKey: "errors.prototypeAuthDisabled"
      };
    }

    const sessionId = cookieValue(request, PROTOTYPE_SESSION_COOKIE);
    if (sessionId) {
      const session = prototypeSessions.get(sessionId);
      if (session) {
        // Logout invalidates every session for this user (sibling tabs / remints).
        revokePrototypeSessionsForUser(prototypeSessions, session.userId);
      } else {
        prototypeSessions.delete(sessionId);
      }
    }

    reply.header("Set-Cookie", serializeExpiredPrototypeSessionCookie());
    return reply.code(204).send();
  });
}
