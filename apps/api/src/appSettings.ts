import { readFile, writeFile } from "node:fs/promises";
import {
  runtimeSettingsPatchSchema,
  type LlmProviderReadiness,
  type RuntimeSettings,
  type RuntimeSettingsPatch,
  type RuntimeSettingsResponse
} from "@assini/api-contract";
import { describeLlmProviderFromEnv } from "./llmProvider.js";
import {
  DEFAULT_LLM_MAX_TOKENS,
  DEFAULT_LLM_TIMEOUT_MS,
  DEFAULT_OCR_LANG,
  DEFAULT_TRANSCRIPTION_MODEL,
  type Env,
  envValue,
  parseBooleanFlag,
  parsePositiveInteger,
  readLlmEnvConfig,
  trimValue
} from "./llmEnvShared.js";

export {
  runtimeSettingsPatchSchema,
  type RuntimeSettings,
  type RuntimeSettingsPatch,
  type RuntimeSettingsResponse
} from "@assini/api-contract";

const RUNTIME_ENV_KEYS = [
  "ASSINI_LLM_PROVIDER",
  "ASSINI_LLM_BASE_URL",
  "ASSINI_LLM_MODEL",
  "ASSINI_LLM_API_KEY",
  "OPENAI_API_KEY",
  "ASSINI_LLM_TIMEOUT_MS",
  "ASSINI_LLM_MAX_TOKENS",
  "ASSINI_LLM_JSON_MODE",
  "ASSINI_TRANSCRIBE_BASE_URL",
  "ASSINI_TRANSCRIBE_MODEL",
  "ASSINI_TRANSCRIBE_API_KEY",
  "ASSINI_OCR_LANG",
  "ASSINI_ALLOW_PRIVATE_URLS"
] as const;

let settingsWriteQueue: Promise<void> = Promise.resolve();

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
    transcriptionBaseUrl: envValue(env.ASSINI_TRANSCRIBE_BASE_URL),
    transcriptionModel: envValue(env.ASSINI_TRANSCRIBE_MODEL, DEFAULT_TRANSCRIPTION_MODEL),
    transcriptionApiKeyConfigured: Boolean(trimValue(env.ASSINI_TRANSCRIBE_API_KEY)),
    ocrLang: envValue(env.ASSINI_OCR_LANG, DEFAULT_OCR_LANG),
    allowPrivateUrls: parseBooleanFlag(env.ASSINI_ALLOW_PRIVATE_URLS)
  };
}

function envUpdatesFromPatch(patch: RuntimeSettingsPatch): Partial<Record<typeof RUNTIME_ENV_KEYS[number], string>> {
  const updates: Partial<Record<typeof RUNTIME_ENV_KEYS[number], string>> = {};

  if (patch.provider !== undefined) updates.ASSINI_LLM_PROVIDER = patch.provider;
  if (patch.baseUrl !== undefined) updates.ASSINI_LLM_BASE_URL = patch.baseUrl;
  if (patch.model !== undefined) updates.ASSINI_LLM_MODEL = patch.model;
  if (patch.timeoutMs !== undefined) updates.ASSINI_LLM_TIMEOUT_MS = patch.timeoutMs.toString();
  if (patch.maxTokens !== undefined) updates.ASSINI_LLM_MAX_TOKENS = patch.maxTokens.toString();
  if (patch.jsonMode !== undefined) updates.ASSINI_LLM_JSON_MODE = patch.jsonMode ? "1" : "";
  if (patch.transcriptionBaseUrl !== undefined) updates.ASSINI_TRANSCRIBE_BASE_URL = patch.transcriptionBaseUrl;
  if (patch.transcriptionModel !== undefined) updates.ASSINI_TRANSCRIBE_MODEL = patch.transcriptionModel;
  if (patch.ocrLang !== undefined) updates.ASSINI_OCR_LANG = patch.ocrLang;
  if (patch.allowPrivateUrls !== undefined) updates.ASSINI_ALLOW_PRIVATE_URLS = patch.allowPrivateUrls ? "1" : "";

  const apiKey = trimValue(patch.apiKey);
  const transcriptionApiKey = trimValue(patch.transcriptionApiKey);

  if (patch.clearApiKey) {
    updates.ASSINI_LLM_API_KEY = "";
    updates.OPENAI_API_KEY = "";
  } else if (apiKey !== undefined) {
    updates.ASSINI_LLM_API_KEY = apiKey;
  }

  if (patch.clearTranscriptionApiKey) {
    updates.ASSINI_TRANSCRIBE_API_KEY = "";
  } else if (transcriptionApiKey !== undefined) {
    updates.ASSINI_TRANSCRIBE_API_KEY = transcriptionApiKey;
  }

  return updates;
}

function formatEnvValue(value: string): string {
  if (value.length === 0) return "";
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

export function updateEnvFileText(
  existingText: string,
  updates: Partial<Record<typeof RUNTIME_ENV_KEYS[number], string>>
): string {
  const pending = new Map(Object.entries(updates));
  const seen = new Set<string>();
  const sourceLines = existingText.length > 0 ? existingText.split(/\r?\n/) : [
    "# AssiniLang local configuration.",
    "# Edited by the Model Setup screen."
  ];
  const nextLines = sourceLines.map((line) => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=).*/);
    const key = match?.[2];
    if (!key || !pending.has(key)) return line;

    seen.add(key);
    return `${key}=${formatEnvValue(pending.get(key) ?? "")}`;
  });

  for (const [key, value] of pending) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${formatEnvValue(value)}`);
    }
  }

  return `${nextLines.join("\n").replace(/\n+$/g, "")}\n`;
}

async function readOptionalText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") return "";
    throw error;
  }
}

function applyUpdatesToEnv(
  updates: Partial<Record<typeof RUNTIME_ENV_KEYS[number], string>>,
  env: Env = process.env
): void {
  for (const [key, value] of Object.entries(updates)) {
    env[key] = value ?? "";
  }
}

async function applyRuntimeSettingsPatchUnlocked(
  params: {
    settingsPath: string;
    patch: RuntimeSettingsPatch;
    env?: Env;
    reloadLlmProvider?: () => void;
  }
): Promise<RuntimeSettingsResponse> {
  const env = params.env ?? process.env;
  const updates = envUpdatesFromPatch(params.patch);
  const existingText = await readOptionalText(params.settingsPath);
  await writeFile(params.settingsPath, updateEnvFileText(existingText, updates), "utf8");
  applyUpdatesToEnv(updates, env);
  params.reloadLlmProvider?.();

  return {
    settings: readRuntimeSettingsFromEnv(env),
    status: describeLlmProviderFromEnv(env) as LlmProviderReadiness,
    persisted: true
  };
}

export async function applyRuntimeSettingsPatch(
  params: {
    settingsPath: string;
    patch: RuntimeSettingsPatch;
    env?: Env;
    reloadLlmProvider?: () => void;
  }
): Promise<RuntimeSettingsResponse> {
  const operation = settingsWriteQueue.then(() => applyRuntimeSettingsPatchUnlocked(params));
  settingsWriteQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

export function runtimeSettingsResponse(env: Env = process.env): RuntimeSettingsResponse {
  return {
    settings: readRuntimeSettingsFromEnv(env),
    status: describeLlmProviderFromEnv(env) as LlmProviderReadiness,
    persisted: true
  };
}
