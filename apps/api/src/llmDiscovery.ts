import type {
  DiscoveredLlmModel,
  LlmModelDiscoveryEndpoint,
  LlmModelDiscoveryError,
  LlmModelDiscoveryResponse
} from "@assini/api-contract";
import {
  canonicalLlmEndpointIdentity,
  ensureV1BaseUrl,
  normalizeBaseUrl,
  normalizeHttpBaseUrl,
  readLlmEnvConfig,
  trimValue,
  type Env
} from "./llmEnvShared.js";
import { parseDiscoveryModelIds, type DiscoveryKind } from "./llmDiscoveryParsing.js";
import { redactErrorSecrets } from "./secretRedaction.js";
import { assertOutboundHttpUrlAllowed, fetchOutboundHttp, type LookupFn } from "./urlSafety.js";

export type {
  DiscoveredLlmModel,
  LlmModelDiscoveryEndpoint,
  LlmModelDiscoveryError,
  LlmModelDiscoveryResponse
} from "@assini/api-contract";

const DEFAULT_REMOTE_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_DISCOVERY_TIMEOUT_MS = 1_800;
const MAX_DISCOVERY_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_DISCOVERY_TARGETS = 12;
export const MAX_EXTRA_DISCOVERY_BASE_URLS = 12;
export const DISCOVERY_SCAN_CONCURRENCY = 4;

export class LlmDiscoveryInputLimitError extends Error {
  constructor(readonly limit = MAX_EXTRA_DISCOVERY_BASE_URLS) {
    super(`Too many model discovery base URLs: at most ${limit} per request.`);
    this.name = "LlmDiscoveryInputLimitError";
  }
}

type DiscoveryProvider = DiscoveredLlmModel["provider"];
type FetchFn = typeof fetch;

type DiscoveryTarget = {
  provider: DiscoveryProvider;
  providerLabel: string;
  source: string;
  baseUrl: string;
  scanUrl: string;
  kind: DiscoveryKind;
  apiKey?: string;
  requiresApiKey: boolean;
  reportErrors: boolean;
};

const COMMON_OPENAI_COMPATIBLE_BASE_URLS: Array<{
  provider: DiscoveryProvider;
  providerLabel: string;
  source: string;
  baseUrl: string;
}> = [
  { provider: "ollama", providerLabel: "Ollama", source: "Ollama local", baseUrl: "http://127.0.0.1:11434/v1" },
  { provider: "ollama", providerLabel: "Ollama", source: "Ollama local", baseUrl: "http://localhost:11434/v1" },
  { provider: "lm-studio", providerLabel: "LM Studio", source: "LM Studio local", baseUrl: "http://127.0.0.1:1234/v1" },
  { provider: "lm-studio", providerLabel: "LM Studio", source: "LM Studio local", baseUrl: "http://localhost:1234/v1" },
  {
    provider: "openai-compatible",
    providerLabel: "OpenAI-compatible",
    source: "llama.cpp local",
    baseUrl: "http://127.0.0.1:8080/v1"
  },
  {
    provider: "openai-compatible",
    providerLabel: "OpenAI-compatible",
    source: "llama.cpp local",
    baseUrl: "http://localhost:8080/v1"
  },
  {
    provider: "openai-compatible",
    providerLabel: "OpenAI-compatible",
    source: "Local model server",
    baseUrl: "http://127.0.0.1:8000/v1"
  },
  {
    provider: "openai-compatible",
    providerLabel: "OpenAI-compatible",
    source: "Local model server",
    baseUrl: "http://localhost:8000/v1"
  },
  {
    provider: "openai-compatible",
    providerLabel: "OpenAI-compatible",
    source: "Local model server",
    baseUrl: "http://127.0.0.1:12345/v1"
  },
  {
    provider: "openai-compatible",
    providerLabel: "OpenAI-compatible",
    source: "Local model server",
    baseUrl: "http://localhost:12345/v1"
  }
];

function stripV1BaseUrl(baseUrl: string): string {
  return normalizeBaseUrl(baseUrl).replace(/\/v1$/, "");
}

function canonicalLocalBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    if (url.hostname.toLowerCase() === "localhost") {
      url.hostname = "127.0.0.1";
    }
    return normalizeBaseUrl(url.toString());
  } catch {
    return normalizeBaseUrl(baseUrl);
  }
}

function normalizeAndDedupeDiscoveryBaseUrls(values: readonly string[]): string[] {
  const byCanonicalBaseUrl = new Map<string, string>();

  for (const value of values) {
    const trimmed = trimValue(value);
    if (!trimmed) continue;
    const normalized = normalizeHttpBaseUrl(trimmed) ?? trimmed;
    const normalizedTargetBaseUrl = inferProvider(normalized) === "openai" ? normalized : ensureV1BaseUrl(normalized);
    const key = canonicalLocalBaseUrl(normalizedTargetBaseUrl);
    if (!byCanonicalBaseUrl.has(key)) {
      byCanonicalBaseUrl.set(key, normalized);
    }
  }

  return [...byCanonicalBaseUrl.values()];
}

function providerLabel(provider: DiscoveryProvider): string {
  if (provider === "ollama") return "Ollama";
  if (provider === "lm-studio") return "LM Studio";
  if (provider === "openai") return "Remote OpenAI";
  return "OpenAI-compatible";
}

function inferProvider(baseUrl: string): DiscoveryProvider {
  try {
    const url = new URL(baseUrl);
    const hostname = url.hostname.toLowerCase();
    if (hostname === "api.openai.com") return "openai";
    if (url.port === "11434") return "ollama";
    if (url.port === "1234") return "lm-studio";
  } catch {
    return "openai-compatible";
  }
  return "openai-compatible";
}

function providerFromEnv(env: Env, baseUrl: string): DiscoveryProvider {
  const provider = readLlmEnvConfig(env).provider;
  if (provider === "ollama" || provider === "lm-studio" || provider === "openai") return provider;
  if (provider === "remote") return "openai";
  if (provider === "openai-compatible" || provider === "local") return "openai-compatible";
  return inferProvider(baseUrl);
}

function configuredBaseUrl(env: Env): string | undefined {
  const llmEnv = readLlmEnvConfig(env);
  const baseUrl = normalizeHttpBaseUrl(llmEnv.baseUrl);

  if (baseUrl) return baseUrl;
  if ((llmEnv.provider === "openai" || llmEnv.provider === "remote" || !llmEnv.provider) && llmEnv.apiKeyConfigured) {
    return DEFAULT_REMOTE_OPENAI_BASE_URL;
  }
  return undefined;
}

function apiKeyForTarget(env: Env, baseUrl: string, provider: DiscoveryProvider): string | undefined {
  const { explicitApiKey, remoteApiKey } = readLlmEnvConfig(env);
  const configured = configuredBaseUrl(env);
  const configuredIdentity = canonicalLlmEndpointIdentity(configured);
  const targetIdentity = canonicalLlmEndpointIdentity(baseUrl);

  if (!configuredIdentity || configuredIdentity !== targetIdentity) return undefined;
  return provider === "openai" ? remoteApiKey : explicitApiKey;
}

