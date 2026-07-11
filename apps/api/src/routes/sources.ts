import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  obsidianVaultImportPayloadSchema,
  sourceRegistrationPayloadSchema,
  type ObsidianVaultImportPayload,
  type ObsidianVaultImportResponse,
  type SourceRegistrationPayload
} from "@assini/api-contract";
import { resolveSourceAssetFilePath, type SourceAsset, type SourceAssetKind } from "@assini/db";
import { toPublicSourceAsset } from "../sourceAssetViews.js";
import { appendAuditEvent, requireActor } from "../routeHelpers.js";
import {
  assertObsidianVaultPathAllowed,
  i18nKeyForVaultPathError,
  VAULT_PATH_NOT_DIRECTORY_MESSAGE,
  VAULT_PATH_UNREADABLE_MESSAGE
} from "../vaultPathSafety.js";
import type { RouteContext } from "./context.js";
import { parseSchemaBody } from "./requestBody.js";
import { registerSourceProcessingRoutes, withProcessingQueuePhase } from "./sourceProcessing.js";

export { CANCELLED_PROCESSING_ERROR, withProcessingQueuePhase, type SourceAssetView } from "./sourceProcessing.js";

type VaultSkippedFile = ObsidianVaultImportResponse["skipped"][number];

/** Per-note Markdown byte cap for Obsidian vault import (oversized notes are skipped). */
export const MAX_OBSIDIAN_MARKDOWN_BYTES = 1_000_000;
/** Operator-facing skip reason when a vault Markdown note exceeds {@link MAX_OBSIDIAN_MARKDOWN_BYTES}. */
export const OBSIDIAN_MARKDOWN_TOO_LARGE_REASON = "Markdown file is larger than the 1 MB import limit.";
/** Default multipart file cap for source uploads (also registered on the Fastify multipart plugin). */
export const MAX_SOURCE_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Cap for the optional multipart `title` text field (and busboy `fieldSize`). */
export const MAX_SOURCE_UPLOAD_TITLE_BYTES = 1024;
export const MAX_SOURCE_UPLOAD_TITLE_CHARS = 200;
const OBSIDIAN_SKIPPED_DIRECTORIES = new Set([".obsidian", ".git", "node_modules"]);

/** Tight per-request multipart limits for the source upload route. */
export const SOURCE_UPLOAD_MULTIPART_LIMITS = {
  fileSize: MAX_SOURCE_UPLOAD_BYTES,
  files: 1,
  fields: 4,
  fieldSize: MAX_SOURCE_UPLOAD_TITLE_BYTES,
  parts: 6,
  headerPairs: 32
} as const;

type UploadTitleField = {
  type?: string;
  value?: unknown;
  valueTruncated?: boolean;
};

function readOptionalUploadTitle(
  fields: Record<string, unknown> | undefined
): { title: string } | { error: "truncated" | "invalid" } {
  const raw = fields?.title;
  if (raw === undefined) return { title: "" };
  if (Array.isArray(raw)) return { error: "invalid" };
  if (!raw || typeof raw !== "object") return { error: "invalid" };

  const field = raw as UploadTitleField;
  if (field.type === "file" || !("value" in field)) return { error: "invalid" };
  if (field.valueTruncated) return { error: "truncated" };

  const title = String(field.value ?? "").trim();
  if (title.length > MAX_SOURCE_UPLOAD_TITLE_CHARS) return { error: "truncated" };
  return { title };
}

function vaultAuditLabel(rootPath: string): string {
  return basename(rootPath) || "selected vault";
}

function parseSourceRegistrationBody(input: unknown): SourceRegistrationPayload | undefined {
  return parseSchemaBody(sourceRegistrationPayloadSchema, input);
}

function parseObsidianVaultImportBody(input: unknown): ObsidianVaultImportPayload | undefined {
  return parseSchemaBody(obsidianVaultImportPayloadSchema, input);
}

function sanitizeStoredFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 80) : "upload";
}

