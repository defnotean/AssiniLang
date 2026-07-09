import { deflateSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { resolveSourceAssetFilePath, type ExtractionDraftKind, type ExtractionDraftPayload, type Language, type SourceAsset } from "@assini/db";
import type { LlmChatMessage, LlmProvider } from "./llmProvider.js";
import { normalizeHttpBaseUrl } from "./llmEnvShared.js";
import { parseModelJson } from "./modelJson.js";
import { redactErrorSecrets } from "./secretRedaction.js";
import { assertOutboundHttpUrlAllowed } from "./urlSafety.js";

type Env = Record<string, string | undefined>;
type FetchFn = typeof fetch;
type LookupFn = (hostname: string) => Promise<{ address: string; family: number }>;

export type ExtractionCandidate = {
  kind: ExtractionDraftKind;
  payload: ExtractionDraftPayload;
  confidence: "low" | "medium" | "high";
  rationale?: string;
};

export type SourceExtractionResult = {
  candidates: ExtractionCandidate[];
  summary: string;
  warnings: string[];
  transcript?: string;
};

const CHUNK_TARGET_CHARS = 12_000;
const MAX_CHUNKS_PER_SOURCE = 8;
const MAX_CANDIDATES_PER_KIND = 100;
const MAX_URL_CONTENT_BYTES = 2_000_000;
const MAX_MERGED_SUMMARY_CHARS = 300;

const TEXT_DOCUMENT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "tsv", "json", "text"]);

const confidenceSchema = z.enum(["low", "medium", "high"]).catch("medium");

const llmExtractionSchema = z.object({
  summary: z.string().optional(),
  lexemes: z.array(z.object({
    form: z.string(),
    gloss: z.string(),
    partOfSpeech: z.string().optional(),
    tags: z.array(z.string()).optional(),
    confidence: confidenceSchema.optional(),
    rationale: z.string().optional()
  })).optional(),
  passages: z.array(z.object({
    textTarget: z.string(),
    textTranslation: z.string(),
    topicTags: z.array(z.string()).optional(),
    morphemes: z.array(z.object({
      surface: z.string(),
      lemma: z.string().optional(),
      gloss: z.string().optional(),
      features: z.array(z.string()).optional()
    })).optional(),
    confidence: confidenceSchema.optional(),
    rationale: z.string().optional()
  })).optional(),
  grammarNotes: z.array(z.object({
    topic: z.string(),
    explanation: z.string(),
    confidence: confidenceSchema.optional(),
    rationale: z.string().optional()
  })).optional()
});

function normalizeSourceText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

/**
 * Splits normalized text into chunks of at most `maxChars` characters on
 * paragraph/line boundaries. A single line longer than `maxChars` (no
 * usable boundary) is hard-split as a last resort.
 */
export function splitTextIntoChunks(text: string, maxChars = CHUNK_TARGET_CHARS): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    const pieces = line.length > maxChars
      ? line.match(new RegExp(`[\\s\\S]{1,${maxChars}}`, "g")) ?? []
      : [line];
    for (const piece of pieces) {
      if (current.length > 0 && current.length + piece.length + 1 > maxChars) {
        chunks.push(current);
        current = piece;
      } else {
        current = current.length > 0 ? `${current}\n${piece}` : piece;
      }
    }
  }
  if (current.trim().length > 0) {
    chunks.push(current);
  }
  return chunks;
}