function splitDiscoveryBaseUrls(value: string | undefined): string[] {
  const trimmed = trimValue(value);
  if (!trimmed) return [];
  return trimmed
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function discoveryBaseUrlsFromEnv(env: Env): string[] {
  return normalizeAndDedupeDiscoveryBaseUrls([
    ...splitDiscoveryBaseUrls(env.ASSINI_LLM_DISCOVERY_BASE_URLS),
    ...splitDiscoveryBaseUrls(env.ASSINI_MODEL_DISCOVERY_URLS)
  ]);
}

function openAiTarget(params: {
  env: Env;
  provider: DiscoveryProvider;
  providerLabel?: string;
  source: string;
  baseUrl: string;
  reportErrors: boolean;
}): DiscoveryTarget | undefined {
  const normalized = normalizeHttpBaseUrl(params.baseUrl);
  if (!normalized) return undefined;
  const baseUrl = params.provider === "openai" ? normalized : ensureV1BaseUrl(normalized);
  const apiKey = apiKeyForTarget(params.env, baseUrl, params.provider);
  return {
    provider: params.provider,
    providerLabel: params.providerLabel ?? providerLabel(params.provider),
    source: params.source,
    baseUrl,
    scanUrl: `${normalizeBaseUrl(baseUrl)}/models`,
    kind: "openai-models",
    apiKey,
    requiresApiKey: params.provider === "openai",
    reportErrors: params.reportErrors
  };
}

function ollamaTagsTarget(params: {
  env: Env;
  source: string;
  baseUrl: string;
  reportErrors: boolean;
}): DiscoveryTarget | undefined {
  const normalized = normalizeHttpBaseUrl(params.baseUrl);
  if (!normalized) return undefined;
  const rootUrl = stripV1BaseUrl(normalized);
  const saveBaseUrl = ensureV1BaseUrl(rootUrl);
  const apiKey = apiKeyForTarget(params.env, saveBaseUrl, "ollama");
  return {
    provider: "ollama",
    providerLabel: "Ollama",
    source: params.source,
    baseUrl: saveBaseUrl,
    scanUrl: `${rootUrl}/api/tags`,
    kind: "ollama-tags",
    apiKey,
    requiresApiKey: false,
    reportErrors: params.reportErrors
  };
}

function lmStudioNativeTargets(params: { env: Env; source: string; baseUrl: string }): DiscoveryTarget[] {
  const normalized = normalizeHttpBaseUrl(params.baseUrl);
  if (!normalized) return [];
  const rootUrl = stripV1BaseUrl(normalized);
  const saveBaseUrl = ensureV1BaseUrl(rootUrl);
  const apiKey = apiKeyForTarget(params.env, saveBaseUrl, "lm-studio");
  return [
    {
      provider: "lm-studio",
      providerLabel: "LM Studio",
      source: params.source,
      baseUrl: saveBaseUrl,
      scanUrl: `${rootUrl}/api/v1/models`,
      kind: "lm-studio-native-v1",
      apiKey,
      requiresApiKey: false,
      reportErrors: false
    },
    {
      provider: "lm-studio",
      providerLabel: "LM Studio",
      source: params.source,
      baseUrl: saveBaseUrl,
      scanUrl: `${rootUrl}/api/v0/models`,
      kind: "lm-studio-native-v0",
      apiKey,
      requiresApiKey: false,
      reportErrors: false
    }
  ];
}

function shouldAddOllamaNativeTarget(baseUrl: string, provider: DiscoveryProvider): boolean {
  if (provider === "ollama") return true;
  try {
    return new URL(baseUrl).port === "11434";
  } catch {
    return false;
  }
}

function shouldAddLmStudioNativeTarget(baseUrl: string, provider: DiscoveryProvider): boolean {
  if (provider === "lm-studio") return true;
  try {
    return new URL(baseUrl).port === "1234";
  } catch {
    return false;
  }
}

function targetsForBaseUrl(params: {
  env: Env;
  baseUrl: string;
  source: string;
  provider?: DiscoveryProvider;
  reportErrors: boolean;
}): DiscoveryTarget[] {
  const normalized = normalizeHttpBaseUrl(params.baseUrl);
  if (!normalized) return [];
  const provider = params.provider ?? inferProvider(normalized);
  const targets = [
    openAiTarget({
      env: params.env,
      provider,
      source: params.source,
      baseUrl: normalized,
      reportErrors: params.reportErrors
    })
  ].filter((target): target is DiscoveryTarget => Boolean(target));

  if (shouldAddOllamaNativeTarget(normalized, provider)) {
    const nativeTarget = ollamaTagsTarget({
      env: params.env,
      source: params.source,
      baseUrl: normalized,
      reportErrors: params.reportErrors
    });
    if (nativeTarget) targets.push(nativeTarget);
  }

  if (shouldAddLmStudioNativeTarget(normalized, provider)) {
    targets.push(
      ...lmStudioNativeTargets({
        env: params.env,
        source: params.source,
        baseUrl: normalized
      })
    );
  }

  return targets;
}

function buildDiscoveryTargets(params: {
  env: Env;
  extraBaseUrls?: string[];
  includeCommonTargets: boolean;
}): DiscoveryTarget[] {
  const targets: DiscoveryTarget[] = [];
  const configured = configuredBaseUrl(params.env);
  if (configured) {
    targets.push(
      ...targetsForBaseUrl({
        env: params.env,
        baseUrl: configured,
        source: "Configured endpoint",
        provider: providerFromEnv(params.env, configured),
        reportErrors: true
      })
    );
  }

  for (const baseUrl of discoveryBaseUrlsFromEnv(params.env)) {
    targets.push(
      ...targetsForBaseUrl({
        env: params.env,
        baseUrl,
        source: "Discovery endpoint",
        reportErrors: true
      })
    );
  }

  for (const baseUrl of params.extraBaseUrls ?? []) {
    targets.push(
      ...targetsForBaseUrl({
        env: params.env,
        baseUrl,
        source: "Requested endpoint",
        reportErrors: true
      })
    );
  }

  if (params.includeCommonTargets) {
    for (const target of COMMON_OPENAI_COMPATIBLE_BASE_URLS) {
      targets.push(
        ...targetsForBaseUrl({
          env: params.env,
          provider: target.provider,
          source: target.source,
          baseUrl: target.baseUrl,
          reportErrors: false
        })
      );
    }

    for (const baseUrl of ["http://127.0.0.1:11434", "http://localhost:11434"]) {
      const ollama = ollamaTagsTarget({
        env: params.env,
        source: "Ollama local",
        baseUrl,
        reportErrors: false
      });
      if (ollama) targets.push(ollama);
    }
  }

  const byScanUrl = new Map<string, DiscoveryTarget>();
  for (const target of targets) {
    const key = `${target.kind}:${canonicalLocalBaseUrl(target.scanUrl)}`;
    const existing = byScanUrl.get(key);
    if (!existing || (!existing.reportErrors && target.reportErrors)) {
      byScanUrl.set(key, target);
    }
  }

  return [...byScanUrl.values()].slice(0, MAX_DISCOVERY_TARGETS);
}

function errorDetail(error: unknown, apiKey?: string): string {
  const message = error instanceof Error && error.message.trim().length > 0 ? error.message : "Model discovery failed.";
  if (message === "fetch failed") {
    return "Could not connect to the endpoint. Check that the model server is running and the host/port are reachable from this app.";
  }
  let sanitized = redactErrorSecrets(message);
  if (apiKey) sanitized = sanitized.split(apiKey).join("[redacted-secret]");
  return sanitized.length > 500 ? `${sanitized.slice(0, 499)}...` : sanitized;
}

async function readFailureDetail(response: Response, apiKey?: string): Promise<string> {
  const text = await response.text().catch(() => "");
  const fallback = `Model list request failed with status ${response.status}`;
  if (!text.trim()) return fallback;
  const detail = text.replace(/\s+/g, " ").trim();
  return errorDetail(new Error(`${fallback}: ${detail}`), apiKey);
}

async function fetchJsonWithTimeout(
  fetchFn: FetchFn,
  target: DiscoveryTarget,
  timeoutMs: number,
  env: Env,
  lookupFn?: LookupFn
): Promise<{ payload: unknown; status: number }> {
  try {
    const headers: Record<string, string> = {};
    headers["Cache-Control"] = "no-cache";
    if (target.apiKey) headers.Authorization = `Bearer ${target.apiKey}`;
    const response = await fetchOutboundHttp(
      target.scanUrl,
      {
        method: "GET",
        headers
      },
      {
        env,
        fetchFn,
        lookupFn,
        timeoutMs,
        maxResponseBytes: MAX_DISCOVERY_RESPONSE_BYTES,
        operation: "Model discovery request",
        secrets: [target.apiKey]
      }
    );
    if (!response.ok) {
      throw new Error(await readFailureDetail(response, target.apiKey));
    }
    return {
      payload: (await response.json()) as unknown,
      status: response.status
    };
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || /timed out after/i.test(error.message))) {
      throw new Error(`Model discovery timed out after ${timeoutMs}ms.`);
    }
    throw error;
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

async function forEachWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  task: (value: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      await task(values[index]!);
    }
  });
  await Promise.all(workers);
}

