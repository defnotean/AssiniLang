import { randomUUID } from "node:crypto";
import { resolve as resolvePath } from "node:path";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { JobQueue } from "./jobQueue.js";
import { recoverInterruptedSources } from "./jobRecovery.js";
import { JsonStore, type AppState, type User } from "@assini/db";
import { createLlmProviderFromEnv, type LlmProvider } from "./llmProvider.js";
import {
  readPrototypeSessionTtlMs,
  type PrototypeSessionMap,
  type PrototypeSessionRecord
} from "./routeHelpers.js";
import type { RouteContext } from "./routes/context.js";
import { registerAiSessionRoutes } from "./routes/aiSessions.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCorpusRoutes } from "./routes/corpus.js";
import { registerElderRoutes } from "./routes/elder.js";
import { registerEvaluationRoutes } from "./routes/evaluations.js";
import { registerExerciseRoutes } from "./routes/exercises.js";
import { registerExportRoutes } from "./routes/exportsRoutes.js";
import { registerExtractionDraftRoutes } from "./routes/extractionDrafts.js";
import { registerGovernanceRoutes } from "./routes/governance.js";
import { registerLanguageRoutes } from "./routes/languages.js";
import { registerLlmRoutes } from "./routes/llm.js";
import { registerNoteRoutes } from "./routes/notes.js";
import { registerObservabilityRoutes } from "./routes/observability.js";
import { registerSourceRoutes } from "./routes/sources.js";
import { registerStudyLoopRoutes } from "./routes/studyLoop.js";
import { registerSystemRoutes } from "./routes/system.js";

type RateLimitOptions = {
  max: number;
  windowMs: number;
  now?: () => number;
};

type ServerOptions = {
  store?: JsonStore;
  initialState?: AppState;
  allowedOrigins?: string[];
  bodyLimitBytes?: number;
  rateLimit?: RateLimitOptions | false;
  /** Server-only token used by tests or explicitly configured internal tools. Never bundle this into the browser. */
  authToken?: string;
  enablePrototypeAuth?: boolean;
  /** Prototype-session lifetime in ms. Defaults to ASSINI_PROTOTYPE_SESSION_TTL_MS or 8 hours. */
  prototypeSessionTtlMs?: number;
  /** Injectable clock for session lifecycle tests. */
  now?: () => number;
  llmProvider?: LlmProvider;
  /** Directory where uploaded source-asset files are stored. Defaults to ./data next to the local database. */
  dataDir?: string;
  /** Fetch implementation used for URL sources and transcription; overridable in tests. */
  ingestionFetch?: typeof fetch;
  logger?: any;
  concurrency?: number;
};

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
const TEST_ONLY_AUTH_TOKEN = "test";
const DEFAULT_RATE_LIMIT: RateLimitOptions = { max: 120, windowMs: 60_000 };
const RATE_LIMITED_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const REQUEST_ID_HEADER = "x-request-id";
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isCorsOriginAllowed(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  return origin === undefined || allowedOrigins.includes(origin);
}

function singleHeaderValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length === 1) return value[0];
  return undefined;
}

function safeRequestIdFromHeader(value: string | string[] | undefined): string | undefined {
  const requestId = singleHeaderValue(value);
  return requestId && SAFE_REQUEST_ID_PATTERN.test(requestId) ? requestId : undefined;
}

function requestIdForResponse(request: FastifyRequest): string {
  return SAFE_REQUEST_ID_PATTERN.test(request.id) ? request.id : randomUUID();
}

