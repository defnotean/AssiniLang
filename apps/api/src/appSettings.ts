import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  LLM_PROVIDERS,
  modelProfileSavePayloadSchema,
  runtimeSettingsPatchSchema,
  type LlmModelProfile,
  type LlmProviderName,
  type LlmProviderReadiness,
  type ModelProfileSavePayload,
  type RuntimeSettings,
  type RuntimeSettingsPatch,
  type RuntimeSettingsResponse
} from "@assini/api-contract";
import { describeLlmProviderFromEnv } from "./llmProvider.js";
import { redactErrorSecrets } from "./secretRedaction.js";
import { assertOutboundHttpUrlAllowed } from "./urlSafety.js";
import {
  DEFAULT_LLM_MAX_TOKENS,
  DEFAULT_LLM_TIMEOUT_MS,
  DEFAULT_OCR_LANG,
  DEFAULT_OCR_MODEL,
  DEFAULT_TRANSCRIPTION_MODEL,
  type Env,
  envValue,
  parseBooleanFlag,
  parsePositiveInteger,
  readLlmEnvConfig,
  trimValue
} from "./llmEnvShared.js";

export {
  modelProfileSavePayloadSchema,
  runtimeSettingsPatchSchema,
  type ModelProfileSavePayload,
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
  "ASSINI_OCR_BASE_URL",
  "ASSINI_OCR_MODEL",
  "ASSINI_OCR_API_KEY",
  "ASSINI_OCR_LANG",
  "ASSINI_ALLOW_PRIVATE_URLS",
  "ASSINI_LLM_ACTIVE_PROFILE_ID",
  "ASSINI_LLM_MODEL_PROFILES"
] as const;

let settingsWriteQueue: Promise<void> = Promise.resolve();

export class RuntimeModelProfileNotFoundError extends Error {
  constructor(profileId: string) {
    super(`Model profile not found: ${profileId}`);
    this.name = "RuntimeModelProfileNotFoundError";
  }
}

export class RuntimeModelProfilesCorruptError extends Error {
  constructor() {
    super("Stored model profiles JSON is corrupt and must be repaired before profiles can be changed.");
    this.name = "RuntimeModelProfilesCorruptError";
  }
}

export class RuntimeSettingsUrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeSettingsUrlValidationError";
  }
}

type RuntimeSettingsUrlFieldLabel = "LLM base URL" | "transcription base URL" | "OCR base URL";

function effectiveEnvForPatchValidation(patch: RuntimeSettingsPatch, env: Env): Env {
  if (patch.allowPrivateUrls === undefined) return env;
  return {
    ...env,
    ASSINI_ALLOW_PRIVATE_URLS: patch.allowPrivateUrls ? "1" : ""
  };
}

async function assertRuntimeSettingsUrlFieldAllowed(
  label: RuntimeSettingsUrlFieldLabel,
  url: string,
  env: Env
): Promise<void> {
  try {
    await assertOutboundHttpUrlAllowed(url, { env });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new RuntimeSettingsUrlValidationError(`Invalid ${label}: ${redactErrorSecrets(message)}`);
  }
}

export async function assertRuntimeSettingsPatchUrlsAllowed(
  patch: RuntimeSettingsPatch,
  env: Env = process.env
): Promise<void> {
  const validationEnv = effectiveEnvForPatchValidation(patch, env);

  if (patch.baseUrl !== undefined) {
    const baseUrl = trimValue(patch.baseUrl);
    if (baseUrl) {
      await assertRuntimeSettingsUrlFieldAllowed("LLM base URL", baseUrl, validationEnv);
    }
  }

  if (patch.transcriptionBaseUrl !== undefined) {
    const transcriptionBaseUrl = trimValue(patch.transcriptionBaseUrl);
    if (transcriptionBaseUrl) {
      await assertRuntimeSettingsUrlFieldAllowed("transcription base URL", transcriptionBaseUrl, validationEnv);
    }
  }

  if (patch.ocrBaseUrl !== undefined) {
    const ocrBaseUrl = trimValue(patch.ocrBaseUrl);
    if (ocrBaseUrl) {
      await assertRuntimeSettingsUrlFieldAllowed("OCR base URL", ocrBaseUrl, validationEnv);
    }
  }
}