async function scanTarget(
  fetchFn: FetchFn,
  target: DiscoveryTarget,
  timeoutMs: number,
  env: Env,
  lookupFn?: LookupFn
): Promise<{ models: DiscoveredLlmModel[]; status: number }> {
  const { payload, status } = await fetchJsonWithTimeout(fetchFn, target, timeoutMs, env, lookupFn);
  const modelIds = uniqueSorted(parseDiscoveryModelIds(target.kind, payload));

  return {
    status,
    models: modelIds.map((model) => ({
      id: `${target.provider}|${target.baseUrl}|${model}`,
      provider: target.provider,
      providerLabel: target.providerLabel,
      source: target.source,
      baseUrl: target.baseUrl,
      model,
      requiresApiKey: target.requiresApiKey
    }))
  };
}

function sortModels(models: DiscoveredLlmModel[]): DiscoveredLlmModel[] {
  return models.sort((left, right) => {
    const sourceOrder = left.source.localeCompare(right.source);
    if (sourceOrder !== 0) return sourceOrder;
    const modelOrder = left.model.localeCompare(right.model);
    if (modelOrder !== 0) return modelOrder;
    return left.baseUrl.localeCompare(right.baseUrl);
  });
}

function modelDedupeKey(model: DiscoveredLlmModel): string {
  return `${model.provider}|${canonicalLocalBaseUrl(model.baseUrl)}|${model.model}`;
}

