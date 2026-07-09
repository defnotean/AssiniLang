import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppState, User } from "@assini/db";
import type { JobQueue } from "../jobQueue.js";
import type { LlmProvider } from "../llmProvider.js";
import type { PrototypeSessionMap } from "../routeHelpers.js";

export type RequestStatusClass = "1xx" | "2xx" | "3xx" | "4xx" | "5xx";

export type RequestMetrics = {
  startedAtMs: number;
  requests: {
    total: number;
    byStatusClass: Record<RequestStatusClass, number>;
  };
};

/**
 * Shared dependencies handed to every domain route module. Built once in
 * createServer() so all modules observe the same state accessors, auth
 * configuration, rate limiter, and provider instances.
 */
export type RouteContext = {
  readState: () => Promise<AppState>;
  updateState: (updater: (state: AppState) => AppState) => Promise<AppState>;
  /**
   * Returns an error body when the request is blocked (and sets 429 + Retry-After).
   * Returns undefined when the request is allowed.
   */
  checkRateLimit: (
    request: FastifyRequest,
    reply: FastifyReply,
    actor: User | undefined
  ) => { error: string; i18nKey: string; i18nParams?: Record<string, number> } | undefined;
  authToken: string | undefined;
  prototypeSessions: PrototypeSessionMap;
  enablePrototypeAuth: boolean;
  /** Session sliding TTL in milliseconds; default 8 hours, overridable via ASSINI_PROTOTYPE_SESSION_TTL_MS. */
  prototypeSessionTtlMs: number;
  /** Absolute max age from createdAt; sliding renewal cannot exceed this. */
  prototypeSessionAbsoluteMaxMs: number;
  /** Injectable clock for session lifecycle tests; defaults to Date.now. */
  now: () => number;
  llmProvider: LlmProvider;
  dataDir: string;
  ingestionFetch: typeof fetch;
  settingsPath: string;
  reloadLlmProvider?: () => void;
  jobQueue: JobQueue;
  requestMetrics: RequestMetrics;
};
