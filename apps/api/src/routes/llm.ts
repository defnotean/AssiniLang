import type { FastifyInstance } from "fastify";
import {
  activateRuntimeModelProfile,
  applyRuntimeSettingsPatch,
  deleteRuntimeModelProfile,
  modelProfileSavePayloadSchema,
  runtimeSettingsPatchSchema,
  RuntimeModelProfileNotFoundError,
  RuntimeModelProfilesCorruptError,
  RuntimeSettingsUrlValidationError,
  runtimeSettingsResponse,
  saveRuntimeModelProfile
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

function profileIdFromParams(params: unknown): string {
  const raw = (params as { profileId?: unknown } | undefined)?.profileId;
  if (typeof raw !== "string") return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function mapModelProfileMutationError(error: unknown, reply: { code: (statusCode: number) => unknown }): { error: string } | undefined {
  if (error instanceof RuntimeModelProfileNotFoundError) {
    reply.code(404);
    return { error: error.message };
  }
  if (error instanceof RuntimeModelProfilesCorruptError) {
    reply.code(409);
    return { error: error.message };
  }
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

  app.get("/llm/status", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["programmer", "admin", "lead"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    return describeLlmProviderFromEnv();
  });

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
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    const patch = parseSchemaBody(runtimeSettingsPatchSchema, request.body ?? {});
    if (!patch) {
      reply.code(400);
      return { error: "Invalid runtime settings body" };
    }

    try {
      return await applyRuntimeSettingsPatch({
        settingsPath,
        patch,
        reloadLlmProvider
      });
    } catch (error) {
      if (error instanceof RuntimeSettingsUrlValidationError) {
        reply.code(400);
        return { error: error.message };
      }
      throw error;
    }
  });

  app.post("/llm/model-profiles", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["programmer", "admin", "lead"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    const payload = parseSchemaBody(modelProfileSavePayloadSchema, request.body ?? {});
    if (!payload) {
      reply.code(400);
      return { error: "Invalid model profile body" };
    }

    try {
      return await saveRuntimeModelProfile({
        settingsPath,
        payload,
        reloadLlmProvider
      });
    } catch (error) {
      const mapped = mapModelProfileMutationError(error, reply);
      if (mapped) return mapped;
      throw error;
    }
  });

  app.put("/llm/model-profiles/:profileId/activate", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["programmer", "admin", "lead"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    const profileId = profileIdFromParams(request.params);
    try {
      return await activateRuntimeModelProfile({
        settingsPath,
        profileId,
        reloadLlmProvider
      });
    } catch (error) {
      const mapped = mapModelProfileMutationError(error, reply);
      if (mapped) return mapped;
      throw error;
    }
  });

  app.delete("/llm/model-profiles/:profileId", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["programmer", "admin", "lead"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    const profileId = profileIdFromParams(request.params);
    try {
      return await deleteRuntimeModelProfile({
        settingsPath,
        profileId,
        reloadLlmProvider
      });
    } catch (error) {
      const mapped = mapModelProfileMutationError(error, reply);
      if (mapped) return mapped;
      throw error;
    }
  });

  app.post("/llm/health-check", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["programmer", "admin", "lead"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    return probeLlmProviderReachability({ env: process.env, fetchFn: ingestionFetch });
  });
}
