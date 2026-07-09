import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  obsidianMcpImportPayloadSchema,
  obsidianMcpResourceListQuerySchema,
  obsidianMcpSettingsPatchSchema,
  type ObsidianMcpConnectionStatus,
  type ObsidianMcpImportResponse,
  type ObsidianMcpResource,
  type ObsidianMcpResourceList
} from "@assini/api-contract";
import type { SourceAsset } from "@assini/db";
import {
  applyObsidianMcpSettingsPatch,
  readObsidianMcpConnectionConfigFromEnv,
  readObsidianMcpSettingsFromEnv,
  RuntimeSettingsUrlValidationError
} from "../appSettings.js";
import {
  isObsidianMcpTextMimeType,
  MAX_OBSIDIAN_MCP_RESOURCE_BYTES,
  ObsidianMcpResourceReadError,
  redactObsidianMcpSecret,
  type ObsidianMcpConnectionConfig,
  type ObsidianMcpSession,
  type ObsidianMcpTextResource
} from "../obsidianMcpClient.js";
import { appendAuditEvent, requireActor } from "../routeHelpers.js";
import { redactErrorSecrets } from "../secretRedaction.js";
import type { RouteContext } from "./context.js";
import { parseSchemaBody } from "./requestBody.js";

const SETTINGS_ROLES = ["programmer", "lead", "admin"] as const;
const RESOURCE_ROLES = ["reviewer", "lead", "admin", "programmer"] as const;
const IMPORT_ROLES = ["reviewer", "lead", "admin"] as const;

type SkippedResource = ObsidianMcpImportResponse["skipped"][number];

function authError(statusCode: number): { error: string } {
  return { error: statusCode === 403 ? "Forbidden" : "Unauthorized" };
}

function configured(config: ObsidianMcpConnectionConfig): boolean {
  return config.endpointUrl.trim().length > 0;
}

function safeMcpText(value: string, token?: string): string {
  return redactErrorSecrets(redactObsidianMcpSecret(value, token));
}

function safeMcpError(error: unknown, token?: string): string {
  return safeMcpText(error instanceof Error ? error.message : String(error), token);
}

function safeResource(resource: ObsidianMcpResource, token?: string): ObsidianMcpResource {
  return {
    uri: safeMcpText(resource.uri, token),
    name: safeMcpText(resource.name, token),
    ...(resource.title ? { title: safeMcpText(resource.title, token) } : {}),
    ...(resource.description ? { description: safeMcpText(resource.description, token) } : {}),
    ...(resource.mimeType ? { mimeType: safeMcpText(resource.mimeType, token) } : {}),
    ...(resource.lastModified ? { lastModified: safeMcpText(resource.lastModified, token) } : {})
  };
}

async function closeSession(session: ObsidianMcpSession | undefined): Promise<void> {
  await session?.close().catch(() => undefined);
}

function sourceTitleFromResourceUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    const segment = parsed.pathname.split("/").filter(Boolean).at(-1);
    if (segment) {
      try {
        return decodeURIComponent(segment).slice(0, 512);
      } catch {
        return segment.slice(0, 512);
      }
    }
    return (parsed.hostname || uri).slice(0, 512);
  } catch {
    return uri.slice(0, 512);
  }
}

function validateTextResource(
  resource: ObsidianMcpTextResource
): { text: string; mimeType?: string } | { reason: string } {
  if (!isObsidianMcpTextMimeType(resource.mimeType)) {
    return { reason: "MCP resource did not contain a supported text representation." };
  }
  const text = resource.text.trim();
  if (!text) return { reason: "MCP resource had no importable text." };
  if (Buffer.byteLength(text, "utf8") > MAX_OBSIDIAN_MCP_RESOURCE_BYTES) {
    return { reason: "MCP resource is larger than the 1 MB import limit." };
  }
  return { text, ...(resource.mimeType ? { mimeType: resource.mimeType } : {}) };
}

function skippedResource(uri: string, reason: string, token?: string): SkippedResource {
  return {
    uri: safeMcpText(uri, token),
    reason: safeMcpText(reason, token)
  };
}

function mcpUnavailable(reply: { code: (statusCode: number) => unknown }): { error: string; i18nKey: string } {
  reply.code(409);
  return {
    error: "Obsidian MCP endpoint is not configured",
    i18nKey: "errors.obsidianMcpNotConfigured"
  };
}

