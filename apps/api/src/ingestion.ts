import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  resolveSourceAssetFilePath,
  type ExtractionDraftKind,
  type ExtractionDraftPayload,
  type Language,
  type SourceAsset
} from "@assini/db";
import type { LlmChatMessage, LlmProvider } from "./llmProvider.js";
import { parseModelJson } from "./modelJson.js";
import { redactErrorSecrets } from "./secretRedaction.js";
import {
  ocrImageFile,
  ocrImageWithModel,
  ocrModelConfigured,
  resolveAssetText,
  type Env,
  type FetchFn,
  type LookupFn
} from "./ingestionMedia.js";

export {
  DEFAULT_OCR_PDF_MAX_PAGES,
  fetchUrlText,
  htmlToText,
  MAX_MODEL_RESPONSE_BYTES,
  MAX_URL_CONTENT_BYTES,
  OCR_TIMEOUT_MS,
  ocrImageFile,
  ocrImageWithModel,
  ocrModelConfigured,
  ocrScannedPdfFirstPage,
  ocrScannedPdfPages,
  resolveOcrPdfMaxPages,
  TRANSCRIPTION_TIMEOUT_MS,
  transcribeAudioFile,
  type ScannedPdfOcrResult
} from "./ingestionMedia.js";

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
const MAX_MERGED_SUMMARY_CHARS = 300;

const confidenceSchema = z.enum(["low", "medium", "high"]).catch("medium");

const llmExtractionSchema = z.object({
  summary: z.string().optional(),
  lexemes: z
    .array(
      z.object({
        form: z.string(),
        gloss: z.string(),
        partOfSpeech: z.string().optional(),
        tags: z.array(z.string()).optional(),
        confidence: confidenceSchema.optional(),
        rationale: z.string().optional()
      })
    )
    .optional(),
  passages: z
    .array(
      z.object({
        textTarget: z.string(),
        textTranslation: z.string(),
        topicTags: z.array(z.string()).optional(),
        morphemes: z
          .array(
            z.object({
              surface: z.string(),
              lemma: z.string().optional(),
              gloss: z.string().optional(),
              features: z.array(z.string()).optional()
            })
          )
          .optional(),
        confidence: confidenceSchema.optional(),
        rationale: z.string().optional()
      })
    )
    .optional(),
  grammarNotes: z
    .array(
      z.object({
        topic: z.string(),
        explanation: z.string(),
        confidence: confidenceSchema.optional(),
        rationale: z.string().optional()
      })
    )
    .optional()
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
    const pieces = line.length > maxChars ? (line.match(new RegExp(`[\\s\\S]{1,${maxChars}}`, "g")) ?? []) : [line];
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
      lexemes: [
        {
          form: "word or affix in the target language",
          gloss: "meaning",
          partOfSpeech: "noun|verb|suffix|particle|...",
          tags: ["optional"],
          confidence: "low|medium|high",
          rationale: "why"
        }
      ],
      passages: [
        {
          textTarget: "sentence or phrase in the target language",
          textTranslation: "translation",
          topicTags: ["topic"],
          morphemes: [{ surface: "piece", lemma: "base form", gloss: "meaning", features: ["optional"] }],
          confidence: "low|medium|high",
          rationale: "why"
        }
      ],
      grammarNotes: [
        {
          topic: "short/topic/path",
          explanation: "observed grammar pattern",
          confidence: "low|medium|high",
          rationale: "evidence"
        }
      ]
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

export function buildImageExtractionMessages(
  language: Language,
  mimeType: string,
  base64Data: string
): LlmChatMessage[] {
  return [
    { role: "system", content: extractionInstructions(language, "image") },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Read all language content visible in this image (printed or handwritten) and extract it."
        },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
      ]
    }
  ];
}

export function parseExtractionResponse(
  content: string
): { candidates: ExtractionCandidate[]; summary: string } | undefined {
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
  const message = error instanceof Error && error.message.trim().length > 0 ? error.message : "model extraction failed";
  const sanitized = redactErrorSecrets(message).replace(/\s+/g, " ").trim();
  return `Model extraction failed for ${partLabel}: ${sanitized.slice(0, 300)}; fell back to offline heuristics when no usable model output remained.`;
}

function canFallbackFromModelExtractionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("reasoning_content") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("aborterror")
  );
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

function mergeChunkExtractions(parts: { candidates: ExtractionCandidate[]; summary: string }[]): {
  candidates: ExtractionCandidate[];
  summary: string;
} {
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

  const distinctSummaries = [
    ...new Set(parts.map((part) => part.summary.trim()).filter((summary) => summary.length > 0))
  ];
  const combined = distinctSummaries.join(" ");
  const summary =
    combined.length === 0
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
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

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

export async function extractCandidatesForAsset(params: {
  asset: SourceAsset;
  language: Language;
  provider: LlmProvider;
  dataDir: string;
  env?: Env;
  fetchFn?: FetchFn;
  lookupFn?: LookupFn;
  onProgress?: () => void | Promise<void>;
  /**
   * Optional in-process retry decision used by source processing. Returning
   * true retries the failed provider call; false preserves the existing
   * fail/fallback behavior. The caller owns persistence and backoff.
   */
  onTransientFailure?: (error: unknown) => boolean | Promise<boolean>;
}): Promise<SourceExtractionResult> {
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
      const messages = buildImageExtractionMessages(
        language,
        asset.mimeType ?? "image/png",
        imageData.toString("base64")
      );
      let content: string;
      while (true) {
        try {
          content = await provider.completeChat(messages);
          break;
        } catch (error) {
          if (await params.onTransientFailure?.(error)) continue;
          throw error;
        }
      }
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
      const skippedChars = chunks.slice(MAX_CHUNKS_PER_SOURCE).reduce((total, chunk) => total + chunk.length, 0);
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
      let content: string | undefined;
      while (content === undefined) {
        try {
          content = await provider.completeChat(messages);
        } catch (error) {
          if (await params.onTransientFailure?.(error)) {
            continue;
          }
          if (!canFallbackFromModelExtractionError(error)) {
            throw error;
          }
          warnings.push(extractionErrorWarning(error, `part ${index + 1} of ${processable.length}`));
          break;
        }
      }
      if (content === undefined) continue;
      const parsed = parseExtractionResponse(content);
      if (parsed) {
        parsedParts.push(parsed);
      } else if (processable.length > 1) {
        warnings.push(
          `Model output for part ${index + 1} of ${processable.length} was not valid extraction JSON; that part was skipped.`
        );
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
