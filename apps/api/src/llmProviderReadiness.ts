import type { LlmProviderReadiness } from "@assini/api-contract";
import { DEFAULT_LLM_TIMEOUT_MS, normalizeHttpBaseUrl, readLlmEnvConfig, trimValue, type Env } from "./llmEnvShared.js";

export const DEFAULT_REMOTE_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_REMOTE_OPENAI_MODEL = "gpt-4o-mini";
export function parsePositiveInteger(
  value: string | undefined,
  fallback: number
): { value: number; warnings: string[] } {
  const trimmed = trimValue(value);
  if (!trimmed) return { value: fallback, warnings: [] };

  const parsed = Number(trimmed);
  if (Number.isInteger(parsed) && parsed > 0) {
    return { value: parsed, warnings: [] };
  }

  return {
    value: fallback,
    warnings: [`ASSINI_LLM_TIMEOUT_MS must be a positive integer; using ${fallback}.`]
  };
}

function sanitizeConfiguredBaseUrl(baseUrl: string | undefined): string | undefined {
  const trimmed = trimValue(baseUrl);
  if (!trimmed) return undefined;

  return normalizeHttpBaseUrl(trimmed) ?? "[configured but not a valid http(s) URL]";
}

function baseUrlWarnings(baseUrl: string | undefined, missingMessage: string): string[] {
  if (!baseUrl) return [missingMessage];
  return normalizeHttpBaseUrl(baseUrl) ? [] : ["Configured LLM base URL must be a valid http(s) URL."];
}

function transcriptionReadiness(env: Env): LlmProviderReadiness["transcription"] {
  const baseUrl = trimValue(env.ASSINI_TRANSCRIBE_BASE_URL);
  const model = trimValue(env.ASSINI_TRANSCRIBE_MODEL);
  return {
    configured: Boolean(normalizeHttpBaseUrl(baseUrl)),
    baseUrl: sanitizeConfiguredBaseUrl(baseUrl),
    model,
    baseUrlVariable: "ASSINI_TRANSCRIBE_BASE_URL",
    modelVariable: "ASSINI_TRANSCRIBE_MODEL"
  };
}

function ocrReadiness(env: Env): LlmProviderReadiness["ocr"] {
  const baseUrl = trimValue(env.ASSINI_OCR_BASE_URL);
  const model = trimValue(env.ASSINI_OCR_MODEL);
  return {
    configured: Boolean(normalizeHttpBaseUrl(baseUrl)),
    baseUrl: sanitizeConfiguredBaseUrl(baseUrl),
    model,
    baseUrlVariable: "ASSINI_OCR_BASE_URL",
    modelVariable: "ASSINI_OCR_MODEL"
  };
}

function baseReadinessFields(
  timeoutMs: number,
  env: Env
): Pick<LlmProviderReadiness, "apiKey" | "environment" | "transcription" | "ocr" | "setup" | "warnings" | "timeoutMs"> {
  return {
    timeoutMs,
    apiKey: {
      required: false,
      configured: false,
      acceptedVariables: ["ASSINI_LLM_API_KEY", "OPENAI_API_KEY"]
    },
    environment: {
      providerVariable: "ASSINI_LLM_PROVIDER",
      baseUrlVariable: "ASSINI_LLM_BASE_URL",
      modelVariable: "ASSINI_LLM_MODEL",
      apiKeyVariables: ["ASSINI_LLM_API_KEY", "OPENAI_API_KEY"],
      timeoutVariable: "ASSINI_LLM_TIMEOUT_MS"
    },
    transcription: transcriptionReadiness(env),
    ocr: ocrReadiness(env),
    setup: {
      localExamples: [
        "ASSINI_LLM_PROVIDER=openai-compatible ASSINI_LLM_BASE_URL=http://127.0.0.1:11434/v1 ASSINI_LLM_MODEL=llama3.1",
        "ASSINI_LLM_PROVIDER=lm-studio ASSINI_LLM_BASE_URL=http://127.0.0.1:1234/v1 ASSINI_LLM_MODEL=<local-model-name>"
      ],
      remoteExamples: [
        "ASSINI_LLM_PROVIDER=openai ASSINI_LLM_MODEL=gpt-4o-mini ASSINI_LLM_API_KEY=<server-side-key>",
        "ASSINI_LLM_BASE_URL=https://api.openai.com/v1 ASSINI_LLM_MODEL=gpt-4o-mini OPENAI_API_KEY=<server-side-key>"
      ]
    },
    warnings: []
  };
}

