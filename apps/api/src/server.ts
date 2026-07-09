import { randomUUID } from "node:crypto";
import { resolve as resolvePath } from "node:path";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { JobQueue } from "./jobQueue.js";
import {
  DEFAULT_PROCESSING_STALE_MS,
  DEFAULT_STALE_RECOVERY_INTERVAL_MS,
  recoverInterruptedSources,
  recoverStaleProcessingSources
} from "./jobRecovery.js";
import { JsonStore, type AppState, type User } from "@assini/db";
import { createMutableLlmProvider, type LlmProvider } from "./llmProvider.js";
import { resolveRuntimeSettingsPath } from "./runtimePath.js";
import { isCorsOriginAllowed, resolveAllowedOrigins } from "./corsOrigins.js";
import {
  readPrototypeSessionAbsoluteMaxMs,
  readPrototypeSessionTtlMs,
  type PrototypeSessionMap,
  type PrototypeSessionRecord
} from "./routeHelpers.js";
import { censorLogSecret, redactErrorSecrets } from "./secretRedaction.js";
import { FASTIFY_LOGGER_REDACT_PATHS } from "./serverLogRedaction.js";
import { createObsidianMcpSession, type ObsidianMcpSessionFactory } from "./obsidianMcpClient.js";
import type { RequestStatusClass, RouteContext } from "./routes/context.js";
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
import { registerObsidianMcpRoutes } from "./routes/obsidianMcp.js";
import {
  MAX_SOURCE_UPLOAD_BYTES,
  MAX_SOURCE_UPLOAD_TITLE_BYTES,
  registerSourceRoutes,
  SOURCE_UPLOAD_MULTIPART_LIMITS
} from "./routes/sources.js";
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
  /** Multipart source-upload file size cap in bytes. Defaults to 25 MB. */
  multipartFileSizeBytes?: number;
  rateLimit?: RateLimitOptions | false;
  /** Server-only token used by tests or explicitly configured internal tools. Never bundle this into the browser. */
  authToken?: string;
  enablePrototypeAuth?: boolean;
  /** Prototype-session sliding TTL in ms. Defaults to ASSINI_PROTOTYPE_SESSION_TTL_MS or 8 hours. */
  prototypeSessionTtlMs?: number;
  /** Absolute max age from createdAt. Defaults to ASSINI_PROTOTYPE_SESSION_ABSOLUTE_MAX_MS or 3× TTL. */
  prototypeSessionAbsoluteMaxMs?: number;
  /** Optional pre-seeded session map (tests). */
  prototypeSessions?: PrototypeSessionMap;
  /** Injectable clock for session lifecycle tests. */
  now?: () => number;
  llmProvider?: LlmProvider;
  /** Directory where uploaded source-asset files are stored. Defaults to ./data next to the local database. */
  dataDir?: string;
  /** Fetch implementation used for URL sources and transcription; overridable in tests. */
  ingestionFetch?: typeof fetch;
  /** Local settings file path. Defaults to the repo-root .env in normal dev runs. */
  settingsPath?: string;
  /** MCP session constructor override for deterministic route tests. */
  obsidianMcpSessionFactory?: ObsidianMcpSessionFactory;
  logger?: any;
  concurrency?: number;
  /** Optional job queue override for tests (e.g. failing getStatus). */
  jobQueue?: JobQueue;
};

