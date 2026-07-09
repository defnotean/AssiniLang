import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve as resolvePath } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  obsidianVaultImportPayloadSchema,
  sourceRegistrationPayloadSchema,
  sourceProcessingErrorI18n,
  type ObsidianVaultImportPayload,
  type ObsidianVaultImportResponse,
  type SourceRegistrationPayload
} from "@assini/api-contract";
import type { AppState, ExtractionDraft, SourceAsset, SourceAssetKind, User } from "@assini/db";
import { extractCandidatesForAsset, type ExtractionCandidate, type SourceExtractionResult } from "../ingestion.js";
import { appendAuditEvent, redactErrorSecrets, requireActor } from "../routeHelpers.js";
import { assertObsidianVaultPathAllowed } from "../vaultPathSafety.js";
import type { RouteContext } from "./context.js";
import { parseSchemaBody } from "./requestBody.js";

type SourceProcessCompletionInput = {
  sourceId: string;
  actor: User;
  processedAt: string;
  extraction?: SourceExtractionResult;
  extractionError?: string;
};

type SourceProcessCompletionOutput = {
  drafts: ExtractionDraft[];
  updatedAsset?: SourceAsset;
};

type VaultSkippedFile = ObsidianVaultImportResponse["skipped"][number];

const MAX_OBSIDIAN_MARKDOWN_BYTES = 1_000_000;
export const MAX_SOURCE_PROCESSING_ATTEMPTS = 5;
const OBSIDIAN_SKIPPED_DIRECTORIES = new Set([".obsidian", ".git", "node_modules"]);

function vaultAuditLabel(rootPath: string): string {
  return basename(rootPath) || "selected vault";
}

/**
 * Applies the result of a source extraction run (success or failure) to the
 * app state in a single mutation: asset status, error, summary, transcript,
 * new extraction drafts, and the audit event. Shared by the synchronous and
 * background processing paths so both persist identically.
 */
function applySourceProcessCompletion(
  state: AppState,
  input: SourceProcessCompletionInput,
  output: SourceProcessCompletionOutput
): AppState {
  const { sourceId, actor, processedAt, extraction, extractionError } = input;
  const stored = state.sourceAssets.find((item) => item.id === sourceId);
  if (!stored) return state;

  if (!extraction) {
    const failedAsset: SourceAsset = {
      ...stored,
      status: "failed",
      error: extractionError ?? "Source processing failed.",
      processedAt
    };
    output.updatedAsset = failedAsset;
    return appendAuditEvent({
      ...state,
      sourceAssets: state.sourceAssets.map((item) => (item.id === sourceId ? failedAsset : item))
    }, {
      actor,
      at: processedAt,
      action: "source_asset.process_failed",
      entityType: "source_asset",
      entityId: sourceId,
      languageId: stored.languageId,
      summary: `Processing failed for source "${stored.title}".`,
      metadata: { reason: extractionError ?? "unknown" }
    });
  }

  output.drafts = extraction.candidates.map((candidate: ExtractionCandidate) => ({
    id: `draft-${randomUUID()}`,
    languageId: stored.languageId,
    sourceAssetId: stored.id,
    kind: candidate.kind,
    payload: candidate.payload,
    confidence: candidate.confidence,
    rationale: candidate.rationale,
    status: "proposed" as const,
    createdAt: processedAt
  }));

  const updatedAsset: SourceAsset = {
    ...stored,
    status: "processed",
    error: undefined,
    summary: extraction.summary,
    transcript: extraction.transcript ?? stored.transcript,
    warnings: extraction.warnings.length > 0 ? extraction.warnings : undefined,
    processedAt
  };
  output.updatedAsset = updatedAsset;

  return appendAuditEvent({
    ...state,
    sourceAssets: state.sourceAssets.map((item) => (item.id === sourceId ? updatedAsset : item)),
    extractionDrafts: [...state.extractionDrafts, ...output.drafts]
  }, {
    actor,
    at: processedAt,
    action: "source_asset.processed",
    entityType: "source_asset",
    entityId: sourceId,
    languageId: stored.languageId,
    summary: `Processed source "${stored.title}" into ${output.drafts.length} extraction drafts.`,
    metadata: {
      draftCount: output.drafts.length,
      warningCount: extraction.warnings.length
    }
  });
}

