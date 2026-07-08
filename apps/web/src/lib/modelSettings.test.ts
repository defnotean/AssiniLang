import { describe, expect, it } from "vitest";
import type { DiscoveredLlmModel, LlmModelDiscoveryResponse, RuntimeSettingsResponse } from "../api";
import {
  DEFAULT_FORM,
  findStaleActiveModel,
  formFromSettings,
  positiveInteger,
  syncFormWithDiscoveredModels
} from "./modelSettings";

function discoveredModel(overrides: Partial<DiscoveredLlmModel> = {}): DiscoveredLlmModel {
  return {
    id: "local:llama",
    provider: "openai-compatible",
    providerLabel: "Local OpenAI-compatible",
    source: "local",
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "llama-3",
    requiresApiKey: false,
    ...overrides
  };
}

function discovery(models: DiscoveredLlmModel[]): LlmModelDiscoveryResponse {
  const endpoints = [...new Set(models.map((model) => model.baseUrl))].map((baseUrl) => ({
    source: "local",
    baseUrl,
    provider: "openai-compatible" as const,
    providerLabel: "Local OpenAI-compatible",
    connected: true,
    modelCount: models.filter((model) => model.baseUrl === baseUrl).length
  }));

  return {
    scannedAt: "2026-07-06T00:00:00.000Z",
    models,
    endpoints,
    errors: []
  };
}

function runtimeSettings(
  overrides: Partial<RuntimeSettingsResponse["settings"]> = {}
): RuntimeSettingsResponse["settings"] {
  return {
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "llama-3",
    apiKeyConfigured: false,
    timeoutMs: 30000,
    maxTokens: 4096,
    jsonMode: false,
    transcriptionBaseUrl: "",
    transcriptionModel: "whisper-1",
    transcriptionApiKeyConfigured: false,
    ocrBaseUrl: "",
    ocrModel: "llava",
    ocrApiKeyConfigured: false,
    ocrLang: "eng",
    allowPrivateUrls: false,
    ...overrides
  };
}

describe("model settings helpers", () => {
  it("keeps secret fields blank when building form state from runtime settings", () => {
    const form = formFromSettings({
      settings: {
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "llama-3",
        apiKeyConfigured: true,
        timeoutMs: 30000,
        maxTokens: 8192,
        jsonMode: true,
        transcriptionBaseUrl: "http://127.0.0.1:9000/v1",
        transcriptionModel: "whisper-large",
        transcriptionApiKeyConfigured: true,
        ocrBaseUrl: "http://127.0.0.1:11434/v1",
        ocrModel: "llava",
        ocrApiKeyConfigured: true,
        ocrLang: "ceb",
        allowPrivateUrls: true
      }
    } as RuntimeSettingsResponse);

    expect(form).toMatchObject({
      apiKey: "",
      clearApiKey: false,
      timeoutMs: "30000",
      maxTokens: "8192",
      transcriptionApiKey: "",
      clearTranscriptionApiKey: false,
      ocrBaseUrl: "http://127.0.0.1:11434/v1",
      ocrModel: "llava",
      ocrApiKey: "",
      clearOcrApiKey: false,
      ocrLang: "ceb"
    });
  });

  it("parses only positive integer strings", () => {
    expect(positiveInteger("42")).toBe(42);
    expect(positiveInteger("0")).toBeUndefined();
    expect(positiveInteger("1.5")).toBeUndefined();
    expect(positiveInteger("abc")).toBeUndefined();
  });

  it("auto-selects the only discovered model when no model is saved", () => {
    const next = syncFormWithDiscoveredModels(DEFAULT_FORM, discovery([discoveredModel()]));

    expect(next).toMatchObject({
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:1234/v1",
      model: "llama-3"
    });
  });

  it("clears a stale model when its endpoint is connected but no models are loaded", () => {
    const next = syncFormWithDiscoveredModels(
      {
        ...DEFAULT_FORM,
        provider: "openai-compatible",
        baseUrl: "http://localhost:1234/v1",
        model: "unloaded-model"
      },
      {
        scannedAt: "2026-07-06T00:00:00.000Z",
        models: [],
        endpoints: [{
          source: "local",
          baseUrl: "http://127.0.0.1:1234/v1",
          provider: "openai-compatible",
          providerLabel: "Local OpenAI-compatible",
          connected: true,
          modelCount: 0
        }],
        errors: []
      }
    );

    expect(next.model).toBe("");
  });

  it("does not overwrite unsaved manual model edits during discovery refresh", () => {
    const next = syncFormWithDiscoveredModels(
      {
        ...DEFAULT_FORM,
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "custom-model-being-typed"
      },
      discovery([discoveredModel({ model: "newly-loaded-model" })]),
      runtimeSettings({ model: "previously-saved-model" })
    );

    expect(next.model).toBe("custom-model-being-typed");
  });

  it("updates a stale saved model when the form still matches saved settings", () => {
    const next = syncFormWithDiscoveredModels(
      {
        ...DEFAULT_FORM,
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "previously-saved-model"
      },
      discovery([discoveredModel({ model: "newly-loaded-model" })]),
      runtimeSettings({ model: "previously-saved-model" })
    );

    expect(next.model).toBe("newly-loaded-model");
  });

  it("identifies a replacement for a stale saved model on the same endpoint", () => {
    const replacement = discoveredModel({ model: "newly-loaded-model" });
    const stale = findStaleActiveModel(
      {
        provider: "openai-compatible",
        baseUrl: "http://localhost:1234/v1",
        model: "unloaded-model",
        apiKeyConfigured: false,
        timeoutMs: 30000,
        maxTokens: 4096,
        jsonMode: false,
        transcriptionBaseUrl: "",
        transcriptionModel: "whisper-1",
        transcriptionApiKeyConfigured: false,
        ocrBaseUrl: "",
        ocrModel: "llava",
        ocrApiKeyConfigured: false,
        ocrLang: "eng",
        allowPrivateUrls: false
      },
      discovery([replacement])
    );

    expect(stale).toMatchObject({
      baseUrl: "http://localhost:1234/v1",
      replacement,
      savedModel: "unloaded-model"
    });
  });
});