function endpointDedupeKey(endpoint: Pick<LlmModelDiscoveryEndpoint, "provider" | "baseUrl">): string {
  return `${endpoint.provider}|${canonicalLocalBaseUrl(endpoint.baseUrl)}`;
}

function baseUrlDedupeKey(baseUrl: string): string {
  return canonicalLocalBaseUrl(baseUrl);
}

function isLmStudioNativeKind(kind: DiscoveryKind): boolean {
  return kind === "lm-studio-native-v1" || kind === "lm-studio-native-v0";
}

function isLocalhostAlias(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === "localhost";
  } catch {
    return false;
  }
}

function recordEndpoint(endpoints: Map<string, LlmModelDiscoveryEndpoint>, endpoint: LlmModelDiscoveryEndpoint): void {
  const key = endpointDedupeKey(endpoint);
  const existing = endpoints.get(key);
  if (!existing) {
    endpoints.set(key, endpoint);
    return;
  }
  if (!existing.connected && endpoint.connected) {
    endpoints.set(key, endpoint);
    return;
  }
  if (
    existing.connected === endpoint.connected &&
    isLocalhostAlias(existing.baseUrl) &&
    !isLocalhostAlias(endpoint.baseUrl)
  ) {
    endpoints.set(key, endpoint);
  }
}