function isAsyncProcessRequested(body: unknown): boolean {
  return Boolean(
    body
    && typeof body === "object"
    && !Array.isArray(body)
    && (body as Record<string, unknown>).async === true
  );
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
      skipped.push({ path: directory, reason: error instanceof Error ? error.message : "Directory could not be read." });
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
  const { readState, updateState, checkRateLimit, authToken, prototypeSessions, llmProvider, dataDir, ingestionFetch, jobQueue } = ctx;

  app.get("/languages/:languageId/sources", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin", "programmer"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }
    return state.sourceAssets.filter((asset) => asset.languageId === languageId);
  });

  app.post("/languages/:languageId/sources", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const body = parseSourceRegistrationBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid source body: provide kind (text|wordlist|url), title, and rawText or url" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

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

      return appendAuditEvent({
        ...state,
        sourceAssets: [...state.sourceAssets, asset]
      }, {
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
      });
    });

    if (languageMissing) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    if (!asset) {
      reply.code(500);
      return { error: "Source could not be registered" };
    }

    reply.code(201);
    return asset;
  });

  app.post("/languages/:languageId/sources/obsidian-vault", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const body = parseObsidianVaultImportBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid Obsidian vault import body: provide vaultPath, includeSubfolders, and maxFiles" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    if (!current.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    let rootPath: string;
    try {
      rootPath = await assertObsidianVaultPathAllowed(body.vaultPath);
    } catch (error) {
      reply.code(400);
      return { error: error instanceof Error ? error.message : "Obsidian vault path is not allowed." };
    }

    const vaultLabel = vaultAuditLabel(rootPath);
    const skipped: VaultSkippedFile[] = [];
    const warnings: string[] = [];

    try {
      const rootStat = await stat(rootPath);
      if (!rootStat.isDirectory()) {
        reply.code(400);
        return { error: "Obsidian vault path is not a directory." };
      }
    } catch {
      reply.code(400);
      return { error: "Obsidian vault path could not be read." };
    }

    const markdownFiles = await collectObsidianMarkdownFiles(
      rootPath,
      body.includeSubfolders,
      body.maxFiles,
      skipped
    );
    if (markdownFiles.length >= body.maxFiles) {
      warnings.push(`Import stopped at the configured ${body.maxFiles} file limit.`);
    }

    const importedAssets: SourceAsset[] = [];
    for (const filePath of markdownFiles) {
      const relativePath = relative(rootPath, filePath).split("\\").join("/");
      try {
        const fileStat = await stat(filePath);
        if (fileStat.size > MAX_OBSIDIAN_MARKDOWN_BYTES) {
          skipped.push({ path: relativePath, reason: "Markdown file is larger than the 1 MB import limit." });
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
        skipped.push({ path: relativePath, reason: error instanceof Error ? error.message : "Markdown file could not be imported." });
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

    await updateState((state) => appendAuditEvent({
      ...state,
      sourceAssets: [...state.sourceAssets, ...importedAssets]
    }, {
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
    }));

    reply.code(201);
    return {
      imported: importedAssets,
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
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    if (!current.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    const file = await request.file();
    if (!file) {
      reply.code(400);
      return { error: "Upload requires a multipart file field" };
    }

    const buffer = await file.toBuffer();
    if (buffer.length === 0) {
      reply.code(400);
      return { error: "Uploaded file is empty" };
    }

    const originalName = sanitizeStoredFileName(file.filename ?? "upload");
    const assetId = `source-${randomUUID()}`;
    const relativePath = join("assets", languageId, `${assetId}__${originalName}`);
    const absolutePath = resolvePath(dataDir, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);

    const mimeType = file.mimetype || "application/octet-stream";
    const kind = sourceKindForUpload(mimeType, originalName);
    const titleField = file.fields?.title;
    const titleValue = titleField && "value" in (titleField as object)
      ? String((titleField as { value: unknown }).value ?? "").trim()
      : "";

    let asset: SourceAsset | undefined;

    await updateState((state) => {
      const createdAt = new Date().toISOString();
      asset = {
        id: assetId,
        languageId,
        kind,
        title: titleValue || originalName,
        originalName,
        mimeType,
        filePath: relativePath.split("\\").join("/"),
        status: "pending",
        createdBy: actor.id,
        createdAt
      };

      return appendAuditEvent({
        ...state,
        sourceAssets: [...state.sourceAssets, asset]
      }, {
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
      });
    });

    if (!asset) {
      reply.code(500);
      return { error: "Source could not be stored" };
    }

    reply.code(201);
    return asset;
  });

  app.post("/sources/:sourceId/process", async (request, reply) => {
    const { sourceId } = request.params as { sourceId: string };

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    const asset = current.sourceAssets.find((item) => item.id === sourceId);
    if (!asset) {
      reply.code(404);
      return { error: `Source not found: ${sourceId}` };
    }

    const language = current.languages.find((item) => item.id === asset.languageId);
    if (!language) {
      reply.code(404);
      return { error: `Language not found: ${asset.languageId}` };
    }

    if (asset.status === "processing" || jobQueue.isQueuedOrActive(sourceId)) {
      reply.code(409);
      return {
        error: `Source is already processing: ${sourceId}`,
        i18nKey: "ingest.sourceAlreadyProcessing"
      };
    }

    if ((asset.processingAttempts ?? 0) >= MAX_SOURCE_PROCESSING_ATTEMPTS) {
      reply.code(409);
      return {
        error: `Source processing attempt limit reached (${MAX_SOURCE_PROCESSING_ATTEMPTS}).`,
        i18nKey: "ingest.sourceMaxProcessingAttempts",
        i18nParams: { max: MAX_SOURCE_PROCESSING_ATTEMPTS, count: asset.processingAttempts ?? 0 }
      };
    }

    const asyncRequested = isAsyncProcessRequested(request.body);
    let claimed: SourceAsset | undefined;
    let alreadyProcessing = false;

    await updateState((state) => {
      const stored = state.sourceAssets.find((item) => item.id === sourceId);
      if (!stored) return state;
      if (stored.status === "processing" || jobQueue.isQueuedOrActive(sourceId)) {
        alreadyProcessing = true;
        return state;
      }

      const processingStartedAt = new Date().toISOString();
      const processingHeartbeatAt = processingStartedAt;
      const processingAttempts = (stored.processingAttempts ?? 0) + 1;
      claimed = {
        ...stored,
        status: "processing",
        error: undefined,
        processingStartedAt,
        processingHeartbeatAt,
        processingAttempts
      };
      return appendAuditEvent({
        ...state,
        sourceAssets: state.sourceAssets.map((item) => (item.id === sourceId ? claimed as SourceAsset : item))
      }, {
        actor,
        action: "source_asset.process_started",
        entityType: "source_asset",
        entityId: sourceId,
        languageId: stored.languageId,
        summary: asyncRequested
          ? `Started background processing for source "${stored.title}".`
          : `Started processing for source "${stored.title}".`,
        metadata: { kind: stored.kind, async: asyncRequested, processingAttempts, processingStartedAt, processingHeartbeatAt }
      });
    });

    if (alreadyProcessing) {
      reply.code(409);
      return {
        error: `Source is already processing: ${sourceId}`,
        i18nKey: "ingest.sourceAlreadyProcessing"
      };
    }

    if (!claimed) {
      reply.code(404);
      return { error: `Source not found: ${sourceId}` };
    }

    const claimedAsset = claimed;

    if (asyncRequested) {
      const touchProcessingHeartbeat = async () => {
        const heartbeatAt = new Date().toISOString();
        await updateState((state) => ({
          ...state,
          sourceAssets: state.sourceAssets.map((item) => (
            item.id === sourceId && item.status === "processing"
              ? { ...item, processingHeartbeatAt: heartbeatAt }
              : item
          ))
        }));
      };

      jobQueue.add(sourceId, async () => {
        let extraction: SourceExtractionResult | undefined;
        let extractionError: string | undefined;
        try {
          extraction = await extractCandidatesForAsset({
            asset: claimedAsset,
            language,
            provider: llmProvider,
            dataDir,
            fetchFn: ingestionFetch,
            onProgress: touchProcessingHeartbeat
          });
        } catch (error) {
          extractionError = redactErrorSecrets(error instanceof Error ? error.message : "Source processing failed.");
        }

        const output: SourceProcessCompletionOutput = { drafts: [] };
        await updateState((state) => applySourceProcessCompletion(state, {
          sourceId,
          actor,
          processedAt: new Date().toISOString(),
          extraction,
          extractionError
        }, output));
      });

      reply.code(202);
      return { asset: claimedAsset, drafts: [], warnings: [] };
    }

    let extraction: SourceExtractionResult | undefined;
    let extractionError: string | undefined;
    try {
      extraction = await extractCandidatesForAsset({
        asset: claimedAsset,
        language,
        provider: llmProvider,
        dataDir,
        fetchFn: ingestionFetch
      });
    } catch (error) {
      extractionError = redactErrorSecrets(error instanceof Error ? error.message : "Source processing failed.");
    }

    const processedAt = new Date().toISOString();
    const output: SourceProcessCompletionOutput = { drafts: [] };

    await updateState((state) => applySourceProcessCompletion(state, {
      sourceId,
      actor,
      processedAt,
      extraction,
      extractionError
    }, output));

    if (!output.updatedAsset) {
      reply.code(500);
      return { error: "Source could not be processed" };
    }

    if (!extraction) {
      reply.code(422);
      const i18n = extractionError ? sourceProcessingErrorI18n(extractionError) : undefined;
      return {
        error: extractionError ?? "Source processing failed.",
        asset: output.updatedAsset,
        ...(i18n ? { i18nKey: i18n.i18nKey, i18nParams: i18n.i18nParams } : {})
      };
    }

    return {
      asset: output.updatedAsset,
      drafts: output.drafts,
      warnings: extraction.warnings
    };
  });
}