async function unlinkIfPresent(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function cleanupUnpersistedUpload(
  stagingPath: string,
  finalPath: string,
  finalFileCreated: boolean
): Promise<void> {
  const cleanupErrors: unknown[] = [];
  const paths = finalFileCreated ? [finalPath, stagingPath] : [stagingPath];

  for (const filePath of paths) {
    try {
      await unlinkIfPresent(filePath);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Failed to clean up an unpersisted source upload.");
  }
}

function sourceKindForUpload(mimeType: string, fileName: string): SourceAssetKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/") || mimeType === "video/webm") return "audio";
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(extension)) return "image";
  if (["mp3", "wav", "m4a", "ogg", "flac", "webm", "aac"].includes(extension)) return "audio";
  return "document";
}

function normalizeObsidianMarkdown(input: string): string {
  return input
    .replace(/^\uFEFF/, "")
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .replace(/!\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .trim();
}

function sourceTitleForMarkdownFile(rootPath: string, filePath: string): string {
  const relativePath = relative(rootPath, filePath).split("\\").join("/");
  const withoutExtension = relativePath.replace(/\.md$/i, "");
  return withoutExtension || basename(filePath, extname(filePath));
}

async function collectObsidianMarkdownFiles(
  rootPath: string,
  includeSubfolders: boolean,
  maxFiles: number,
  skipped: VaultSkippedFile[]
): Promise<string[]> {
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    if (files.length >= maxFiles) return;

    let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      skipped.push({
        path: directory,
        reason: error instanceof Error ? error.message : "Directory could not be read."
      });
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (includeSubfolders && !OBSIDIAN_SKIPPED_DIRECTORIES.has(entry.name)) {
          await visit(absolutePath);
        }
        continue;
      }

      if (!entry.isFile()) continue;
      if (extname(entry.name).toLowerCase() !== ".md") continue;
      files.push(absolutePath);
    }
  }

  await visit(rootPath);
  return files;
}

