import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppState, User } from "@assini/db";
import type { JobQueue } from "../jobQueue.js";
import type { LlmProvider } from "../llmProvider.js";
import type { PrototypeSessionRecord } from "../routeHelpers.js";

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
  prototypeSessions: Map<string, PrototypeSessionRecord>;
  enablePrototypeAuth: boolean;
  llmProvider: LlmProvider;
  dataDir: string;
  ingestionFetch: typeof fetch;
  jobQueue: JobQueue;
};