export function registerObsidianMcpRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const {
    readState,
    updateState,
    checkRateLimit,
    authToken,
    prototypeSessions,
    settingsPath,
    obsidianMcpSessionFactory
  } = ctx;

  app.get("/integrations/obsidian-mcp/settings", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, SETTINGS_ROLES);
    if (!actor) return authError(reply.statusCode);
    reply.header("Cache-Control", "no-store, max-age=0");
    return readObsidianMcpSettingsFromEnv();
  });

  app.put("/integrations/obsidian-mcp/settings", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, SETTINGS_ROLES);
    if (!actor) return authError(reply.statusCode);
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    const patch = parseSchemaBody(obsidianMcpSettingsPatchSchema, request.body ?? {});
    if (!patch) {
      reply.code(400);
      return { error: "Invalid Obsidian MCP settings body", i18nKey: "errors.invalidObsidianMcpSettings" };
    }

    try {
      reply.header("Cache-Control", "no-store, max-age=0");
      return await applyObsidianMcpSettingsPatch({ settingsPath, patch });
    } catch (error) {
      if (error instanceof RuntimeSettingsUrlValidationError) {
        reply.code(400);
        const token = patch.token ?? readObsidianMcpConnectionConfigFromEnv().token;
        return {
          error: safeMcpError(error, token),
          i18nKey: "errors.invalidObsidianMcpEndpoint"
        };
      }
      throw error;
    }
  });

  app.post("/integrations/obsidian-mcp/test", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, SETTINGS_ROLES);
    if (!actor) return authError(reply.statusCode);
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    const config = readObsidianMcpConnectionConfigFromEnv();
    if (!configured(config)) {
      return {
        configured: false,
        connected: false,
        detail: "Obsidian MCP endpoint is not configured."
      } satisfies ObsidianMcpConnectionStatus;
    }

    const startedAt = Date.now();
    let session: ObsidianMcpSession | undefined;
    try {
      session = await obsidianMcpSessionFactory(config);
      const listed = await session.listResources();
      return {
        configured: true,
        connected: true,
        ...(session.serverName ? { serverName: safeMcpText(session.serverName, config.token) } : {}),
        ...(session.serverVersion ? { serverVersion: safeMcpText(session.serverVersion, config.token) } : {}),
        resourceCount: listed.resources.length,
        latencyMs: Math.max(0, Date.now() - startedAt)
      } satisfies ObsidianMcpConnectionStatus;
    } catch (error) {
      return {
        configured: true,
        connected: false,
        latencyMs: Math.max(0, Date.now() - startedAt),
        detail: safeMcpError(error, config.token)
      } satisfies ObsidianMcpConnectionStatus;
    } finally {
      await closeSession(session);
    }
  });

  app.get("/integrations/obsidian-mcp/resources", async (request, reply) => {
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, RESOURCE_ROLES);
    if (!actor) return authError(reply.statusCode);
    const query = obsidianMcpResourceListQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      reply.code(400);
      return { error: "Invalid Obsidian MCP resource cursor", i18nKey: "errors.invalidObsidianMcpCursor" };
    }

    const config = readObsidianMcpConnectionConfigFromEnv();
    if (!configured(config)) return mcpUnavailable(reply);
    let session: ObsidianMcpSession | undefined;
    try {
      session = await obsidianMcpSessionFactory(config);
      const listed = await session.listResources(query.data.cursor);
      reply.header("Cache-Control", "no-store, max-age=0");
      return {
        resources: listed.resources.map((resource) => safeResource(resource, config.token)),
        ...(listed.nextCursor ? { nextCursor: safeMcpText(listed.nextCursor, config.token) } : {}),
        ...(session.serverName ? { serverName: safeMcpText(session.serverName, config.token) } : {})
      } satisfies ObsidianMcpResourceList;
    } catch (error) {
      reply.code(502);
      return {
        error: "Obsidian MCP resource listing failed",
        detail: safeMcpError(error, config.token),
        i18nKey: "errors.obsidianMcpRequestFailed"
      };
    } finally {
      await closeSession(session);
    }
  });

  app.post("/languages/:languageId/sources/obsidian-mcp", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, IMPORT_ROLES);
    if (!actor) return authError(reply.statusCode);
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    const payload = parseSchemaBody(obsidianMcpImportPayloadSchema, request.body ?? {});
    if (!payload) {
      reply.code(400);
      return { error: "Invalid Obsidian MCP import body", i18nKey: "errors.invalidObsidianMcpImport" };
    }
    if (!current.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}`, i18nKey: "errors.languageNotFound" };
    }

    const config = readObsidianMcpConnectionConfigFromEnv();
    if (!configured(config)) return mcpUnavailable(reply);
    const existingUris = new Set(
      current.sourceAssets
        .filter((asset) => asset.languageId === languageId && asset.url)
        .map((asset) => asset.url as string)
    );
    const skipped: SkippedResource[] = [];
    const candidates: SourceAsset[] = [];
    let session: ObsidianMcpSession | undefined;

    try {
      session = await obsidianMcpSessionFactory(config);
      for (const uri of payload.uris) {
        if (config.token && uri.includes(config.token)) {
          skipped.push(skippedResource(
            uri,
            "Resource URI contained a configured credential and was not imported.",
            config.token
          ));
          continue;
        }
        if (existingUris.has(uri)) {
          skipped.push(skippedResource(uri, "Resource URI was already imported for this language.", config.token));
          continue;
        }

        try {
          const resource = await session.readTextResource(uri);
          if (config.token && (
            resource.uri.includes(config.token)
            || resource.text.includes(config.token)
            || resource.mimeType?.includes(config.token)
          )) {
            skipped.push(skippedResource(
              uri,
              "MCP resource contained a configured credential and was not imported.",
              config.token
            ));
            continue;
          }
          const validated = validateTextResource(resource);
          if ("reason" in validated) {
            skipped.push(skippedResource(uri, validated.reason, config.token));
            continue;
          }
          candidates.push({
            id: `source-${randomUUID()}`,
            languageId,
            kind: "text",
            title: sourceTitleFromResourceUri(uri),
            ...(validated.mimeType ? { mimeType: validated.mimeType } : {}),
            url: uri,
            rawText: validated.text,
            status: "pending",
            createdBy: actor.id,
            createdAt: new Date().toISOString()
          });
          existingUris.add(uri);
        } catch (error) {
          const reason = error instanceof ObsidianMcpResourceReadError
            ? error.message
            : safeMcpError(error, config.token);
          skipped.push(skippedResource(uri, reason, config.token));
        }
      }
    } catch (error) {
      reply.code(502);
      return {
        error: "Obsidian MCP import failed",
        detail: safeMcpError(error, config.token),
        i18nKey: "errors.obsidianMcpRequestFailed"
      };
    } finally {
      await closeSession(session);
    }

    let imported: SourceAsset[] = [];
    let languageMissing = false;
    if (candidates.length > 0) {
      await updateState((state) => {
        if (!state.languages.some((language) => language.id === languageId)) {
          languageMissing = true;
          return state;
        }
        const persistedUris = new Set(
          state.sourceAssets
            .filter((asset) => asset.languageId === languageId && asset.url)
            .map((asset) => asset.url as string)
        );
        imported = candidates.filter((asset) => {
          if (!asset.url || persistedUris.has(asset.url)) {
            if (asset.url) {
              skipped.push(skippedResource(
                asset.url,
                "Resource URI was already imported for this language.",
                config.token
              ));
            }
            return false;
          }
          persistedUris.add(asset.url);
          return true;
        });
        if (imported.length === 0) return state;

        return appendAuditEvent({
          ...state,
          sourceAssets: [...state.sourceAssets, ...imported]
        }, {
          actor,
          action: "source_asset.obsidian_mcp_imported",
          entityType: "source_asset",
          entityId: imported[0].id,
          languageId,
          summary: `Imported ${imported.length} text sources through Obsidian MCP.`,
          metadata: {
            integration: "obsidian_mcp",
            requested: payload.uris.length,
            imported: imported.length,
            skipped: skipped.length
          }
        });
      });
    }

    if (languageMissing) {
      reply.code(404);
      return { error: `Language not found: ${languageId}`, i18nKey: "errors.languageNotFound" };
    }
    if (imported.length > 0) reply.code(201);
    return {
      imported,
      skipped,
      summary: {
        requested: payload.uris.length,
        imported: imported.length,
        skipped: skipped.length
      }
    } satisfies ObsidianMcpImportResponse;
  });
}
