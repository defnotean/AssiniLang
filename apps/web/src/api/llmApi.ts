import type {
  LlmModelDiscoveryResponse,
  LlmReachability,
  LlmStatus,
  RuntimeSettings,
  RuntimeSettingsResponse
} from "@assini/api-contract";
import { assertOk, fetchAsActor, getJson } from "../lib/apiClient";

export type RuntimeSettingsUpdate = Partial<Pick<
  RuntimeSettings,
  | "provider"
  | "baseUrl"
  | "model"
  | "timeoutMs"
  | "maxTokens"
  | "jsonMode"
  | "transcriptionBaseUrl"
  | "transcriptionModel"
  | "ocrLang"
  | "allowPrivateUrls"
>> & {
  apiKey?: string;
  clearApiKey?: boolean;
  transcriptionApiKey?: string;
  clearTranscriptionApiKey?: boolean;
};

export async function fetchLlmStatus(): Promise<LlmStatus> {
  return getJson<LlmStatus>("/llm/status");
}

export async function fetchRuntimeSettings(): Promise<RuntimeSettingsResponse> {
  return getJson<RuntimeSettingsResponse>("/llm/settings", "programmer");
}

export async function fetchDiscoveredModels(
  baseUrl?: string,
  options: { includeCommonTargets?: boolean } = {}
): Promise<LlmModelDiscoveryResponse> {
  const query = new URLSearchParams();
  const trimmedBaseUrl = baseUrl?.trim();
  if (trimmedBaseUrl) query.set("baseUrl", trimmedBaseUrl);
  if (options.includeCommonTargets === false) {
    query.set("includeCommonTargets", "false");
  }
  query.set("refresh", Date.now().toString());
  return getJson<LlmModelDiscoveryResponse>(`/llm/models?${query.toString()}`, "programmer", {
    cache: "no-store"
  });
}

export async function updateRuntimeSettings(payload: RuntimeSettingsUpdate): Promise<RuntimeSettingsResponse> {
  const response = await fetchAsActor("programmer", "/api/llm/settings", {
    method: "PUT",
    body: JSON.stringify(payload)
  }, true);

  await assertOk(response, "Runtime settings update failed");

  return response.json() as Promise<RuntimeSettingsResponse>;
}

export async function checkLlmReachability(): Promise<LlmReachability> {
  const response = await fetchAsActor("programmer", "/api/llm/health-check", { method: "POST" });

  await assertOk(response, "LLM reachability check failed");

  return response.json() as Promise<LlmReachability>;
}
