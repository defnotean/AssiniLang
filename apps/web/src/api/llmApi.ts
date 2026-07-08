import type {
  LlmModelDiscoveryResponse,
  LlmReachability,
  LlmStatus,
  ModelProfileSavePayload,
  RuntimeSettingsPatch,
  RuntimeSettingsResponse
} from "@assini/api-contract";
import { assertOk, fetchAsActor, getJson } from "../lib/apiClient";

/** Alias kept for existing call sites; matches the shared API contract. */
export type RuntimeSettingsUpdate = RuntimeSettingsPatch;

export async function fetchLlmStatus(): Promise<LlmStatus> {
  return getJson<LlmStatus>("/llm/status", "programmer");
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

export async function saveModelProfile(payload: ModelProfileSavePayload): Promise<RuntimeSettingsResponse> {
  const response = await fetchAsActor("programmer", "/api/llm/model-profiles", {
    method: "POST",
    body: JSON.stringify(payload)
  }, true);

  await assertOk(response, "Model profile save failed");

  return response.json() as Promise<RuntimeSettingsResponse>;
}

export async function activateModelProfile(profileId: string): Promise<RuntimeSettingsResponse> {
  const response = await fetchAsActor(
    "programmer",
    `/api/llm/model-profiles/${encodeURIComponent(profileId)}/activate`,
    { method: "PUT" }
  );

  await assertOk(response, "Model profile switch failed");

  return response.json() as Promise<RuntimeSettingsResponse>;
}

export async function deleteModelProfile(profileId: string): Promise<RuntimeSettingsResponse> {
  const response = await fetchAsActor(
    "programmer",
    `/api/llm/model-profiles/${encodeURIComponent(profileId)}`,
    { method: "DELETE" }
  );

  await assertOk(response, "Model profile delete failed");

  return response.json() as Promise<RuntimeSettingsResponse>;
}

export async function checkLlmReachability(): Promise<LlmReachability> {
  const response = await fetchAsActor("programmer", "/api/llm/health-check", { method: "POST" });

  await assertOk(response, "LLM reachability check failed");

  return response.json() as Promise<LlmReachability>;
}