/** Validates the URLs a stored profile would actually persist (including inherited fields). */
async function assertStoredProfileUrlsAllowed(profile: StoredModelProfile, env: Env): Promise<void> {
  const validationEnv: Env = {
    ...env,
    ASSINI_ALLOW_PRIVATE_URLS: profile.allowPrivateUrls ? "1" : ""
  };

  const baseUrl = trimValue(profile.baseUrl);
  if (baseUrl) {
    await assertRuntimeSettingsUrlFieldAllowed("LLM base URL", baseUrl, validationEnv);
  }

  const transcriptionBaseUrl = trimValue(profile.transcriptionBaseUrl);
  if (transcriptionBaseUrl) {
    await assertRuntimeSettingsUrlFieldAllowed("transcription base URL", transcriptionBaseUrl, validationEnv);
  }

  const ocrBaseUrl = trimValue(profile.ocrBaseUrl);
  if (ocrBaseUrl) {
    await assertRuntimeSettingsUrlFieldAllowed("OCR base URL", ocrBaseUrl, validationEnv);
  }
}

const storedModelProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.enum(LLM_PROVIDERS),
  baseUrl: z.string().default(""),
  model: z.string().default(""),
  apiKey: z.string().optional(),
  timeoutMs: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
  jsonMode: z.boolean(),
  transcriptionBaseUrl: z.string().default(""),
  transcriptionModel: z.string().default(DEFAULT_TRANSCRIPTION_MODEL),
  transcriptionApiKey: z.string().optional(),
  ocrBaseUrl: z.string().default(""),
  ocrModel: z.string().default(DEFAULT_OCR_MODEL),
  ocrApiKey: z.string().optional(),
  ocrLang: z.string().default(DEFAULT_OCR_LANG),
  allowPrivateUrls: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});

type StoredModelProfile = z.infer<typeof storedModelProfileSchema>;

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
    ocrBaseUrl: envValue(env.ASSINI_OCR_BASE_URL),
    ocrModel: envValue(env.ASSINI_OCR_MODEL, DEFAULT_OCR_MODEL),
    ocrApiKeyConfigured: Boolean(trimValue(env.ASSINI_OCR_API_KEY)),
    ocrLang: envValue(env.ASSINI_OCR_LANG, DEFAULT_OCR_LANG),
    allowPrivateUrls: parseBooleanFlag(env.ASSINI_ALLOW_PRIVATE_URLS)
  };
}

type StoredProfilesReadResult =
  | { ok: true; profiles: StoredModelProfile[] }
  | { ok: false; reason: "corrupt" };

function readStoredProfilesResult(env: Env = process.env): StoredProfilesReadResult {
  const raw = trimValue(env.ASSINI_LLM_MODEL_PROFILES);
  if (!raw) return { ok: true, profiles: [] };

  try {
    const parsed = JSON.parse(raw);
    const result = z.array(storedModelProfileSchema).safeParse(parsed);
    return result.success ? { ok: true, profiles: result.data } : { ok: false, reason: "corrupt" };
  } catch {
    return { ok: false, reason: "corrupt" };
  }
}

function readStoredProfilesFromEnv(env: Env = process.env): StoredModelProfile[] {
  const result = readStoredProfilesResult(env);
  return result.ok ? result.profiles : [];
}

function requireStoredProfilesForMutation(env: Env = process.env): StoredModelProfile[] {
  const result = readStoredProfilesResult(env);
  if (!result.ok) throw new RuntimeModelProfilesCorruptError();
  return result.profiles;
}