export async function discoverLlmModels(
  options: {
    env?: Env;
    fetchFn?: FetchFn;
    extraBaseUrls?: string[];
    timeoutMs?: number;
    includeCommonTargets?: boolean;
    lookupFn?: (hostname: string) => Promise<{ address: string; family: number }>;
  } = {}
): Promise<LlmModelDiscoveryResponse> {
  const env = options.env ?? process.env;
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeoutMs =
    Number.isInteger(options.timeoutMs) && (options.timeoutMs ?? 0) > 0
      ? (options.timeoutMs as number)
      : DEFAULT_DISCOVERY_TIMEOUT_MS;
  const errors: LlmModelDiscoveryError[] = [];
  const validatedExtraBaseUrls: string[] = [];
  const suppliedExtraBaseUrls = options.extraBaseUrls ?? [];

  if (suppliedExtraBaseUrls.length > MAX_EXTRA_DISCOVERY_BASE_URLS) {
    throw new LlmDiscoveryInputLimitError();
  }
  const extraBaseUrls = normalizeAndDedupeDiscoveryBaseUrls(suppliedExtraBaseUrls);

  for (const baseUrl of extraBaseUrls) {
    try {
      await assertOutboundHttpUrlAllowed(baseUrl, { env, lookupFn: options.lookupFn });
      validatedExtraBaseUrls.push(baseUrl);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Requested endpoint was blocked.";
      errors.push({
        source: "Requested endpoint",
        baseUrl: redactErrorSecrets(baseUrl),
        detail: redactErrorSecrets(detail)
      });
    }
  }

  const targets = buildDiscoveryTargets({
    env,
    extraBaseUrls: validatedExtraBaseUrls,
    includeCommonTargets: options.includeCommonTargets ?? true
  });
  const models = new Map<string, DiscoveredLlmModel>();
  const endpoints = new Map<string, LlmModelDiscoveryEndpoint>();
  const successfulScans: Array<{ target: DiscoveryTarget; result: { models: DiscoveredLlmModel[]; status: number } }> =
    [];
  const endpointRecords: Array<{ target: DiscoveryTarget; endpoint: LlmModelDiscoveryEndpoint }> = [];
  const errorRecords: Array<{
    target: DiscoveryTarget;
    endpoint: LlmModelDiscoveryEndpoint;
    error: LlmModelDiscoveryError;
  }> = [];

  await forEachWithConcurrency(targets, DISCOVERY_SCAN_CONCURRENCY, async (target) => {
    try {
      await assertOutboundHttpUrlAllowed(target.baseUrl, { env, lookupFn: options.lookupFn });
    } catch (error) {
      if (target.reportErrors) {
        const detail = error instanceof Error ? error.message : "Discovery endpoint was blocked.";
        errors.push({
          source: target.source,
          baseUrl: redactErrorSecrets(target.baseUrl),
          detail: redactErrorSecrets(detail)
        });
      }
      return;
    }

    try {
      const result = await scanTarget(fetchFn, target, timeoutMs, env, options.lookupFn);
      const endpoint: LlmModelDiscoveryEndpoint = {
        source: target.source,
        baseUrl: target.baseUrl,
        provider: target.provider,
        providerLabel: target.providerLabel,
        connected: true,
        status: result.status,
        modelCount: result.models.length,
        ...(result.models.length === 0 ? { detail: "Connected, but the endpoint did not return any models." } : {})
      };
      successfulScans.push({ target, result });
      endpointRecords.push({ target, endpoint });
    } catch (error) {
      if (target.reportErrors) {
        const detail = errorDetail(error, target.apiKey);
        const safeBaseUrl = redactErrorSecrets(target.baseUrl);
        const endpoint: LlmModelDiscoveryEndpoint = {
          source: target.source,
          baseUrl: safeBaseUrl,
          provider: target.provider,
          providerLabel: target.providerLabel,
          connected: false,
          modelCount: 0,
          detail
        };
        errorRecords.push({
          target,
          endpoint,
          error: {
            source: target.source,
            baseUrl: safeBaseUrl,
            detail
          }
        });
      }
    }
  });

  const lmStudioNativeBaseUrls = new Set(
    successfulScans
      .filter(({ target }) => isLmStudioNativeKind(target.kind))
      .map(({ target }) => baseUrlDedupeKey(target.baseUrl))
  );

  const isShadowedOpenAiLmStudioScan = (target: DiscoveryTarget) =>
    target.kind === "openai-models" && lmStudioNativeBaseUrls.has(baseUrlDedupeKey(target.baseUrl));

  for (const { target, endpoint } of endpointRecords) {
    if (!isShadowedOpenAiLmStudioScan(target)) {
      recordEndpoint(endpoints, endpoint);
    }
  }

  for (const { target, endpoint, error } of errorRecords) {
    if (!isShadowedOpenAiLmStudioScan(target)) {
      recordEndpoint(endpoints, endpoint);
      errors.push(error);
    }
  }

  for (const { target, result } of successfulScans) {
    if (isShadowedOpenAiLmStudioScan(target)) continue;
    for (const model of result.models) {
      const key = modelDedupeKey(model);
      if (!models.has(key)) {
        models.set(key, model);
      }
    }
  }

  return {
    scannedAt: new Date().toISOString(),
    models: sortModels([...models.values()]),
    endpoints: [...endpoints.values()].sort((left, right) => left.baseUrl.localeCompare(right.baseUrl)),
    errors
  };
}