export function describeLlmProviderFromEnv(env: Env = process.env): LlmProviderReadiness {
  const { provider, apiKeyConfigured, baseUrl, model } = readLlmEnvConfig(env);
  const timeout = parsePositiveInteger(env.ASSINI_LLM_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS);
  const timeoutMs = timeout.value;
  const base = baseReadinessFields(timeoutMs, env);

  if (provider === "deterministic" || provider === "off" || provider === "mock") {
    return {
      ...base,
      provider: provider,
      mode: "deterministic",
      configured: true,
      activeProviderName: "deterministic",
      apiKey: { ...base.apiKey, configured: apiKeyConfigured },
      model,
      baseUrl: sanitizeConfiguredBaseUrl(baseUrl),
      warnings: [...timeout.warnings, "Using deterministic fallback; no external LLM calls will be made."]
    };
  }

  if (provider === "openai" || provider === "remote") {
    const configuredBaseUrl = baseUrl ?? DEFAULT_REMOTE_OPENAI_BASE_URL;
    const warnings = [
      ...timeout.warnings,
      ...(normalizeHttpBaseUrl(configuredBaseUrl) ? [] : ["Configured LLM base URL must be a valid http(s) URL."]),
      ...(apiKeyConfigured ? [] : ["Remote API mode requires ASSINI_LLM_API_KEY or OPENAI_API_KEY on the API server."])
    ];
    return {
      ...base,
      provider,
      mode: "remote-api",
      configured: warnings.length === 0,
      activeProviderName: "openai-compatible",
      baseUrl: sanitizeConfiguredBaseUrl(configuredBaseUrl),
      model: model ?? DEFAULT_REMOTE_OPENAI_MODEL,
      apiKey: { ...base.apiKey, required: true, configured: apiKeyConfigured },
      warnings
    };
  }

  if (provider === "openai-compatible" || provider === "local" || provider === "ollama" || provider === "lm-studio") {
    const warnings = [
      ...timeout.warnings,
      ...baseUrlWarnings(baseUrl, "Local/OpenAI-compatible mode requires ASSINI_LLM_BASE_URL."),
      ...(model ? [] : ["Local/OpenAI-compatible mode requires ASSINI_LLM_MODEL."])
    ];
    return {
      ...base,
      provider,
      mode: "local-openai-compatible",
      configured: warnings.length === 0,
      activeProviderName: "openai-compatible",
      baseUrl: sanitizeConfiguredBaseUrl(baseUrl),
      model,
      apiKey: { ...base.apiKey, required: false, configured: apiKeyConfigured },
      warnings
    };
  }

  if (provider) {
    return {
      ...base,
      provider,
      mode: "invalid",
      configured: false,
      activeProviderName: "none",
      baseUrl: sanitizeConfiguredBaseUrl(baseUrl),
      model,
      apiKey: { ...base.apiKey, configured: apiKeyConfigured },
      warnings: [...timeout.warnings, `Unknown ASSINI_LLM_PROVIDER: ${provider}`]
    };
  }

  if (baseUrl && model) {
    return {
      ...base,
      provider: "openai-compatible",
      mode: "local-openai-compatible",
      configured: true,
      activeProviderName: "openai-compatible",
      baseUrl: sanitizeConfiguredBaseUrl(baseUrl),
      model,
      apiKey: { ...base.apiKey, required: false, configured: apiKeyConfigured },
      warnings: timeout.warnings
    };
  }

  if (apiKeyConfigured) {
    return {
      ...base,
      provider: "openai",
      mode: "remote-api",
      configured: true,
      activeProviderName: "openai-compatible",
      baseUrl: sanitizeConfiguredBaseUrl(baseUrl ?? DEFAULT_REMOTE_OPENAI_BASE_URL),
      model: model ?? DEFAULT_REMOTE_OPENAI_MODEL,
      apiKey: { ...base.apiKey, required: true, configured: true },
      warnings: timeout.warnings
    };
  }

  return {
    ...base,
    provider: "deterministic",
    mode: "deterministic",
    configured: true,
    activeProviderName: "deterministic",
    baseUrl: sanitizeConfiguredBaseUrl(baseUrl),
    model,
    apiKey: { ...base.apiKey, configured: false },
    warnings: [
      ...timeout.warnings,
      "No LLM provider configured; using deterministic fallback for safe local development."
    ]
  };
}
