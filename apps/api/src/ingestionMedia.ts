import { deflateSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSourceAssetFilePath, type SourceAsset } from "@assini/db";
import { normalizeHttpBaseUrl } from "./llmEnvShared.js";
import { redactErrorSecrets } from "./secretRedaction.js";
import { assertOutboundHttpUrlAllowed, fetchOutboundHttp } from "./urlSafety.js";

export type Env = Record<string, string | undefined>;
export type FetchFn = typeof fetch;
export type LookupFn = (hostname: string) => Promise<{ address: string; family: number }>;

export const MAX_URL_CONTENT_BYTES = 2_000_000;
export const MAX_MODEL_RESPONSE_BYTES = 4 * 1024 * 1024;
export const TRANSCRIPTION_TIMEOUT_MS = 120_000;
export const OCR_TIMEOUT_MS = 180_000;

const TEXT_DOCUMENT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "tsv", "json", "text"]);

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

export async function fetchUrlText(
  url: string,
  fetchFn: FetchFn = globalThis.fetch,
  options: { env?: Env; lookupFn?: LookupFn } = {}
): Promise<string> {
  const env = options.env ?? process.env;
  const response = await fetchOutboundHttp(
    url,
    {
      headers: { Accept: "text/html, text/plain;q=0.9, */*;q=0.1" }
    },
    {
      env,
      fetchFn,
      lookupFn: options.lookupFn,
      operation: "Source URL request",
      maxResponseBytes: MAX_URL_CONTENT_BYTES,
      responseSizeErrorMessage: "Source URL content is too large to process locally."
    }
  );
  if (!response.ok) {
    throw new Error(`Fetching source URL failed with status ${response.status}.`);
  }

  const body = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const text = contentType.includes("html") || /<\s*(html|body|p|div)[\s>]/i.test(body) ? htmlToText(body) : body;

  if (text.trim().length === 0) {
    throw new Error("Source URL returned no readable text content.");
  }
  return text;
}