const TEST_ONLY_AUTH_TOKEN = "test";
const DEFAULT_RATE_LIMIT: RateLimitOptions = { max: 120, windowMs: 60_000 };
const RATE_LIMITED_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const REQUEST_ID_HEADER = "x-request-id";
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function responseStatusClass(statusCode: number): RequestStatusClass | undefined {
  if (statusCode >= 100 && statusCode < 200) return "1xx";
  if (statusCode >= 200 && statusCode < 300) return "2xx";
  if (statusCode >= 300 && statusCode < 400) return "3xx";
  if (statusCode >= 400 && statusCode < 500) return "4xx";
  if (statusCode >= 500 && statusCode < 600) return "5xx";
  return undefined;
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
            paths: [...FASTIFY_LOGGER_REDACT_PATHS],
            censor: censorLogSecret
          }
        }
      : false,
    bodyLimit: options.bodyLimitBytes ?? 64 * 1024
  });
  const store = options.store ?? new JsonStore();
  const jobQueue = options.jobQueue ?? new JobQueue(options.concurrency ?? 2, app.log);
  const rateLimit = options.rateLimit === false ? undefined : options.rateLimit ?? DEFAULT_RATE_LIMIT;
  const authToken = options.authToken ?? process.env.ASSINI_DEV_AUTH_TOKEN ?? (process.env.NODE_ENV === "test" ? TEST_ONLY_AUTH_TOKEN : undefined);
  const enablePrototypeAuth = options.enablePrototypeAuth ?? process.env.ASSINI_ENABLE_PROTOTYPE_AUTH === "true";
  const prototypeSessions: PrototypeSessionMap = options.prototypeSessions ?? new Map<string, PrototypeSessionRecord>();
  const prototypeSessionTtlMs = options.prototypeSessionTtlMs ?? readPrototypeSessionTtlMs(process.env);
  const prototypeSessionAbsoluteMaxMs =
    options.prototypeSessionAbsoluteMaxMs
    ?? readPrototypeSessionAbsoluteMaxMs(process.env, prototypeSessionTtlMs);
  const now = options.now ?? Date.now;
  prototypeSessions.now = now;
  const dataDir = options.dataDir ?? resolvePath(process.cwd(), "data");
  const multipartFileSizeBytes = options.multipartFileSizeBytes ?? MAX_SOURCE_UPLOAD_BYTES;
  const ingestionFetch = options.ingestionFetch ?? globalThis.fetch;
  const mutableLlmProvider = options.llmProvider ? undefined : createMutableLlmProvider(process.env, ingestionFetch);
  const llmProvider = options.llmProvider ?? mutableLlmProvider as LlmProvider;
  const settingsPath = options.settingsPath ?? resolveRuntimeSettingsPath({ moduleUrl: import.meta.url });
  const obsidianMcpSessionFactory = options.obsidianMcpSessionFactory ?? createObsidianMcpSession;
  const rateLimitBuckets = new Map<string, number[]>();
  const requestMetrics: RouteContext["requestMetrics"] = {
    startedAtMs: now(),
    requests: {
      total: 0,
      byStatusClass: { "1xx": 0, "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 }
    }
  };
  let memoryState = options.initialState;
  const usesMemoryState = options.initialState !== undefined;
  let memoryUpdateQueue: Promise<void> = Promise.resolve();

  app.addHook("onRequest", async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, requestIdForResponse(request));
  });

  app.addHook("onResponse", async (_request, reply) => {
    requestMetrics.requests.total += 1;
    const statusClass = responseStatusClass(reply.statusCode);
    if (statusClass) {
      requestMetrics.requests.byStatusClass[statusClass] += 1;
    }
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

  const checkRateLimit = (
    request: FastifyRequest,
    reply: FastifyReply,
    actor: User | undefined
  ): { error: string; i18nKey: string; i18nParams?: Record<string, number>; requestId?: string } | undefined => {
    if (!rateLimit || !RATE_LIMITED_METHODS.has(request.method)) {
      return undefined;
    }

    const now = rateLimit.now?.() ?? Date.now();
    const key = `${actor?.id ?? request.ip}:${request.method}:${request.routeOptions.url ?? request.url}`;
    const windowStart = now - rateLimit.windowMs;
    const hits = (rateLimitBuckets.get(key) ?? []).filter((hit) => hit > windowStart);

    if (hits.length >= rateLimit.max) {
      const retryAfterMs = Math.max(1, hits[0] + rateLimit.windowMs - now);
      const seconds = Math.ceil(retryAfterMs / 1000);
      const requestId = requestIdForResponse(request);
      reply.header(REQUEST_ID_HEADER, requestId);
      reply.header("Retry-After", seconds.toString());
      reply.code(429);
      return {
        error: "Rate limit exceeded",
        i18nKey: "app.rateLimitExceeded",
        i18nParams: { seconds },
        requestId
      };
    }

    hits.push(now);
    rateLimitBuckets.set(key, hits);
    return undefined;
  };

  app.setErrorHandler((error, request, reply) => {
    const requestId = requestIdForResponse(request);
    reply.header(REQUEST_ID_HEADER, requestId);

    const maybeStatusError = error as { statusCode?: number; message?: string };
    if (maybeStatusError.statusCode === 413) {
      reply.code(413).send({
        error: "Payload too large",
        i18nKey: "errors.payloadTooLarge",
        requestId
      });
      return;
    }

    const statusCode = typeof maybeStatusError.statusCode === "number" && maybeStatusError.statusCode >= 400
      ? maybeStatusError.statusCode
      : 500;
    if (statusCode >= 500) {
      app.log.error({ err: error, requestId }, "Unhandled request error");
      reply.code(statusCode).send({
        error: "Internal Server Error",
        requestId
      });
      return;
    }

    if (error instanceof Error) {
      error.message = redactErrorSecrets(error.message);
    }
    reply.send(error);
  });

  const allowedOrigins = resolveAllowedOrigins(options.allowedOrigins);
  app.register(cors, {
    credentials: true,
    origin: (origin, callback) => {
      callback(null, isCorsOriginAllowed(origin, allowedOrigins));
    }
  });
  app.register(multipart, {
    limits: {
      ...SOURCE_UPLOAD_MULTIPART_LIMITS,
      fileSize: multipartFileSizeBytes,
      fieldSize: MAX_SOURCE_UPLOAD_TITLE_BYTES
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
    prototypeSessionAbsoluteMaxMs,
    now,
    llmProvider,
    dataDir,
    multipartFileSizeBytes,
    ingestionFetch,
    settingsPath,
    obsidianMcpSessionFactory,
    reloadLlmProvider: mutableLlmProvider
      ? () => mutableLlmProvider.updateFromEnv(process.env)
      : undefined,
    jobQueue,
    requestMetrics
  };

  registerSystemRoutes(app, ctx);
  registerAuthRoutes(app, ctx);
  registerLlmRoutes(app, ctx);
  registerObsidianMcpRoutes(app, ctx);
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

  let staleRecoveryTimer: ReturnType<typeof setInterval> | undefined;

  app.addHook("onReady", async () => {
    try {
      const recoveredCount = await recoverInterruptedSources({ update: updateState });
      if (recoveredCount > 0) {
        app.log.info({ count: recoveredCount }, "Reset interrupted processing source assets to failed on startup");
      }
    } catch (error) {
      app.log.error({ err: error }, "Failed to clean up stuck processing source assets on startup");
    }

    // Live reclaim for orphaned processing rows (queue slot already freed after
    // a failed completion persist, etc.). Skip ids still queued or active so a
    // slow live job is not failed while its worker is still running.
    staleRecoveryTimer = setInterval(() => {
      const { pending, active } = jobQueue.getPendingAndActiveIds();
      void recoverStaleProcessingSources(
        { update: updateState },
        {
          staleMs: DEFAULT_PROCESSING_STALE_MS,
          skipIds: new Set([...pending, ...active])
        }
      ).then((count) => {
        if (count > 0) {
          app.log.info({ count }, "Reset stale-heartbeat processing source assets to failed");
        }
      }).catch((error) => {
        app.log.error({ err: error }, "Failed to recover stale-heartbeat processing source assets");
      });
    }, DEFAULT_STALE_RECOVERY_INTERVAL_MS);
    staleRecoveryTimer.unref?.();
  });

  app.addHook("onClose", async () => {
    if (staleRecoveryTimer !== undefined) {
      clearInterval(staleRecoveryTimer);
      staleRecoveryTimer = undefined;
    }
  });

  return app;
}
