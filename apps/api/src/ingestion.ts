import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { ExtractionDraftKind, ExtractionDraftPayload, Language, SourceAsset } from "@assini/db";
import type { LlmChatMessage, LlmProvider } from "./llmProvider";

type Env = Record<string, string | undefined>;
type FetchFn = typeof fetch;

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

const MAX_SOURCE_TEXT_CHARS = 16_000;
const MAX_CANDIDATES_PER_KIND = 100;
const MAX_URL_CONTENT_BYTES = 2_000_000;

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

function clampText(text: string, maxChars = MAX_SOURCE_TEXT_CHARS): { text: string; truncated: boolean } {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) {
    return { text: normalized, truncated: false };
  }
  return { text: normalized.slice(0, maxChars), truncated: true };
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

export async function fetchUrlText(url: string, fetchFn: FetchFn = globalThis.fetch): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Source URL is not a valid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Source URLs must use http or https.");
  }

  const response = await fetchFn(parsed.toString(), {
    headers: { Accept: "text/html, text/plain;q=0.9, */*;q=0.1" }
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

  const response = await fetchFn(`${baseUrl.replace(/\/+$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers,
    body: form
  });
  if (!response.ok) {
    throw new Error(`Transcription request failed with status ${response.status}.`);
  }

  const payload = await response.json() as { text?: unknown };
  if (typeof payload.text !== "string" || payload.text.trim().length === 0) {
    throw new Error("Transcription endpoint returned no text.");
  }
  return payload.text.trim();
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
    "Omit morphemes when you are not confident about segmentation. Use empty arrays when a category has no items."
  ].join("\n\n");
}

export function buildTextExtractionMessages(language: Language, sourceKind: SourceAsset["kind"], text: string): LlmChatMessage[] {
  return [
    { role: "system", content: extractionInstructions(language, sourceKind) },
    { role: "user", content: `Content to analyze:\n\n${text}` }
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

function stripCodeFences(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1] ?? content;
}

function extractFirstJsonObject(content: string): string | undefined {
  const start = content.indexOf("{");
  if (start < 0) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return content.slice(start, index + 1);
      }
    }
  }
  return undefined;
}

export function parseExtractionResponse(content: string): { candidates: ExtractionCandidate[]; summary: string } | undefined {
  const candidateJson = extractFirstJsonObject(stripCodeFences(content));
  if (!candidateJson) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidateJson);
  } catch {
    return undefined;
  }

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
  fetchFn: FetchFn
): Promise<{ text: string; transcript?: string; warnings: string[] }> {
  const warnings: string[] = [];

  if (asset.kind === "url") {
    if (!asset.url) throw new Error("URL source asset has no URL.");
    return { text: await fetchUrlText(asset.url, fetchFn), warnings };
  }

  if (asset.kind === "audio") {
    if (!asset.filePath) throw new Error("Audio source asset has no stored file.");
    const transcript = asset.transcript ?? await transcribeAudioFile({
      filePath: resolve(dataDir, asset.filePath),
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
      return { text: await readFile(resolve(dataDir, asset.filePath), "utf8"), warnings };
    }
    throw new Error("Text source asset has no content.");
  }

  if (asset.kind === "document") {
    if (!asset.filePath) throw new Error("Document source asset has no stored file.");
    const extension = documentExtension(asset);
    if (!TEXT_DOCUMENT_EXTENSIONS.has(extension)) {
      throw new Error(
        `Document type .${extension || "unknown"} is not supported yet. Convert it to plain text, Markdown, or CSV first.`
      );
    }
    return { text: await readFile(resolve(dataDir, asset.filePath), "utf8"), warnings };
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
  }
): Promise<SourceExtractionResult> {
  const env = params.env ?? process.env;
  const fetchFn = params.fetchFn ?? globalThis.fetch;
  const { asset, language, provider } = params;
  const warnings: string[] = [];

  if (asset.kind === "image") {
    if (!asset.filePath) throw new Error("Image source asset has no stored file.");
    if (!provider.completeChat) {
      throw new Error(
        "Image sources need a vision-capable model. Configure ASSINI_LLM_PROVIDER with a local multimodal model (for example llava via Ollama) and retry."
      );
    }
    const imageData = await readFile(resolve(params.dataDir, asset.filePath));
    const messages = buildImageExtractionMessages(language, asset.mimeType ?? "image/png", imageData.toString("base64"));
    const content = await provider.completeChat(messages);
    const parsed = parseExtractionResponse(content);
    if (!parsed) {
      throw new Error("The model response could not be parsed as extraction JSON. Try again or use a larger model.");
    }
    return { ...parsed, warnings };
  }

  const resolved = await resolveAssetText(asset, params.dataDir, env, fetchFn);
  warnings.push(...resolved.warnings);
  const clamped = clampText(resolved.text);
  if (clamped.truncated) {
    warnings.push(`Source text was truncated to ${MAX_SOURCE_TEXT_CHARS} characters for processing.`);
  }
  if (clamped.text.trim().length === 0) {
    throw new Error("Source contains no readable text.");
  }

  if (provider.completeChat) {
    const messages = buildTextExtractionMessages(language, asset.kind, clamped.text);
    const content = await provider.completeChat(messages);
    const parsed = parseExtractionResponse(content);
    if (parsed) {
      return { ...parsed, warnings, transcript: resolved.transcript };
    }
    warnings.push("Model output was not valid extraction JSON; fell back to offline heuristics.");
  } else {
    warnings.push("No model configured (deterministic mode); used offline heuristic parsing.");
  }

  const heuristic = heuristicExtractFromText(clamped.text);
  return { ...heuristic, warnings, transcript: resolved.transcript };
}