export async function transcribeAudioFile(params: {
  filePath: string;
  mimeType?: string;
  originalName?: string;
  env?: Env;
  fetchFn?: FetchFn;
}): Promise<string> {
  const env = params.env ?? process.env;
  const fetchFn = params.fetchFn ?? globalThis.fetch;
  const baseUrl = env.ASSINI_TRANSCRIBE_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error(
      "Audio sources need a transcription endpoint. Set ASSINI_TRANSCRIBE_BASE_URL to an OpenAI-compatible /audio/transcriptions server (for example a local whisper server)."
    );
  }

  const model = env.ASSINI_TRANSCRIBE_MODEL?.trim() || "whisper-1";
  const apiKey = env.ASSINI_TRANSCRIBE_API_KEY?.trim();

  const parsedBase = await assertOutboundHttpUrlAllowed(baseUrl, { env });
  const transcriptionUrl = `${parsedBase.toString().replace(/\/+$/, "")}/audio/transcriptions`;

  const data = await readFile(params.filePath);
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(data)], { type: params.mimeType ?? "application/octet-stream" }),
    params.originalName ?? "audio-source"
  );
  form.append("model", model);
  form.append("response_format", "json");

  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response: Response;
  try {
    response = await fetchOutboundHttp(
      transcriptionUrl,
      {
        method: "POST",
        headers,
        body: form
      },
      {
        env,
        fetchFn,
        timeoutMs: TRANSCRIPTION_TIMEOUT_MS,
        maxResponseBytes: MAX_MODEL_RESPONSE_BYTES,
        operation: "Transcription request",
        secrets: [apiKey]
      }
    );
  } catch (error) {
    const reason = redactErrorSecrets(error instanceof Error ? error.message : String(error));
    throw new Error(`Transcription request failed: ${reason}`);
  }
  if (!response.ok) {
    throw new Error(`Transcription request failed with status ${response.status}.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Transcription endpoint returned invalid JSON.");
  }
  const text = (payload as { text?: unknown }).text;
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Transcription endpoint returned no text.");
  }
  return text.trim();
}

export function ocrModelConfigured(env: Env = process.env): boolean {
  return Boolean(normalizeHttpBaseUrl(env.ASSINI_OCR_BASE_URL));
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngCrc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index]!;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(pngCrc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodeRawImageAsPng(width: number, height: number, channels: 1 | 3 | 4, pixels: Uint8ClampedArray): Buffer {
  const colorType = channels === 1 ? 0 : channels === 3 ? 2 : 6;
  const rowBytes = width * channels;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const rowStart = row * (rowBytes + 1);
    raw[rowStart] = 0;
    for (let column = 0; column < rowBytes; column += 1) {
      raw[rowStart + 1 + column] = pixels[row * rowBytes + column]!;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

type ExtractedPdfImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: 1 | 3 | 4;
  key: string;
};

function largestPdfPageImage(images: ExtractedPdfImage[]): ExtractedPdfImage | undefined {
  let best: ExtractedPdfImage | undefined;
  let bestArea = 0;
  for (const image of images) {
    const area = image.width * image.height;
    if (area > bestArea) {
      best = image;
      bestArea = area;
    }
  }
  return best;
}

/** Default cap for scanned-PDF OCR pages; override with ASSINI_OCR_PDF_MAX_PAGES. */
export const DEFAULT_OCR_PDF_MAX_PAGES = 10;

export function resolveOcrPdfMaxPages(env: Env = process.env): number {
  const raw = env.ASSINI_OCR_PDF_MAX_PAGES?.trim();
  if (!raw) return DEFAULT_OCR_PDF_MAX_PAGES;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return DEFAULT_OCR_PDF_MAX_PAGES;
}

export type ScannedPdfOcrResult = {
  text: string;
  totalPages: number;
  pagesAttempted: number;
  pagesSucceeded: number;
  maxPages: number;
  warnings: string[];
};

/**
 * Reads pages 1..N of a scanned PDF by extracting the largest embedded image
 * per page (typical for image-only PDFs) and sending each to the configured
 * OCR model. Soft-fails per page (warn + continue). Caps at
 * ASSINI_OCR_PDF_MAX_PAGES (default 10). Concatenates successful pages with
 * markers when more than one page is attempted.
 */
export async function ocrScannedPdfPages(params: {
  pdfBytes: Uint8Array;
  totalPages: number;
  env?: Env;
  fetchFn?: FetchFn;
  tempDir?: string;
}): Promise<ScannedPdfOcrResult> {
  const env = params.env ?? process.env;
  const totalPages = Math.max(1, Math.floor(params.totalPages) || 1);
  const maxPages = resolveOcrPdfMaxPages(env);
  const pagesAttempted = Math.min(totalPages, maxPages);
  const { extractImages } = await import("unpdf");
  const workDir = params.tempDir ?? (await mkdtemp(join(tmpdir(), "assini-pdf-ocr-")));
  const shouldCleanup = params.tempDir === undefined;
  const pageTexts: Array<{ page: number; text: string }> = [];
  const warnings: string[] = [];
  let sawEmbeddedImage = false;
  let lastHardOcrFailure: string | undefined;

  try {
    for (let page = 1; page <= pagesAttempted; page += 1) {
      let images: ExtractedPdfImage[];
      try {
        images = await extractImages(params.pdfBytes, page);
      } catch (error) {
        const reason = redactErrorSecrets(error instanceof Error ? error.message : String(error));
        warnings.push(`OCR skipped page ${page} (could not extract page image: ${reason}).`);
        continue;
      }

      const pageImage = largestPdfPageImage(images);
      if (!pageImage) {
        warnings.push(`OCR skipped page ${page} (no embedded page image).`);
        continue;
      }
      sawEmbeddedImage = true;

      const pngBytes = encodeRawImageAsPng(pageImage.width, pageImage.height, pageImage.channels, pageImage.data);
      const imagePath = join(workDir, `page-${page}.png`);
      try {
        await writeFile(imagePath, pngBytes);
        const text = await ocrImageWithModel({
          filePath: imagePath,
          mimeType: "image/png",
          env,
          fetchFn: params.fetchFn
        });
        if (text.trim().length === 0) {
          warnings.push(`OCR skipped page ${page} (model returned no text).`);
          continue;
        }
        pageTexts.push({ page, text: text.trim() });
      } catch (error) {
        const reason = redactErrorSecrets(error instanceof Error ? error.message : String(error));
        lastHardOcrFailure = reason;
        warnings.push(`OCR failed for page ${page}; continuing with remaining pages.`);
      }
    }
  } finally {
    if (shouldCleanup) {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  if (pageTexts.length === 0) {
    if (!sawEmbeddedImage) {
      throw new Error(
        "The PDF has no embedded page image to OCR. Export pages as images and upload them, or OCR the document externally."
      );
    }
    throw new Error(lastHardOcrFailure ?? "OCR model returned no readable text from any page.");
  }

  if (totalPages > maxPages) {
    warnings.push(
      `PDF has ${totalPages} pages; only the first ${maxPages} pages were OCR'd. Raise ASSINI_OCR_PDF_MAX_PAGES or split remaining pages into separate sources if you need them.`
    );
  }

  const useMarkers = pagesAttempted > 1;
  const text = useMarkers
    ? pageTexts.map(({ page, text: pageText }) => `--- Page ${page} ---\n${pageText}`).join("\n\n")
    : pageTexts[0]!.text;

  return {
    text,
    totalPages,
    pagesAttempted,
    pagesSucceeded: pageTexts.length,
    maxPages,
    warnings
  };
}

