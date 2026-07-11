import type { ObsidianMcpSettings, RuntimeSettings } from "@assini/api-contract";
import {
  DEFAULT_LLM_MAX_TOKENS,
  DEFAULT_LLM_TIMEOUT_MS,
  DEFAULT_OCR_LANG,
  DEFAULT_OCR_MODEL,
  DEFAULT_TRANSCRIPTION_MODEL,
  envValue,
  parseBooleanFlag,
  parsePositiveInteger,
  readEmbeddingEnvConfig,
  readLlmEnvConfig,
  trimValue,
  type Env
} from "./llmEnvShared.js";

const DEFAULT_OBSIDIAN_MCP_TIMEOUT_MS = 15_000;

export function readRuntimeSettingsFromEnv(env: Env = process.env): RuntimeSettings {
  const llmEnv = readLlmEnvConfig(env);
  return {
    provider: envValue(env.ASSINI_LLM_PROVIDER, "deterministic"),
    baseUrl: llmEnv.baseUrl ?? "",
    model: envValue(env.ASSINI_LLM_MODEL ?? llmEnv.model),
    apiKeyConfigured: llmEnv.apiKeyConfigured,
    timeoutMs: parsePositiveInteger(env.ASSINI_LLM_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS),
    maxTokens: parsePositiveInteger(env.ASSINI_LLM_MAX_TOKENS, DEFAULT_LLM_MAX_TOKENS),
    jsonMode: parseBooleanFlag(env.ASSINI_LLM_JSON_MODE),
    embeddingBaseUrl: envValue(env.ASSINI_EMBEDDING_BASE_URL),
    embeddingModel: envValue(env.ASSINI_EMBEDDING_MODEL),
    embeddingApiKeyConfigured: Boolean(trimValue(env.ASSINI_EMBEDDING_API_KEY)),
    embeddingTimeoutMs: readEmbeddingEnvConfig(env).timeoutMs,
    transcriptionBaseUrl: envValue(env.ASSINI_TRANSCRIBE_BASE_URL),
    transcriptionModel: envValue(env.ASSINI_TRANSCRIBE_MODEL, DEFAULT_TRANSCRIPTION_MODEL),
    transcriptionApiKeyConfigured: Boolean(trimValue(env.ASSINI_TRANSCRIBE_API_KEY)),
    ocrBaseUrl: envValue(env.ASSINI_OCR_BASE_URL),
    ocrModel: envValue(env.ASSINI_OCR_MODEL, DEFAULT_OCR_MODEL),
    ocrApiKeyConfigured: Boolean(trimValue(env.ASSINI_OCR_API_KEY)),
    ocrLang: envValue(env.ASSINI_OCR_LANG, DEFAULT_OCR_LANG),
    allowPrivateUrls: parseBooleanFlag(env.ASSINI_ALLOW_PRIVATE_URLS)
  };
}

export function readObsidianMcpSettingsFromEnv(env: Env = process.env): ObsidianMcpSettings {
  const token = trimValue(env.ASSINI_OBSIDIAN_MCP_TOKEN);
  const endpointUrl = envValue(env.ASSINI_OBSIDIAN_MCP_ENDPOINT_URL);
  return {
    endpointUrl: token ? endpointUrl.split(token).join("[redacted-secret]") : endpointUrl,
    tokenConfigured: Boolean(token),
    timeoutMs: parsePositiveInteger(env.ASSINI_OBSIDIAN_MCP_TIMEOUT_MS, DEFAULT_OBSIDIAN_MCP_TIMEOUT_MS)
  };
}

export function readObsidianMcpConnectionConfigFromEnv(env: Env = process.env): {
  endpointUrl: string;
  token?: string;
  timeoutMs: number;
} {
  const settings = readObsidianMcpSettingsFromEnv(env);
  return {
    endpointUrl: envValue(env.ASSINI_OBSIDIAN_MCP_ENDPOINT_URL),
    token: trimValue(env.ASSINI_OBSIDIAN_MCP_TOKEN),
    timeoutMs: settings.timeoutMs
  };
}