function profileToResponse(profile: StoredModelProfile): LlmModelProfile {
  return {
    id: profile.id,
    name: profile.name,
    provider: profile.provider,
    baseUrl: profile.baseUrl,
    model: profile.model,
    apiKeyConfigured: Boolean(trimValue(profile.apiKey)),
    timeoutMs: profile.timeoutMs,
    maxTokens: profile.maxTokens,
    jsonMode: profile.jsonMode,
    transcriptionBaseUrl: profile.transcriptionBaseUrl,
    transcriptionModel: profile.transcriptionModel,
    transcriptionApiKeyConfigured: Boolean(trimValue(profile.transcriptionApiKey)),
    ocrBaseUrl: profile.ocrBaseUrl,
    ocrModel: profile.ocrModel,
    ocrApiKeyConfigured: Boolean(trimValue(profile.ocrApiKey)),
    ocrLang: profile.ocrLang,
    allowPrivateUrls: profile.allowPrivateUrls,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}

export function readRuntimeModelProfilesFromEnv(env: Env = process.env): LlmModelProfile[] {
  return readStoredProfilesFromEnv(env).map(profileToResponse);
}

export function normalizeProfileId(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function profileIdFromName(name: string): string {
  return normalizeProfileId(name.toLowerCase()) || `profile-${Date.now()}`;
}

function resolveStoredProfileId(
  payloadId: string | undefined,
  existingId: string | undefined,
  name: string
): string {
  const fromPayload = payloadId ? normalizeProfileId(payloadId) : "";
  if (fromPayload) return fromPayload;
  const fromExisting = existingId ? normalizeProfileId(existingId) : "";
  if (fromExisting) return fromExisting;
  return profileIdFromName(name);
}

function providerFromValue(value: string | undefined): LlmProviderName {
  return LLM_PROVIDERS.includes(value as LlmProviderName) ? value as LlmProviderName : "deterministic";
}

function storedProfileFromPayload(
  payload: ModelProfileSavePayload,
  existing: StoredModelProfile | undefined,
  env: Env,
  now: string
): StoredModelProfile {
  const currentSettings = readRuntimeSettingsFromEnv(env);
  const apiKey = trimValue(payload.apiKey);
  const transcriptionApiKey = trimValue(payload.transcriptionApiKey);
  const ocrApiKey = trimValue(payload.ocrApiKey);

  return {
    id: resolveStoredProfileId(payload.id, existing?.id, payload.name),
    name: payload.name,
    provider: providerFromValue(payload.provider ?? existing?.provider ?? currentSettings.provider),
    baseUrl: payload.baseUrl ?? existing?.baseUrl ?? currentSettings.baseUrl,
    model: payload.model ?? existing?.model ?? currentSettings.model,
    apiKey: payload.clearApiKey
      ? undefined
      : apiKey ?? existing?.apiKey ?? trimValue(env.ASSINI_LLM_API_KEY) ?? trimValue(env.OPENAI_API_KEY),
    timeoutMs: payload.timeoutMs ?? existing?.timeoutMs ?? currentSettings.timeoutMs,
    maxTokens: payload.maxTokens ?? existing?.maxTokens ?? currentSettings.maxTokens,
    jsonMode: payload.jsonMode ?? existing?.jsonMode ?? currentSettings.jsonMode,
    transcriptionBaseUrl: payload.transcriptionBaseUrl
      ?? existing?.transcriptionBaseUrl
      ?? currentSettings.transcriptionBaseUrl,
    transcriptionModel: payload.transcriptionModel
      ?? existing?.transcriptionModel
      ?? currentSettings.transcriptionModel,
    transcriptionApiKey: payload.clearTranscriptionApiKey
      ? undefined
      : transcriptionApiKey ?? existing?.transcriptionApiKey ?? trimValue(env.ASSINI_TRANSCRIBE_API_KEY),
    ocrBaseUrl: payload.ocrBaseUrl
      ?? existing?.ocrBaseUrl
      ?? currentSettings.ocrBaseUrl,
    ocrModel: payload.ocrModel
      ?? existing?.ocrModel
      ?? currentSettings.ocrModel,
    ocrApiKey: payload.clearOcrApiKey
      ? undefined
      : ocrApiKey ?? existing?.ocrApiKey ?? trimValue(env.ASSINI_OCR_API_KEY),
    ocrLang: payload.ocrLang ?? existing?.ocrLang ?? currentSettings.ocrLang,
    allowPrivateUrls: payload.allowPrivateUrls ?? existing?.allowPrivateUrls ?? currentSettings.allowPrivateUrls,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
}

function envUpdatesFromStoredProfile(profile: StoredModelProfile): Partial<Record<typeof RUNTIME_ENV_KEYS[number], string>> {
  return {
    ASSINI_LLM_PROVIDER: profile.provider,
    ASSINI_LLM_BASE_URL: profile.baseUrl,
    ASSINI_LLM_MODEL: profile.model,
    ASSINI_LLM_API_KEY: trimValue(profile.apiKey) ?? "",
    OPENAI_API_KEY: "",
    ASSINI_LLM_TIMEOUT_MS: profile.timeoutMs.toString(),
    ASSINI_LLM_MAX_TOKENS: profile.maxTokens.toString(),
    ASSINI_LLM_JSON_MODE: profile.jsonMode ? "1" : "",
    ASSINI_TRANSCRIBE_BASE_URL: profile.transcriptionBaseUrl,
    ASSINI_TRANSCRIBE_MODEL: profile.transcriptionModel,
    ASSINI_TRANSCRIBE_API_KEY: trimValue(profile.transcriptionApiKey) ?? "",
    ASSINI_OCR_BASE_URL: profile.ocrBaseUrl,
    ASSINI_OCR_MODEL: profile.ocrModel,
    ASSINI_OCR_API_KEY: trimValue(profile.ocrApiKey) ?? "",
    ASSINI_OCR_LANG: profile.ocrLang,
    ASSINI_ALLOW_PRIVATE_URLS: profile.allowPrivateUrls ? "1" : "",
    ASSINI_LLM_ACTIVE_PROFILE_ID: profile.id
  };
}

function envUpdatesFromProfiles(
  profiles: StoredModelProfile[],
  activeProfileId?: string
): Partial<Record<typeof RUNTIME_ENV_KEYS[number], string>> {
  return {
    ASSINI_LLM_MODEL_PROFILES: JSON.stringify(profiles),
    ...(activeProfileId !== undefined ? { ASSINI_LLM_ACTIVE_PROFILE_ID: activeProfileId } : {})
  };
}

/** Clears live provider env so a deleted active profile cannot keep driving LLM calls. */
function envUpdatesForClearedActiveProfile(): Partial<Record<typeof RUNTIME_ENV_KEYS[number], string>> {
  return {
    ASSINI_LLM_PROVIDER: "deterministic",
    ASSINI_LLM_BASE_URL: "",
    ASSINI_LLM_MODEL: "",
    ASSINI_LLM_API_KEY: "",
    OPENAI_API_KEY: "",
    ASSINI_LLM_TIMEOUT_MS: String(DEFAULT_LLM_TIMEOUT_MS),
    ASSINI_LLM_MAX_TOKENS: String(DEFAULT_LLM_MAX_TOKENS),
    ASSINI_LLM_JSON_MODE: "",
    ASSINI_TRANSCRIBE_BASE_URL: "",
    ASSINI_TRANSCRIBE_MODEL: DEFAULT_TRANSCRIPTION_MODEL,
    ASSINI_TRANSCRIBE_API_KEY: "",
    ASSINI_OCR_BASE_URL: "",
    ASSINI_OCR_MODEL: DEFAULT_OCR_MODEL,
    ASSINI_OCR_API_KEY: "",
    ASSINI_OCR_LANG: DEFAULT_OCR_LANG,
    ASSINI_ALLOW_PRIVATE_URLS: "",
    ASSINI_LLM_ACTIVE_PROFILE_ID: ""
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
  if (patch.ocrBaseUrl !== undefined) updates.ASSINI_OCR_BASE_URL = patch.ocrBaseUrl;
  if (patch.ocrModel !== undefined) updates.ASSINI_OCR_MODEL = patch.ocrModel;
  if (patch.ocrLang !== undefined) updates.ASSINI_OCR_LANG = patch.ocrLang;
  if (patch.allowPrivateUrls !== undefined) updates.ASSINI_ALLOW_PRIVATE_URLS = patch.allowPrivateUrls ? "1" : "";

  const apiKey = trimValue(patch.apiKey);
  const transcriptionApiKey = trimValue(patch.transcriptionApiKey);
  const ocrApiKey = trimValue(patch.ocrApiKey);

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

  if (patch.clearOcrApiKey) {
    updates.ASSINI_OCR_API_KEY = "";
  } else if (ocrApiKey !== undefined) {
    updates.ASSINI_OCR_API_KEY = ocrApiKey;
  }

  if (Object.keys(updates).length > 0) updates.ASSINI_LLM_ACTIVE_PROFILE_ID = "";

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

/** Replaces the settings file only after the complete replacement has been written. */
export async function writeEnvFileAtomically(settingsPath: string, text: string): Promise<void> {
  const tempPath = `${settingsPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, text, { encoding: "utf8", flag: "wx" });
    await rename(tempPath, settingsPath);
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // Preserve the original write or rename failure if cleanup also fails.
    }
    throw error;
  }
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
  await assertRuntimeSettingsPatchUrlsAllowed(params.patch, env);
  const updates = envUpdatesFromPatch(params.patch);
  const existingText = await readOptionalText(params.settingsPath);
  await writeEnvFileAtomically(params.settingsPath, updateEnvFileText(existingText, updates));
  applyUpdatesToEnv(updates, env);
  params.reloadLlmProvider?.();

  return {
    settings: readRuntimeSettingsFromEnv(env),
    status: describeLlmProviderFromEnv(env) as LlmProviderReadiness,
    persisted: true,
    profiles: readRuntimeModelProfilesFromEnv(env),
    activeProfileId: trimValue(env.ASSINI_LLM_ACTIVE_PROFILE_ID)
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
    persisted: true,
    profiles: readRuntimeModelProfilesFromEnv(env),
    activeProfileId: trimValue(env.ASSINI_LLM_ACTIVE_PROFILE_ID)
  };
}

async function saveRuntimeModelProfileUnlocked(
  params: {
    settingsPath: string;
    payload: ModelProfileSavePayload;
    env?: Env;
    reloadLlmProvider?: () => void;
  }
): Promise<RuntimeSettingsResponse> {
  const env = params.env ?? process.env;
  const profiles = requireStoredProfilesForMutation(env);
  const normalizedId = params.payload.id ? normalizeProfileId(params.payload.id) : undefined;
  const existingIndex = normalizedId
    ? profiles.findIndex((profile) => profile.id === normalizedId)
    : profiles.findIndex((profile) => profile.name.toLowerCase() === params.payload.name.toLowerCase());
  const existing = existingIndex >= 0 ? profiles[existingIndex] : undefined;
  const profile = storedProfileFromPayload(params.payload, existing, env, new Date().toISOString());
  await assertStoredProfileUrlsAllowed(profile, env);
  const nextProfiles = existingIndex >= 0
    ? profiles.map((item, index) => (index === existingIndex ? profile : item))
    : [...profiles, profile];
  const activeProfileId = trimValue(env.ASSINI_LLM_ACTIVE_PROFILE_ID);
  const shouldActivate = params.payload.activate === true
    || activeProfileId === profile.id
    || (activeProfileId !== undefined && normalizeProfileId(activeProfileId) === profile.id);
  const updates = {
    ...envUpdatesFromProfiles(nextProfiles, shouldActivate ? profile.id : activeProfileId ?? ""),
    ...(shouldActivate ? envUpdatesFromStoredProfile(profile) : {})
  };
  const existingText = await readOptionalText(params.settingsPath);
  await writeEnvFileAtomically(params.settingsPath, updateEnvFileText(existingText, updates));
  applyUpdatesToEnv(updates, env);
  if (shouldActivate) params.reloadLlmProvider?.();
  return runtimeSettingsResponse(env);
}

export async function saveRuntimeModelProfile(
  params: {
    settingsPath: string;
    payload: ModelProfileSavePayload;
    env?: Env;
    reloadLlmProvider?: () => void;
  }
): Promise<RuntimeSettingsResponse> {
  const operation = settingsWriteQueue.then(() => saveRuntimeModelProfileUnlocked(params));
  settingsWriteQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

async function activateRuntimeModelProfileUnlocked(
  params: {
    settingsPath: string;
    profileId: string;
    env?: Env;
    reloadLlmProvider?: () => void;
  }
): Promise<RuntimeSettingsResponse> {
  const env = params.env ?? process.env;
  const profiles = requireStoredProfilesForMutation(env);
  const normalizedId = normalizeProfileId(params.profileId);
  const profile = profiles.find((item) => item.id === normalizedId || item.id === params.profileId);
  if (!profile || !normalizedId) throw new RuntimeModelProfileNotFoundError(params.profileId);

  const updates = envUpdatesFromStoredProfile(profile);
  const existingText = await readOptionalText(params.settingsPath);
  await writeEnvFileAtomically(params.settingsPath, updateEnvFileText(existingText, updates));
  applyUpdatesToEnv(updates, env);
  params.reloadLlmProvider?.();
  return runtimeSettingsResponse(env);
}

export async function activateRuntimeModelProfile(
  params: {
    settingsPath: string;
    profileId: string;
    env?: Env;
    reloadLlmProvider?: () => void;
  }
): Promise<RuntimeSettingsResponse> {
  const operation = settingsWriteQueue.then(() => activateRuntimeModelProfileUnlocked(params));
  settingsWriteQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

async function deleteRuntimeModelProfileUnlocked(
  params: {
    settingsPath: string;
    profileId: string;
    env?: Env;
    reloadLlmProvider?: () => void;
  }
): Promise<RuntimeSettingsResponse> {
  const env = params.env ?? process.env;
  const profiles = requireStoredProfilesForMutation(env);
  const normalizedId = normalizeProfileId(params.profileId);
  const nextProfiles = profiles.filter(
    (profile) => profile.id !== normalizedId && profile.id !== params.profileId
  );
  if (!normalizedId || nextProfiles.length === profiles.length) {
    throw new RuntimeModelProfileNotFoundError(params.profileId);
  }

  const activeProfileId = trimValue(env.ASSINI_LLM_ACTIVE_PROFILE_ID);
  const deletingActive = activeProfileId === params.profileId
    || (activeProfileId !== undefined && normalizeProfileId(activeProfileId) === normalizedId);
  const updates = {
    ...envUpdatesFromProfiles(nextProfiles, deletingActive ? "" : activeProfileId ?? ""),
    ...(deletingActive ? envUpdatesForClearedActiveProfile() : {})
  };
  const existingText = await readOptionalText(params.settingsPath);
  await writeEnvFileAtomically(params.settingsPath, updateEnvFileText(existingText, updates));
  applyUpdatesToEnv(updates, env);
  if (deletingActive) params.reloadLlmProvider?.();
  return runtimeSettingsResponse(env);
}

export async function deleteRuntimeModelProfile(
  params: {
    settingsPath: string;
    profileId: string;
    env?: Env;
    reloadLlmProvider?: () => void;
  }
): Promise<RuntimeSettingsResponse> {
  const operation = settingsWriteQueue.then(() => deleteRuntimeModelProfileUnlocked(params));
  settingsWriteQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}