/** @deprecated Prefer ocrScannedPdfPages; kept for callers that only need page 1. */
export async function ocrScannedPdfFirstPage(params: {
  pdfBytes: Uint8Array;
  env?: Env;
  fetchFn?: FetchFn;
  tempDir?: string;
}): Promise<string> {
  const result = await ocrScannedPdfPages({
    ...params,
    totalPages: 1,
    env: {
      ...(params.env ?? process.env),
      ASSINI_OCR_PDF_MAX_PAGES: "1"
    }
  });
  return result.text;
}

function parseOcrModelContent(content: unknown): string | undefined {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const parts = content
    .filter(
      (part): part is { type: string; text: string } =>
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
    )
    .map((part) => part.text);
  return parts.length > 0 ? parts.join("") : undefined;
}

export async function ocrImageWithModel(params: {
  filePath: string;
  mimeType?: string;
  env?: Env;
  fetchFn?: FetchFn;
}): Promise<string> {
  const env = params.env ?? process.env;
  const fetchFn = params.fetchFn ?? globalThis.fetch;
  const baseUrl = env.ASSINI_OCR_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error(
      "OCR model endpoint is not configured. Set ASSINI_OCR_BASE_URL to an OpenAI-compatible /chat/completions server (for example a local llava server)."
    );
  }

  const model = env.ASSINI_OCR_MODEL?.trim() || "llava";
  const apiKey = env.ASSINI_OCR_API_KEY?.trim();

  const parsedBase = await assertOutboundHttpUrlAllowed(baseUrl, { env });
  const completionsUrl = `${parsedBase.toString().replace(/\/+$/, "")}/chat/completions`;

  const data = await readFile(params.filePath);
  const mimeType = params.mimeType ?? "application/octet-stream";
  const base64Data = data.toString("base64");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response: Response;
  try {
    response = await fetchOutboundHttp(
      completionsUrl,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract all readable text from this image. Return plain text only — no commentary, explanation, or JSON."
                },
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeType};base64,${base64Data}` }
                }
              ]
            }
          ]
        })
      },
      {
        env,
        fetchFn,
        timeoutMs: OCR_TIMEOUT_MS,
        maxResponseBytes: MAX_MODEL_RESPONSE_BYTES,
        operation: "OCR model request",
        secrets: [apiKey]
      }
    );
  } catch (error) {
    const reason = redactErrorSecrets(error instanceof Error ? error.message : String(error));
    throw new Error(`OCR model request failed: ${reason}`);
  }
  if (!response.ok) {
    throw new Error(`OCR model request failed with status ${response.status}.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("OCR model endpoint returned invalid JSON.");
  }

  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("OCR model endpoint returned no choices.");
  }

  const content = (choices[0] as { message?: { content?: unknown } }).message?.content;
  const text = parseOcrModelContent(content);
  if (!text || text.trim().length === 0) {
    throw new Error("OCR model endpoint returned no text.");
  }
  return text.trim();
}

/**
 * Reads printed/handwritten text out of an image with local OCR
 * (tesseract.js). Used as the image fallback when no vision-capable model
 * is configured. The OCR language comes from ASSINI_OCR_LANG (default
 * "eng"); the first use of a language downloads its trained data from the
 * tesseract.js CDN (a few MB, internet required once) and caches it under
 * `cachePath` when provided.
 */
export async function ocrImageFile(params: {
  filePath: string;
  lang?: string;
  env?: Env;
  cachePath?: string;
}): Promise<string> {
  const env = params.env ?? process.env;
  const lang = params.lang?.trim() || env.ASSINI_OCR_LANG?.trim() || "eng";

  const { createWorker } = await import("tesseract.js");
  if (params.cachePath) {
    await mkdir(params.cachePath, { recursive: true });
  }
  const worker = await createWorker(lang, undefined, params.cachePath ? { cachePath: params.cachePath } : {});
  try {
    const { data } = await worker.recognize(params.filePath);
    const text = data.text.trim();
    if (text.length === 0) {
      throw new Error("OCR found no readable text in the image.");
    }
    return text;
  } finally {
    await worker.terminate();
  }
}

