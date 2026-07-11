import { trimValue } from "./llmEnvShared.js";

export type DiscoveryKind = "openai-models" | "ollama-tags" | "lm-studio-native-v1" | "lm-studio-native-v0";

type ModelIdParser = (payload: unknown) => string[];

function modelIdFromValue(value: unknown): string | undefined {
  if (typeof value === "string") return trimValue(value);
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["id", "model", "name", "key", "selected_variant"]) {
    const candidate = record[key];
    if (typeof candidate === "string") return trimValue(candidate);
  }
  return undefined;
}

function modelIdsFromValues(values: unknown[]): string[] {
  return values.map(modelIdFromValue).filter((item): item is string => Boolean(item));
}

function parseOpenAiModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const data = record.data;
  if (Array.isArray(data)) {
    return modelIdsFromValues(data);
  }

  const models = record.models;
  if (Array.isArray(models)) {
    return modelIdsFromValues(models);
  }

  return [];
}

function parseOllamaModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const models = (payload as Record<string, unknown>).models;
  if (!Array.isArray(models)) return [];
  return modelIdsFromValues(models);
}

function modelListFromPayload(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.models)) return record.models;
  if (Array.isArray(record.data)) return record.data;
  return [];
}

function modelTypeIsEmbeddings(model: Record<string, unknown>): boolean {
  const type = typeof model.type === "string" ? model.type.toLowerCase() : "";
  return type === "embedding" || type === "embeddings";
}

function parseLmStudioNativeV1ModelIds(payload: unknown): string[] {
  const ids: string[] = [];
  for (const item of modelListFromPayload(payload)) {
    if (!item || typeof item !== "object") continue;
    const model = item as Record<string, unknown>;
    if (modelTypeIsEmbeddings(model)) continue;
    const loadedInstances = Array.isArray(model.loaded_instances) ? model.loaded_instances : [];
    if (loadedInstances.length === 0) continue;

    const before = ids.length;
    for (const instance of loadedInstances) {
      const id = modelIdFromValue(instance);
      if (id) ids.push(id);
    }
    if (ids.length === before) {
      const fallback = modelIdFromValue(model);
      if (fallback) ids.push(fallback);
    }
  }
  return ids;
}

function lmStudioV0StateIsLoaded(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const state = value.toLowerCase();
  return state === "loaded" || state === "ready" || state === "loaded-in-memory";
}

function parseLmStudioNativeV0ModelIds(payload: unknown): string[] {
  return modelListFromPayload(payload)
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const model = item as Record<string, unknown>;
      if (modelTypeIsEmbeddings(model) || !lmStudioV0StateIsLoaded(model.state)) return undefined;
      return modelIdFromValue(model);
    })
    .filter((item): item is string => Boolean(item));
}

const MODEL_ID_PARSERS: Record<DiscoveryKind, ModelIdParser> = {
  "openai-models": parseOpenAiModelIds,
  "ollama-tags": parseOllamaModelIds,
  "lm-studio-native-v1": parseLmStudioNativeV1ModelIds,
  "lm-studio-native-v0": parseLmStudioNativeV0ModelIds
};

export function parseDiscoveryModelIds(kind: DiscoveryKind, payload: unknown): string[] {
  return MODEL_ID_PARSERS[kind](payload);
}