function dedupeTags(tags: string[] | undefined, fallback: string): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const tag of tags ?? []) {
    const trimmed = tag.trim();
    const key = trimmed.toLowerCase();
    if (trimmed.length === 0 || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(trimmed);
  }
  return cleaned.length > 0 ? cleaned : [fallback];
}

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
  const parsed = await assertOutboundHttpUrlAllowed(url, { env, lookupFn: options.lookupFn });

  const response = await fetchFn(parsed.toString(), {
    headers: { Accept: "text/html, text/plain;q=0.9, */*;q=0.1" },
    redirect: "manual"
  });
  if (!response.ok) {
    throw new Error(`Fetching source URL failed with status ${response.status}.`);
  }

  const body = await response.text();
  if (body.length > MAX_URL_CONTENT_BYTES) {
    throw new Error("Source URL content is too large to process locally.");
  }

  const contentType = response.headers.get("content-type") ?? "";
  const text = contentType.includes("html") || /<\s*(html|body|p|div)[\s>]/i.test(body)
    ? htmlToText(body)
    : body;

  if (text.trim().length === 0) {
    throw new Error("Source URL returned no readable text content.");
  }
  return text;
}

export async function transcribeAudioFile(
  params: {
    filePath: string;
    mimeType?: string;
    originalName?: string;
    env?: Env;
    fetchFn?: FetchFn;
  }
): Promise<string> {
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
    response = await fetchFn(transcriptionUrl, {
      method: "POST",
      headers,
      body: form,
      redirect: "manual"
    });
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

function encodeRawImageAsPng(
  width: number,
  height: number,
  channels: 1 | 3 | 4,
  pixels: Uint8ClampedArray
): Buffer {
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

/**
 * Reads page 1 of a scanned PDF by extracting the largest embedded page image
 * (typical for image-only PDFs) and sending it to the configured OCR model.
 * Only page 1 is processed; multi-page scans are not merged.
 */
export async function ocrScannedPdfFirstPage(
  params: {
    pdfBytes: Uint8Array;
    env?: Env;
    fetchFn?: FetchFn;
    tempDir?: string;
  }
): Promise<string> {
  const { extractImages } = await import("unpdf");
  const images = await extractImages(params.pdfBytes, 1);
  const pageImage = largestPdfPageImage(images);
  if (!pageImage) {
    throw new Error(
      "The PDF has no embedded page image to OCR. Export page 1 as an image and upload it, or OCR the document externally."
    );
  }

  const pngBytes = encodeRawImageAsPng(
    pageImage.width,
    pageImage.height,
    pageImage.channels,
    pageImage.data
  );
  const workDir = params.tempDir ?? await mkdtemp(join(tmpdir(), "assini-pdf-ocr-"));
  const imagePath = join(workDir, "page-1.png");
  const shouldCleanup = params.tempDir === undefined;

  try {
    await writeFile(imagePath, pngBytes);
    return await ocrImageWithModel({
      filePath: imagePath,
      mimeType: "image/png",
      env: params.env,
      fetchFn: params.fetchFn
    });
  } finally {
    if (shouldCleanup) {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}

function parseOcrModelContent(content: unknown): string | undefined {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const parts = content
    .filter((part): part is { type: string; text: string } =>
      typeof part === "object"
      && part !== null
      && "type" in part
      && part.type === "text"
      && typeof (part as { text?: unknown }).text === "string"
    )
    .map((part) => part.text);
  return parts.length > 0 ? parts.join("") : undefined;
}

export async function ocrImageWithModel(
  params: {
    filePath: string;
    mimeType?: string;
    env?: Env;
    fetchFn?: FetchFn;
  }
): Promise<string> {
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
    response = await fetchFn(completionsUrl, {
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
      }),
      redirect: "manual"
    });
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
export async function ocrImageFile(
  params: { filePath: string; lang?: string; env?: Env; cachePath?: string }
): Promise<string> {
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

function extractionInstructions(language: Language, sourceKind: SourceAsset["kind"]): string {
  const phonologyNote = language.phonology
    ? `Declared phonology inventory - consonants: ${language.phonology.consonants.join(", ") || "(none)"}; vowels: ${language.phonology.vowels.join(", ") || "(none)"}.`
    : "No phonology inventory has been declared yet.";

  return [
    `You are a careful linguistic field-data assistant. The user is documenting the language "${language.name}".`,
    `Language description: ${language.description}`,
    `Orthography: ${language.orthography}`,
    phonologyNote,
    sourceKind === "wordlist"
      ? "The content is a word list. Prefer extracting lexemes (one per entry)."
      : "The content is raw documentation material (notes, stories, examples, captions, or a transcript).",
    "Extract ONLY information that is actually present in the content. Never invent words, translations, or rules.",
    "Respond with a single JSON object and nothing else, using exactly this shape:",
    JSON.stringify({
      summary: "one-sentence description of what the content contains",
      lexemes: [{ form: "word or affix in the target language", gloss: "meaning", partOfSpeech: "noun|verb|suffix|particle|...", tags: ["optional"], confidence: "low|medium|high", rationale: "why" }],
      passages: [{ textTarget: "sentence or phrase in the target language", textTranslation: "translation", topicTags: ["topic"], morphemes: [{ surface: "piece", lemma: "base form", gloss: "meaning", features: ["optional"] }], confidence: "low|medium|high", rationale: "why" }],
      grammarNotes: [{ topic: "short/topic/path", explanation: "observed grammar pattern", confidence: "low|medium|high", rationale: "evidence" }]
    }),
    "Important for reasoning-capable local servers: put the JSON in the visible assistant content field, not only in reasoning_content.",
    "Omit morphemes when you are not confident about segmentation. Use empty arrays when a category has no items."
  ].join("\n\n");
}

export function buildTextExtractionMessages(
  language: Language,
  sourceKind: SourceAsset["kind"],
  text: string,
  part?: { index: number; total: number }
): LlmChatMessage[] {
  const partNote = part && part.total > 1 ? ` (part ${part.index} of ${part.total} of a longer source)` : "";
  return [
    { role: "system", content: extractionInstructions(language, sourceKind) },
    { role: "user", content: `Content to analyze${partNote}:\n\n${text}` }
  ];
}

export function buildImageExtractionMessages(language: Language, mimeType: string, base64Data: string): LlmChatMessage[] {
  return [
    { role: "system", content: extractionInstructions(language, "image") },
    {
      role: "user",
      content: [
        { type: "text", text: "Read all language content visible in this image (printed or handwritten) and extract it." },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
      ]
    }
  ];
}

export function parseExtractionResponse(content: string): { candidates: ExtractionCandidate[]; summary: string } | undefined {
  const parsed = parseModelJson(content);
  if (parsed === undefined) return undefined;

  const result = llmExtractionSchema.safeParse(parsed);
  if (!result.success) return undefined;

  const candidates: ExtractionCandidate[] = [];

  for (const lexeme of (result.data.lexemes ?? []).slice(0, MAX_CANDIDATES_PER_KIND)) {
    if (!lexeme.form.trim() || !lexeme.gloss.trim()) continue;
    candidates.push({
      kind: "lexeme",
      payload: {
        form: lexeme.form.trim(),
        gloss: lexeme.gloss.trim(),
        partOfSpeech: lexeme.partOfSpeech?.trim() || "unknown",
        tags: dedupeTags(lexeme.tags, "imported"),
        morphologicalSegmentation: [],
        topicTags: []
      },
      confidence: lexeme.confidence ?? "medium",
      rationale: lexeme.rationale?.trim() || undefined
    });
  }

  for (const passage of (result.data.passages ?? []).slice(0, MAX_CANDIDATES_PER_KIND)) {
    if (!passage.textTarget.trim() || !passage.textTranslation.trim()) continue;
    const morphemes = (passage.morphemes ?? [])
      .filter((morpheme) => morpheme.surface.trim().length > 0)
      .map((morpheme) => ({
        surface: morpheme.surface.trim(),
        lemma: morpheme.lemma?.trim() || morpheme.surface.trim(),
        gloss: morpheme.gloss?.trim() || "unanalyzed",
        features: (morpheme.features ?? []).map((feature) => feature.trim()).filter(Boolean)
      }));
    candidates.push({
      kind: "corpus_passage",
      payload: {
        textTarget: passage.textTarget.trim(),
        textTranslation: passage.textTranslation.trim(),
        morphologicalSegmentation: morphemes,
        topicTags: dedupeTags(passage.topicTags, "imported"),
        tags: []
      },
      confidence: passage.confidence ?? "medium",
      rationale: passage.rationale?.trim() || undefined
    });
  }

  for (const note of (result.data.grammarNotes ?? []).slice(0, MAX_CANDIDATES_PER_KIND)) {
    if (!note.topic.trim() || !note.explanation.trim()) continue;
    candidates.push({
      kind: "grammar_note",
      payload: {
        topic: note.topic.trim(),
        explanation: note.explanation.trim(),
        tags: [],
        morphologicalSegmentation: [],
        topicTags: []
      },
      confidence: note.confidence ?? "medium",
      rationale: note.rationale?.trim() || undefined
    });
  }

  return {
    candidates,
    summary: result.data.summary?.trim() || `Extracted ${candidates.length} candidate items.`
  };
}

function extractionErrorWarning(error: unknown, partLabel: string): string {
  const message = error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "model extraction failed";
  const sanitized = redactErrorSecrets(message)
    .replace(/\s+/g, " ")
    .trim();
  return `Model extraction failed for ${partLabel}: ${sanitized.slice(0, 300)}; fell back to offline heuristics when no usable model output remained.`;
}

function canFallbackFromModelExtractionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("reasoning_content")
    || message.includes("timed out")
    || message.includes("timeout")
    || message.includes("aborterror");
}

function candidateDedupeKey(candidate: ExtractionCandidate): string {
  const payload = candidate.payload;
  if (candidate.kind === "lexeme") {
    return `lexeme:${(payload.form ?? "").toLowerCase()}\u0000${(payload.gloss ?? "").toLowerCase()}`;
  }
  if (candidate.kind === "corpus_passage") {
    return `corpus_passage:${payload.textTarget ?? ""}`;
  }
  return `grammar_note:${payload.topic ?? ""}\u0000${payload.explanation ?? ""}`;
}

function mergeChunkExtractions(
  parts: { candidates: ExtractionCandidate[]; summary: string }[]
): { candidates: ExtractionCandidate[]; summary: string } {
  const seen = new Set<string>();
  const perKindCounts = new Map<ExtractionDraftKind, number>();
  const candidates: ExtractionCandidate[] = [];

  for (const part of parts) {
    for (const candidate of part.candidates) {
      const key = candidateDedupeKey(candidate);
      if (seen.has(key)) continue;
      const count = perKindCounts.get(candidate.kind) ?? 0;
      if (count >= MAX_CANDIDATES_PER_KIND) continue;
      seen.add(key);
      perKindCounts.set(candidate.kind, count + 1);
      candidates.push(candidate);
    }
  }

  const distinctSummaries = [...new Set(parts.map((part) => part.summary.trim()).filter((summary) => summary.length > 0))];
  const combined = distinctSummaries.join(" ");
  const summary = combined.length === 0
    ? `Extracted ${candidates.length} candidate items from ${parts.length} parts.`
    : combined.length > MAX_MERGED_SUMMARY_CHARS
      ? `${combined.slice(0, MAX_MERGED_SUMMARY_CHARS - 3)}...`
      : combined;

  return { candidates, summary };
}

/**
 * Offline fallback used when no real model is configured. Understands
 * simple "target = translation", "target - translation", tab- and
 * pipe-separated lines. Single-token left sides become lexeme drafts;
 * multi-token left sides become corpus passage drafts.
 */
export function heuristicExtractFromText(text: string): { candidates: ExtractionCandidate[]; summary: string } {
  const candidates: ExtractionCandidate[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);

  for (const line of lines) {
    if (candidates.length >= MAX_CANDIDATES_PER_KIND * 2) break;

    let parts: string[] | undefined;
    for (const separator of ["\t", "|", " = ", "=", " — ", " – ", " - "]) {
      if (line.includes(separator)) {
        const split = line.split(separator);
        if (split.length >= 2) {
          parts = [split[0] ?? "", split.slice(1).join(separator)];
          break;
        }
      }
    }
    if (!parts) continue;

    const [left, right] = parts.map((part) => part.trim());
    if (!left || !right) continue;

    if (left.split(/\s+/).length > 1) {
      candidates.push({
        kind: "corpus_passage",
        payload: {
          textTarget: left,
          textTranslation: right,
          morphologicalSegmentation: [],
          topicTags: ["imported"],
          tags: []
        },
        confidence: "low",
        rationale: "Parsed offline from a delimited line; verify before accepting."
      });
    } else {
      candidates.push({
        kind: "lexeme",
        payload: {
          form: left,
          gloss: right,
          partOfSpeech: "unknown",
          tags: ["imported"],
          morphologicalSegmentation: [],
          topicTags: []
        },
        confidence: "low",
        rationale: "Parsed offline from a delimited line; verify before accepting."
      });
    }
  }

  return {
    candidates,
    summary: `Offline heuristic parsing found ${candidates.length} delimited entries across ${lines.length} lines.`
  };
}

function documentExtension(asset: SourceAsset): string {
  const name = asset.originalName ?? asset.filePath ?? "";
  return name.split(".").pop()?.toLowerCase() ?? "";
}

async function resolveAssetText(
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
    const transcript = asset.transcript ?? await transcribeAudioFile({
      filePath: absolutePath,
      mimeType: asset.mimeType,
      originalName: asset.originalName,
      env,
      fetchFn
    });
    return { text: transcript, transcript, warnings };
  }

  if (asset.kind === "text" || asset.kind === "wordlist") {
    if (asset.rawText !== undefined && asset.rawText.trim().length > 0) {
      return { text: asset.rawText, warnings };
    }
    if (asset.filePath) {
      return { text: await readFile(resolveSourceAssetFilePath(dataDir, asset.filePath, asset.languageId), "utf8"), warnings };
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
            "The PDF contains no extractable text — it may be a scanned image. Configure ASSINI_OCR_BASE_URL with a vision-capable OCR model to read scanned PDFs (page 1 only)."
          );
        }
        let ocrText: string;
        try {
          ocrText = await ocrScannedPdfFirstPage({
            pdfBytes,
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
        warnings.push("Used configured OCR model to read scanned document (page 1).");
        if (totalPages > 1) {
          warnings.push(
            `PDF has ${totalPages} pages; only page 1 was OCR'd. Split remaining pages into separate sources if you need them.`
          );
        }
        return { text: ocrText, warnings };
      }
      return { text, warnings };
    }

    if (extension === "docx") {
      const mammoth = (await import("mammoth")).default;
      const data = await readFile(absolutePath);
      const { value } = await mammoth.extractRawText({ buffer: data });
      if (value.trim().length === 0) {
        throw new Error("The document contains no extractable text — it may be a scanned image; OCR is not supported yet.");
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

export async function extractCandidatesForAsset(
  params: {
    asset: SourceAsset;
    language: Language;
    provider: LlmProvider;
    dataDir: string;
    env?: Env;
    fetchFn?: FetchFn;
    lookupFn?: LookupFn;
    onProgress?: () => void | Promise<void>;
  }
): Promise<SourceExtractionResult> {
  const env = params.env ?? process.env;
  const fetchFn = params.fetchFn ?? globalThis.fetch;
  const { asset, language, provider } = params;
  const warnings: string[] = [];

  let resolved: { text: string; transcript?: string; warnings: string[] };

  if (asset.kind === "image") {
    if (!asset.filePath) throw new Error("Image source asset has no stored file.");
    const absolutePath = resolveSourceAssetFilePath(params.dataDir, asset.filePath, asset.languageId);

    if (ocrModelConfigured(env)) {
      let ocrText: string;
      try {
        ocrText = await ocrImageWithModel({
          filePath: absolutePath,
          mimeType: asset.mimeType,
          env,
          fetchFn
        });
      } catch (error) {
        const reason = redactErrorSecrets(error instanceof Error ? error.message : String(error));
        throw new Error(`Configured OCR model could not read the image: ${reason}`);
      }
      warnings.push("Used configured OCR model to read the image.");
      resolved = { text: ocrText, warnings: [] };
    } else if (provider.completeChat) {
      const imageData = await readFile(absolutePath);
      const messages = buildImageExtractionMessages(language, asset.mimeType ?? "image/png", imageData.toString("base64"));
      const content = await provider.completeChat(messages);
      const parsed = parseExtractionResponse(content);
      if (!parsed) {
        throw new Error(
          "The configured model returned no usable result for this image. It may not be vision-capable. Configure a vision model (for example llava via Ollama) in ASSINI_LLM_MODEL, or rely on the local OCR fallback by leaving the model unset."
        );
      }
      return { ...parsed, warnings };
    } else {
      let ocrText: string;
      try {
        ocrText = await ocrImageFile({
          filePath: absolutePath,
          env,
          cachePath: resolve(params.dataDir, "ocr-cache")
        });
      } catch (error) {
        const reason = redactErrorSecrets(error instanceof Error ? error.message : String(error));
        throw new Error(
          `Local OCR could not read the image: ${reason} Configure a vision-capable model via ASSINI_LLM_PROVIDER (for example llava via Ollama), or provide a clearer image.`
        );
      }
      warnings.push("No vision model configured; used local OCR (tesseract.js) to read the image.");
      resolved = { text: ocrText, warnings: [] };
    }
  } else {
    resolved = await resolveAssetText(asset, params.dataDir, env, fetchFn, params.lookupFn);
  }
  warnings.push(...resolved.warnings);
  const text = normalizeSourceText(resolved.text);
  if (text.length === 0) {
    throw new Error("Source contains no readable text.");
  }

  if (provider.completeChat) {
    const chunks = splitTextIntoChunks(text);
    const processable = chunks.slice(0, MAX_CHUNKS_PER_SOURCE);
    if (chunks.length > MAX_CHUNKS_PER_SOURCE) {
      const skippedChars = chunks
        .slice(MAX_CHUNKS_PER_SOURCE)
        .reduce((total, chunk) => total + chunk.length, 0);
      warnings.push(
        `Source text is very long; only the first ${MAX_CHUNKS_PER_SOURCE} parts were processed and ${skippedChars} characters were skipped.`
      );
    }

    const parsedParts: { candidates: ExtractionCandidate[]; summary: string }[] = [];
    for (const [index, chunk] of processable.entries()) {
      await params.onProgress?.();
      const messages = buildTextExtractionMessages(language, asset.kind, chunk, {
        index: index + 1,
        total: processable.length
      });
      let content: string;
      try {
        content = await provider.completeChat(messages);
      } catch (error) {
        if (!canFallbackFromModelExtractionError(error)) {
          throw error;
        }
        warnings.push(extractionErrorWarning(error, `part ${index + 1} of ${processable.length}`));
        continue;
      }
      const parsed = parseExtractionResponse(content);
      if (parsed) {
        parsedParts.push(parsed);
      } else if (processable.length > 1) {
        warnings.push(`Model output for part ${index + 1} of ${processable.length} was not valid extraction JSON; that part was skipped.`);
      }
    }

    const firstParsed = parsedParts[0];
    if (processable.length === 1 && firstParsed) {
      return { ...firstParsed, warnings, transcript: resolved.transcript };
    }
    if (parsedParts.length > 0) {
      return { ...mergeChunkExtractions(parsedParts), warnings, transcript: resolved.transcript };
    }
    warnings.push("Model output was not valid extraction JSON; fell back to offline heuristics.");
  } else {
    warnings.push("No model configured (deterministic mode); used offline heuristic parsing.");
  }

  const heuristic = heuristicExtractFromText(text);
  return { ...heuristic, warnings, transcript: resolved.transcript };
}