function documentExtension(asset: SourceAsset): string {
  const name = asset.originalName ?? asset.filePath ?? "";
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export async function resolveAssetText(
  asset: SourceAsset,
  dataDir: string,
  env: Env,
  fetchFn: FetchFn,
  lookupFn?: LookupFn
): Promise<{ text: string; transcript?: string; warnings: string[] }> {
  const warnings: string[] = [];

  if (asset.kind === "url") {
    if (!asset.url) throw new Error("URL source asset has no URL.");
    return { text: await fetchUrlText(asset.url, fetchFn, { env, lookupFn }), warnings };
  }

  if (asset.kind === "audio") {
    if (!asset.filePath) throw new Error("Audio source asset has no stored file.");
    const absolutePath = resolveSourceAssetFilePath(dataDir, asset.filePath, asset.languageId);
    const transcript =
      asset.transcript ??
      (await transcribeAudioFile({
        filePath: absolutePath,
        mimeType: asset.mimeType,
        originalName: asset.originalName,
        env,
        fetchFn
      }));
    return { text: transcript, transcript, warnings };
  }

  if (asset.kind === "text" || asset.kind === "wordlist") {
    if (asset.rawText !== undefined && asset.rawText.trim().length > 0) {
      return { text: asset.rawText, warnings };
    }
    if (asset.filePath) {
      return {
        text: await readFile(resolveSourceAssetFilePath(dataDir, asset.filePath, asset.languageId), "utf8"),
        warnings
      };
    }
    throw new Error("Text source asset has no content.");
  }

  if (asset.kind === "document") {
    if (!asset.filePath) throw new Error("Document source asset has no stored file.");
    const extension = documentExtension(asset);
    const absolutePath = resolveSourceAssetFilePath(dataDir, asset.filePath, asset.languageId);

    if (extension === "pdf") {
      const { extractText } = await import("unpdf");
      const data = await readFile(absolutePath);
      const pdfBytes = new Uint8Array(data);
      const { text, totalPages } = await extractText(pdfBytes, { mergePages: true });
      if (text.trim().length === 0) {
        if (!ocrModelConfigured(env)) {
          throw new Error(
            "The PDF contains no extractable text — it may be a scanned image. Configure ASSINI_OCR_BASE_URL with a vision-capable OCR model to read scanned PDFs."
          );
        }
        let ocrResult: ScannedPdfOcrResult;
        try {
          ocrResult = await ocrScannedPdfPages({
            pdfBytes,
            totalPages,
            env,
            fetchFn
          });
        } catch (error) {
          const reason = redactErrorSecrets(error instanceof Error ? error.message : String(error));
          // Preserve the page-image guidance so clients map to ingest.ocrPdfNoImage
          // instead of the generic configured-model failure key.
          if (/no embedded page image to OCR/i.test(reason)) {
            throw new Error(reason);
          }
          throw new Error(`Configured OCR model could not read the scanned PDF: ${reason}`);
        }
        warnings.push(
          `Used configured OCR model to read scanned document (${ocrResult.pagesSucceeded} of ${ocrResult.pagesAttempted} pages).`
        );
        warnings.push(...ocrResult.warnings);
        return { text: ocrResult.text, warnings };
      }
      return { text, warnings };
    }

    if (extension === "docx") {
      const mammoth = (await import("mammoth")).default;
      const data = await readFile(absolutePath);
      const { value } = await mammoth.extractRawText({ buffer: data });
      if (value.trim().length === 0) {
        throw new Error(
          "The document contains no extractable text — it may be a scanned image; OCR is not supported yet."
        );
      }
      return { text: value, warnings };
    }

    if (!TEXT_DOCUMENT_EXTENSIONS.has(extension)) {
      throw new Error(
        `Document type .${extension || "unknown"} is not supported yet. Upload a PDF, DOCX, plain-text, Markdown, or CSV file, or convert it first.`
      );
    }
    return { text: await readFile(absolutePath, "utf8"), warnings };
  }

  throw new Error(`Unsupported source kind for text extraction: ${asset.kind}`);
}
