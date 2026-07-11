export type Env = Record<string, string | undefined>;

export type LlmEnvConfig = {
  provider?: string;
  baseUrl?: string;
  model?: string;
  explicitApiKey?: string;
  remoteApiKey?: string;
  apiKeyConfigured: boolean;
};

export type EmbeddingEnvConfig = {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs: number;
  configured: boolean;
};

export const DEFAULT_LLM_TIMEOUT_MS = 180_000;
export const DEFAULT_LLM_MAX_TOKENS = 4096;
export const DEFAULT_EMBEDDING_TIMEOUT_MS = 30_000;
export const MAX_EMBEDDING_TIMEOUT_MS = 600_000;
export const DEFAULT_TRANSCRIPTION_MODEL = "whisper-1";
export const DEFAULT_OCR_MODEL = "llava";
export const DEFAULT_OCR_LANG = "eng";

export function trimValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const trimmed = trimValue(value);
  if (!trimmed) return fallback;

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseBoundedPositiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = parsePositiveInteger(value, fallback);
  return Math.min(parsed, maximum);
}

export function parseBooleanFlag(value: string | undefined): boolean {
  const normalized = trimValue(value)?.toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function envValue(value: string | undefined, fallback = ""): string {
  return trimValue(value) ?? fallback;
}

export function readLlmEnvConfig(env: Env = process.env): LlmEnvConfig {
  const explicitApiKey = trimValue(env.ASSINI_LLM_API_KEY);
  const remoteApiKey = explicitApiKey ?? trimValue(env.OPENAI_API_KEY);

  return {
    provider: trimValue(env.ASSINI_LLM_PROVIDER)?.toLowerCase(),
    baseUrl: trimValue(env.ASSINI_LLM_BASE_URL),
    model: trimValue(env.ASSINI_LLM_MODEL) ?? trimValue(env.OPENAI_MODEL),
    explicitApiKey,
    remoteApiKey,
    apiKeyConfigured: Boolean(remoteApiKey)
  };
}

export function readEmbeddingEnvConfig(env: Env = process.env): EmbeddingEnvConfig {
  const baseUrl = trimValue(env.ASSINI_EMBEDDING_BASE_URL);
  const model = trimValue(env.ASSINI_EMBEDDING_MODEL);
  return {
    baseUrl,
    model,
    apiKey: trimValue(env.ASSINI_EMBEDDING_API_KEY),
    timeoutMs: parseBoundedPositiveInteger(
      env.ASSINI_EMBEDDING_TIMEOUT_MS,
      DEFAULT_EMBEDDING_TIMEOUT_MS,
      MAX_EMBEDDING_TIMEOUT_MS
    ),
    configured: Boolean(baseUrl && model)
  };
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function ensureV1BaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  return /\/v1$/.test(normalized) ? normalized : `${normalized}/v1`;
}

export function normalizeHttpBaseUrl(value: string | undefined): string | undefined {
  const trimmed = trimValue(value);
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return normalizeBaseUrl(url.toString());
  } catch {
    return undefined;
  }
}

/** Identifies one API endpoint regardless of whether its OpenAI-compatible /v1 suffix is explicit. */
export function canonicalLlmEndpointIdentity(value: string | undefined): string | undefined {
  const normalized = normalizeHttpBaseUrl(value);
  if (!normalized) return undefined;
  return normalizeBaseUrl(normalized.replace(/\/v1$/, ""));
}

export function resolveLlmTimeoutMs(env: Env = process.env, overrideMs?: number): number {
  if (Number.isInteger(overrideMs) && (overrideMs ?? 0) > 0) {
    return overrideMs as number;
  }
  return parsePositiveInteger(env.ASSINI_LLM_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS);
}
