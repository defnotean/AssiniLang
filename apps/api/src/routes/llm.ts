import type { FastifyInstance } from "fastify";
import {
  applyRuntimeSettingsPatch,
  runtimeSettingsPatchSchema,
  runtimeSettingsResponse
} from "../appSettings.js";
import { discoverLlmModels } from "../llmDiscovery.js";
import { describeLlmProviderFromEnv, probeLlmProviderReachability } from "../llmProvider.js";
import { requireActor } from "../routeHelpers.js";
import type { RouteContext } from "./context.js";
import { parseSchemaBody } from "./requestBody.js";

function queryBaseUrls(query: unknown): string[] {
  if (!query || typeof query !== "object") return [];
  const value = (query as { baseUrl?: unknown }).baseUrl;
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function queryIncludeCommonTargets(query: unknown): boolean | undefined {
  if (!query || typeof query !== "object") return undefined;
  const value = (query as { includeCommonTargets?: unknown }).includeCommonTargets;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

export function registerLlmRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const {
    readState,
    checkRateLimit,
    authToken,
    prototypeSessions,
    ingestionFetch,
    settingsPath,
    reloadLlmProvider
  } = ctx;

  app.get("/llm/status", async () => describeLlmProviderFromEnv());

  app.get("/llm/settings", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["programmer", "admin", "lead"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    return runtimeSettingsResponse();
  });

  app.get("/llm/models", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["programmer", "admin", "lead"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    reply.header("Cache-Control", "no-store, max-age=0");
    reply.header("Pragma", "no-cache");
    return discoverLlmModels({
      env: process.env,
      fetchFn: ingestionFetch,
      extraBaseUrls: queryBaseUrls(request.query),
      includeCommonTargets: queryIncludeCommonTargets(request.query) ?? true
    });
  });

  app.put("/llm/settings", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["programmer", "admin", "lead"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    const patch = parseSchemaBody(runtimeSettingsPatchSchema, request.body ?? {});
    if (!patch) {
      reply.code(400);
      return { error: "Invalid runtime settings body" };
    }

    return applyRuntimeSettingsPatch({
      settingsPath,
      patch,
      reloadLlmProvider
    });
  });

  app.post("/llm/health-check", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["programmer", "admin", "lead"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    return probeLlmProviderReachability({ env: process.env, fetchFn: ingestionFetch });
  });
}
