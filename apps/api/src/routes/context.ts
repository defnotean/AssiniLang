import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppState, User } from "@assini/db";
import type { JobQueue } from "../jobQueue.js";
import type { LlmProvider } from "../llmProvider.js";
import type { PrototypeSessionMap } from "../routeHelpers.js";

/**
 * Shared dependencies handed to every domain route module. Built once in
 * createServer() so all modules observe the same state accessors, auth
 * configuration, rate limiter, and provider instances.
 */
export type RouteContext = {
  readState: () => Promise<AppState>;
  updateState: (updater: (state: AppState) => AppState) => Promise<AppState>;
  checkRateLimit: (request: FastifyRequest, reply: FastifyReply, actor: User | undefined) => boolean;
  authToken: string | undefined;
  prototypeSessions: PrototypeSessionMap;
  enablePrototypeAuth: boolean;
  /** Session lifetime in milliseconds; default 8 hours, overridable via ASSINI_PROTOTYPE_SESSION_TTL_MS. */
  prototypeSessionTtlMs: number;
  /** Injectable clock for session lifecycle tests; defaults to Date.now. */
  now: () => number;
  llmProvider: LlmProvider;
  dataDir: string;
  ingestionFetch: typeof fetch;
  jobQueue: JobQueue;
};