export function registerSourceRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const {
    readState,
    updateState,
    checkRateLimit,
    authToken,
    prototypeSessions,
    dataDir,
    multipartFileSizeBytes,
    jobQueue
  } = ctx;

  app.get("/languages/:languageId/sources", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, [
      "reviewer",
      "lead",
      "admin",
      "programmer"
    ]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return {
        error: `Language not found: ${languageId}`,
        i18nKey: "errors.languageNotFound"
      };
    }
    return state.sourceAssets
      .filter((asset) => asset.languageId === languageId)
      .map((asset) => withProcessingQueuePhase(asset, jobQueue));
  });

  app.post("/languages/:languageId/sources", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const body = parseSourceRegistrationBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return {
        error: "Invalid source body: provide kind (text|wordlist|url), title, and rawText or url",
        i18nKey: "errors.invalidSourceBody"
      };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    let languageMissing = false;
    let asset: SourceAsset | undefined;

    await updateState((state) => {
      if (!state.languages.some((language) => language.id === languageId)) {
        languageMissing = true;
        return state;
      }

      const createdAt = new Date().toISOString();
      asset = {
        id: `source-${randomUUID()}`,
        languageId,
        kind: body.kind,
        title: body.title,
        url: body.url,
        rawText: body.rawText,
        status: "pending",
        createdBy: actor.id,
        createdAt
      };

      return appendAuditEvent(
        {
          ...state,
          sourceAssets: [...state.sourceAssets, asset]
        },
        {
          actor,
          at: createdAt,
          action: "source_asset.registered",
          entityType: "source_asset",
          entityId: asset.id,
          languageId,
          summary: `Registered ${body.kind} source "${body.title}".`,
          metadata: {
            kind: body.kind,
            hasUrl: Boolean(body.url),
            textLength: body.rawText?.length ?? 0
          }
        }
      );
    });

    if (languageMissing) {
      reply.code(404);
      return {
        error: `Language not found: ${languageId}`,
        i18nKey: "errors.languageNotFound"
      };
    }

    if (!asset) {
      reply.code(500);
      return {
        error: "Source could not be registered",
        i18nKey: "errors.sourceRegisterFailed"
      };
    }

    reply.code(201);
    return toPublicSourceAsset(asset);
  });

  app.post("/languages/:languageId/sources/obsidian-vault", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const body = parseObsidianVaultImportBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return {
        error: "Invalid Obsidian vault import body: provide vaultPath, includeSubfolders, and maxFiles",
        i18nKey: "errors.invalidObsidianVaultImportBody"
      };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    if (!current.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return {
        error: `Language not found: ${languageId}`,
        i18nKey: "errors.languageNotFound"
      };
    }

    let rootPath: string;
    try {
      rootPath = await assertObsidianVaultPathAllowed(body.vaultPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Obsidian vault path is not allowed.";
      const i18nKey = i18nKeyForVaultPathError(message);
      reply.code(400);
      return {
        error: message,
        ...(i18nKey ? { i18nKey } : {})
      };
    }

    const vaultLabel = vaultAuditLabel(rootPath);
    const skipped: VaultSkippedFile[] = [];
    const warnings: string[] = [];

    try {
      const rootStat = await stat(rootPath);
      if (!rootStat.isDirectory()) {
        reply.code(400);
        return {
          error: VAULT_PATH_NOT_DIRECTORY_MESSAGE,
          i18nKey: "ingest.errorVaultNotDirectory"
        };
      }
    } catch {
      reply.code(400);
      return {
        error: VAULT_PATH_UNREADABLE_MESSAGE,
        i18nKey: "ingest.errorVaultUnreadable"
      };
    }

    const markdownFiles = await collectObsidianMarkdownFiles(rootPath, body.includeSubfolders, body.maxFiles, skipped);
    if (markdownFiles.length >= body.maxFiles) {
      warnings.push(`Import stopped at the configured ${body.maxFiles} file limit.`);
    }

    const importedAssets: SourceAsset[] = [];
    for (const filePath of markdownFiles) {
      const relativePath = relative(rootPath, filePath).split("\\").join("/");
      try {
        const fileStat = await stat(filePath);
        if (fileStat.size > MAX_OBSIDIAN_MARKDOWN_BYTES) {
          skipped.push({ path: relativePath, reason: OBSIDIAN_MARKDOWN_TOO_LARGE_REASON });
          continue;
        }

        const rawText = normalizeObsidianMarkdown(await readFile(filePath, "utf8"));
        if (!rawText) {
          skipped.push({ path: relativePath, reason: "Markdown file had no importable text." });
          continue;
        }

        importedAssets.push({
          id: `source-${randomUUID()}`,
          languageId,
          kind: "text",
          title: sourceTitleForMarkdownFile(rootPath, filePath),
          originalName: basename(filePath),
          rawText,
          status: "pending",
          createdBy: actor.id,
          createdAt: new Date().toISOString()
        });
      } catch (error) {
        skipped.push({
          path: relativePath,
          reason: error instanceof Error ? error.message : "Markdown file could not be imported."
        });
      }
    }

    if (importedAssets.length === 0) {
      return {
        imported: [],
        skipped,
        warnings,
        summary: { scanned: markdownFiles.length, imported: 0, skipped: skipped.length }
      } satisfies ObsidianVaultImportResponse;
    }

    await updateState((state) =>
      appendAuditEvent(
        {
          ...state,
          sourceAssets: [...state.sourceAssets, ...importedAssets]
        },
        {
          actor,
          action: "source_asset.obsidian_vault_imported",
          entityType: "source_asset",
          entityId: importedAssets[0].id,
          languageId,
          summary: `Imported ${importedAssets.length} Markdown sources from Obsidian vault "${vaultLabel}".`,
          metadata: {
            vaultName: vaultLabel,
            imported: importedAssets.length,
            skipped: skipped.length
          }
        }
      )
    );

    reply.code(201);
    return {
      imported: importedAssets.map((item) => toPublicSourceAsset(item)),
      skipped,
      warnings,
      summary: {
        scanned: markdownFiles.length,
        imported: importedAssets.length,
        skipped: skipped.length
      }
    } satisfies ObsidianVaultImportResponse;
  });

  app.post("/languages/:languageId/sources/upload", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    if (!current.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return {
        error: `Language not found: ${languageId}`,
        i18nKey: "errors.languageNotFound"
      };
    }

    const uploadLimits = {
      ...SOURCE_UPLOAD_MULTIPART_LIMITS,
      fileSize: Math.min(SOURCE_UPLOAD_MULTIPART_LIMITS.fileSize, multipartFileSizeBytes)
    };
    const file = await request.file({ limits: uploadLimits });
    if (!file) {
      reply.code(400);
      return {
        error: "Upload requires a multipart file field",
        i18nKey: "errors.sourceUploadRequiresFile"
      };
    }

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 413 || file.file.truncated) {
        reply.code(413);
        return {
          error: "Payload too large",
          i18nKey: "errors.payloadTooLarge"
        };
      }
      throw error;
    }
    // Defense in depth if throwFileSizeLimit is disabled: never persist a
    // silently truncated multipart body.
    if (file.file.truncated) {
      reply.code(413);
      return {
        error: "Payload too large",
        i18nKey: "errors.payloadTooLarge"
      };
    }
    if (buffer.length === 0) {
      reply.code(400);
      return {
        error: "Uploaded file is empty",
        i18nKey: "errors.sourceUploadEmpty"
      };
    }

    const titleResult = readOptionalUploadTitle(file.fields as Record<string, unknown> | undefined);
    if ("error" in titleResult) {
      reply.code(400);
      return titleResult.error === "truncated"
        ? {
            error: "Upload title field is too large",
            i18nKey: "errors.sourceUploadTitleTooLarge"
          }
        : {
            error: "Upload title field is invalid",
            i18nKey: "errors.sourceUploadTitleInvalid"
          };
    }

    const originalName = sanitizeStoredFileName(file.filename ?? "upload");
    const assetId = `source-${randomUUID()}`;
    // Keep forward slashes so persisted paths pass sourceAssetFilePathIssue.
    const relativePath = `assets/${languageId}/${assetId}__${originalName}`;
    let absolutePath: string;
    try {
      absolutePath = resolveSourceAssetFilePath(dataDir, relativePath, languageId);
    } catch {
      reply.code(500);
      return {
        error: "Source could not be stored",
        i18nKey: "errors.sourceStoreFailed"
      };
    }
    const mimeType = file.mimetype || "application/octet-stream";
    const kind = sourceKindForUpload(mimeType, originalName);
    const titleValue = titleResult.title;
    let asset: SourceAsset | undefined;
    const uploadDirectory = dirname(absolutePath);
    const stagingPath = join(uploadDirectory, `.${basename(absolutePath)}.${randomUUID()}.uploading`);
    let finalFileCreated = false;

    try {
      await mkdir(uploadDirectory, { recursive: true });
      await writeFile(stagingPath, buffer, { flag: "wx" });
      // Staging beside the destination guarantees that finalization is an
      // atomic same-filesystem rename. State is persisted only after the final
      // path exists, so a successful row never points at a staging file.
      await rename(stagingPath, absolutePath);
      finalFileCreated = true;

      await updateState((state) => {
        const createdAt = new Date().toISOString();
        asset = {
          id: assetId,
          languageId,
          kind,
          title: titleValue || originalName,
          originalName,
          mimeType,
          filePath: relativePath,
          status: "pending",
          createdBy: actor.id,
          createdAt
        };

        return appendAuditEvent(
          {
            ...state,
            sourceAssets: [...state.sourceAssets, asset]
          },
          {
            actor,
            at: createdAt,
            action: "source_asset.uploaded",
            entityType: "source_asset",
            entityId: asset.id,
            languageId,
            summary: `Uploaded ${kind} source "${asset.title}".`,
            metadata: {
              kind,
              mimeType,
              byteSize: buffer.length
            }
          }
        );
      });
    } catch (error) {
      // updateState resolves only after persistence. On rejection, neither a
      // finalized file nor its staging predecessor may outlive the failed row.
      try {
        await cleanupUnpersistedUpload(stagingPath, absolutePath, finalFileCreated);
      } catch (cleanupError) {
        request.log.error({ err: cleanupError }, "Failed to clean up unpersisted source upload");
      }
      throw error;
    }

    if (!asset) {
      try {
        await cleanupUnpersistedUpload(stagingPath, absolutePath, finalFileCreated);
      } catch (cleanupError) {
        request.log.error({ err: cleanupError }, "Failed to clean up source upload without a persisted asset");
      }
      reply.code(500);
      return {
        error: "Source could not be stored",
        i18nKey: "errors.sourceStoreFailed"
      };
    }

    reply.code(201);
    return toPublicSourceAsset(asset);
  });

  registerSourceProcessingRoutes(app, ctx);
}