export function createServer(options: ServerOptions = {}) {
  const app = Fastify({
    requestIdHeader: false,
    genReqId: (request) => safeRequestIdFromHeader(request.headers[REQUEST_ID_HEADER]) ?? randomUUID(),
    logger: options.logger
      ? {
          level: "info",
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "res.headers['set-cookie']",
              "body.apiKey",
              "body.password"
            ],
            censor: "[REDACTED]"
          }
        }
      : false,
    bodyLimit: options.bodyLimitBytes ?? 64 * 1024
  });
  const store = options.store ?? new JsonStore();
  const jobQueue = new JobQueue(options.concurrency ?? 2, app.log);
  const rateLimit = options.rateLimit === false ? undefined : options.rateLimit ?? DEFAULT_RATE_LIMIT;
  const authToken = options.authToken ?? process.env.ASSINI_DEV_AUTH_TOKEN ?? (process.env.NODE_ENV === "test" ? TEST_ONLY_AUTH_TOKEN : undefined);
  const enablePrototypeAuth = options.enablePrototypeAuth ?? process.env.ASSINI_ENABLE_PROTOTYPE_AUTH === "true";
  const prototypeSessions: PrototypeSessionMap = new Map<string, PrototypeSessionRecord>();
  const prototypeSessionTtlMs = options.prototypeSessionTtlMs ?? readPrototypeSessionTtlMs(process.env);
  const now = options.now ?? Date.now;
  prototypeSessions.now = now;
  const llmProvider = options.llmProvider ?? createLlmProviderFromEnv();
  const dataDir = options.dataDir ?? resolvePath(process.cwd(), "data");
  const ingestionFetch = options.ingestionFetch ?? globalThis.fetch;
  const rateLimitBuckets = new Map<string, number[]>();
  let memoryState = options.initialState;
  const usesMemoryState = options.initialState !== undefined;
  let memoryUpdateQueue: Promise<void> = Promise.resolve();

  app.addHook("onRequest", async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, requestIdForResponse(request));
  });

  const readState = async (): Promise<AppState> => {
    if (!usesMemoryState) {
      return store.read();
    }

    if (!memoryState) {
      throw new Error("Memory state is not initialized");
    }

    return memoryState;
  };

  const updateState = async (updater: (state: AppState) => AppState): Promise<AppState> => {
    if (!usesMemoryState) {
      return store.update(updater);
    }

    const operation = memoryUpdateQueue.then(async () => {
      if (!memoryState) {
        throw new Error("Memory state is not initialized");
      }

      const next = updater(memoryState);
      memoryState = next;
      return next;
    });
    memoryUpdateQueue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  };

  const checkRateLimit = (request: FastifyRequest, reply: FastifyReply, actor: User | undefined): boolean => {
    if (!rateLimit || !RATE_LIMITED_METHODS.has(request.method)) {
      return true;
    }

    const now = rateLimit.now?.() ?? Date.now();
    const key = `${actor?.id ?? request.ip}:${request.method}:${request.routeOptions.url ?? request.url}`;
    const windowStart = now - rateLimit.windowMs;
    const hits = (rateLimitBuckets.get(key) ?? []).filter((hit) => hit > windowStart);

    if (hits.length >= rateLimit.max) {
      const retryAfterMs = Math.max(1, hits[0] + rateLimit.windowMs - now);
      reply.header("Retry-After", Math.ceil(retryAfterMs / 1000).toString());
      reply.code(429);
      return false;
    }

    hits.push(now);
    rateLimitBuckets.set(key, hits);
    return true;
  };

  app.setErrorHandler((error, request, reply) => {
    const requestId = requestIdForResponse(request);
    reply.header(REQUEST_ID_HEADER, requestId);

    const maybeStatusError = error as { statusCode?: number };
    if (maybeStatusError.statusCode === 413) {
      reply.code(413).send({ error: "Payload too large", requestId });
      return;
    }

    reply.send(error);
  });

  const allowedOrigins = options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;
  app.register(cors, {
    origin: (origin, callback) => {
      callback(null, isCorsOriginAllowed(origin, allowedOrigins));
    }
  });
  app.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024,
      files: 1
    }
  });

  const ctx: RouteContext = {
    readState,
    updateState,
    checkRateLimit,
    authToken,
    prototypeSessions,
    enablePrototypeAuth,
    prototypeSessionTtlMs,
    now,
    llmProvider,
    dataDir,
    ingestionFetch,
    jobQueue
  };

  registerSystemRoutes(app, ctx);
  registerAuthRoutes(app, ctx);
  registerLlmRoutes(app, ctx);
  registerLanguageRoutes(app, ctx);
  registerSourceRoutes(app, ctx);
  registerExtractionDraftRoutes(app, ctx);
  registerCorpusRoutes(app, ctx);
  registerNoteRoutes(app, ctx);
  registerExerciseRoutes(app, ctx);
  registerExportRoutes(app, ctx);
  registerEvaluationRoutes(app, ctx);
  registerGovernanceRoutes(app, ctx);
  registerStudyLoopRoutes(app, ctx);
  registerAiSessionRoutes(app, ctx);
  registerElderRoutes(app, ctx);
  registerObservabilityRoutes(app, ctx);

  app.addHook("onReady", async () => {
    try {
      const recoveredCount = await recoverInterruptedSources({ update: updateState });
      if (recoveredCount > 0) {
        app.log.info({ count: recoveredCount }, "Reset interrupted processing source assets to failed on startup");
      }
    } catch (error) {
      app.log.error({ err: error }, "Failed to clean up stuck processing source assets on startup");
    }
  });

  return app;
}
