import type { DiscoveredLlmModel, LlmModelDiscoveryResponse, RuntimeSettingsResponse } from "../api";
import { modelDisplayName, sameModelBaseUrl } from "./modelFormatting";

export type SettingsFormState = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  clearApiKey: boolean;
  timeoutMs: string;
  maxTokens: string;
  jsonMode: boolean;
  embeddingBaseUrl: string;
  embeddingModel: string;
  embeddingApiKey: string;
  clearEmbeddingApiKey: boolean;
  embeddingTimeoutMs: string;
  transcriptionBaseUrl: string;
  transcriptionModel: string;
  transcriptionApiKey: string;
  clearTranscriptionApiKey: boolean;
  ocrBaseUrl: string;
  ocrModel: string;
  ocrApiKey: string;
  clearOcrApiKey: boolean;
  ocrLang: string;
  allowPrivateUrls: boolean;
};

export type StaleActiveModel = {
  baseUrl: string;
  replacement: DiscoveredLlmModel | null;
  savedModel: string;
  savedModelDisplay: string;
};

export const DEFAULT_FORM: SettingsFormState = {
  provider: "deterministic",
  baseUrl: "",
  model: "",
  apiKey: "",
  clearApiKey: false,
  timeoutMs: "180000",
  maxTokens: "4096",
  jsonMode: false,
  embeddingBaseUrl: "",
  embeddingModel: "",
  embeddingApiKey: "",
  clearEmbeddingApiKey: false,
  embeddingTimeoutMs: "30000",
  transcriptionBaseUrl: "",
  transcriptionModel: "whisper-1",
  transcriptionApiKey: "",
  clearTranscriptionApiKey: false,
  ocrBaseUrl: "",
  ocrModel: "llava",
  ocrApiKey: "",
  clearOcrApiKey: false,
  ocrLang: "eng",
  allowPrivateUrls: false
};

export function formFromSettings(response: RuntimeSettingsResponse): SettingsFormState {
  const settings = response.settings;
  return {
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKey: "",
    clearApiKey: false,
    timeoutMs: settings.timeoutMs.toString(),
    maxTokens: settings.maxTokens.toString(),
    jsonMode: settings.jsonMode,
    embeddingBaseUrl: settings.embeddingBaseUrl ?? "",
    embeddingModel: settings.embeddingModel ?? "",
    embeddingApiKey: "",
    clearEmbeddingApiKey: false,
    embeddingTimeoutMs: String(settings.embeddingTimeoutMs ?? 30_000),
    transcriptionBaseUrl: settings.transcriptionBaseUrl,
    transcriptionModel: settings.transcriptionModel,
    transcriptionApiKey: "",
    clearTranscriptionApiKey: false,
    ocrBaseUrl: settings.ocrBaseUrl,
    ocrModel: settings.ocrModel,
    ocrApiKey: "",
    clearOcrApiKey: false,
    ocrLang: settings.ocrLang,
    allowPrivateUrls: settings.allowPrivateUrls
  };
}

export function positiveInteger(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

const OCR_LANG_PATTERN = /^[a-z]{2,3}$/i;

export function ocrLangCode(value: string): string | undefined {
  const trimmed = value.trim();
  return OCR_LANG_PATTERN.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

export function optionalHttpUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return trimmed;
  } catch {
    return undefined;
  }
  return undefined;
}

export type SettingsValidationError =
  | "model.settingsNumericError"
  | "model.embeddingTimeoutInvalid"
  | "model.embeddingBaseUrlInvalid"
  | "model.ocrLangInvalid"
  | "model.ocrBaseUrlInvalid";

export function validateSettingsForm(
  form: SettingsFormState
): { ok: true } | { ok: false; errorKey: SettingsValidationError } {
  if (!positiveInteger(form.timeoutMs) || !positiveInteger(form.maxTokens)) {
    return { ok: false, errorKey: "model.settingsNumericError" };
  }
  const embeddingTimeoutMs = positiveInteger(form.embeddingTimeoutMs);
  if (!embeddingTimeoutMs || embeddingTimeoutMs > 600_000) {
    return { ok: false, errorKey: "model.embeddingTimeoutInvalid" };
  }
  if (optionalHttpUrl(form.embeddingBaseUrl) === undefined) {
    return { ok: false, errorKey: "model.embeddingBaseUrlInvalid" };
  }
  if (optionalHttpUrl(form.ocrBaseUrl) === undefined) {
    return { ok: false, errorKey: "model.ocrBaseUrlInvalid" };
  }
  if (!ocrLangCode(form.ocrLang)) {
    return { ok: false, errorKey: "model.ocrLangInvalid" };
  }
  return { ok: true };
}

function inputValue(formElement: HTMLFormElement, id: string, fallback: string): string {
  const control = formElement.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  return control ? control.value : fallback;
}

function checkboxValue(formElement: HTMLFormElement, id: string, fallback: boolean): boolean {
  const control = formElement.querySelector<HTMLInputElement>(`#${id}`);
  return control ? control.checked : fallback;
}

export function formStateFromControls(formElement: HTMLFormElement, fallback: SettingsFormState): SettingsFormState {
  return {
    provider: inputValue(formElement, "model-provider", fallback.provider),
    baseUrl: inputValue(formElement, "model-base-url", fallback.baseUrl),
    model: inputValue(formElement, "model-name", fallback.model),
    apiKey: inputValue(formElement, "model-api-key", fallback.apiKey),
    clearApiKey: checkboxValue(formElement, "clear-model-key", fallback.clearApiKey),
    timeoutMs: inputValue(formElement, "model-timeout", fallback.timeoutMs),
    maxTokens: inputValue(formElement, "model-max-tokens", fallback.maxTokens),
    jsonMode: checkboxValue(formElement, "json-mode", fallback.jsonMode),
    embeddingBaseUrl: inputValue(formElement, "embedding-base-url", fallback.embeddingBaseUrl),
    embeddingModel: inputValue(formElement, "embedding-model", fallback.embeddingModel),
    embeddingApiKey: inputValue(formElement, "embedding-api-key", fallback.embeddingApiKey),
    clearEmbeddingApiKey: checkboxValue(formElement, "clear-embedding-key", fallback.clearEmbeddingApiKey),
    embeddingTimeoutMs: inputValue(formElement, "embedding-timeout", fallback.embeddingTimeoutMs),
    transcriptionBaseUrl: inputValue(formElement, "transcribe-base-url", fallback.transcriptionBaseUrl),
    transcriptionModel: inputValue(formElement, "transcribe-model", fallback.transcriptionModel),
    transcriptionApiKey: inputValue(formElement, "transcribe-api-key", fallback.transcriptionApiKey),
    clearTranscriptionApiKey: checkboxValue(formElement, "clear-transcribe-key", fallback.clearTranscriptionApiKey),
    ocrBaseUrl: inputValue(formElement, "ocr-base-url", fallback.ocrBaseUrl),
    ocrModel: inputValue(formElement, "ocr-model", fallback.ocrModel),
    ocrApiKey: inputValue(formElement, "ocr-api-key", fallback.ocrApiKey),
    clearOcrApiKey: checkboxValue(formElement, "clear-ocr-key", fallback.clearOcrApiKey),
    ocrLang: inputValue(formElement, "ocr-lang", fallback.ocrLang),
    allowPrivateUrls: checkboxValue(formElement, "allow-private-urls", fallback.allowPrivateUrls)
  };
}

export function findStaleActiveModel(
  settings: RuntimeSettingsResponse["settings"],
  discovery: LlmModelDiscoveryResponse
): StaleActiveModel | null {
  const savedModel = settings.model.trim();
  const savedBaseUrl = settings.baseUrl.trim();
  if (!savedModel || !savedBaseUrl) return null;

  const savedEndpointConnected = discovery.endpoints.some(
    (endpoint) => endpoint.connected && sameModelBaseUrl(endpoint.baseUrl, savedBaseUrl)
  );
  if (!savedEndpointConnected) return null;

  const savedModelStillLoaded = discovery.models.some(
    (candidate) => sameModelBaseUrl(candidate.baseUrl, savedBaseUrl) && candidate.model === savedModel
  );
  if (savedModelStillLoaded) return null;

  const modelsForSavedEndpoint = discovery.models.filter((candidate) =>
    sameModelBaseUrl(candidate.baseUrl, savedBaseUrl)
  );

  return {
    baseUrl: savedBaseUrl,
    replacement: modelsForSavedEndpoint.length === 1 ? modelsForSavedEndpoint[0] : null,
    savedModel,
    savedModelDisplay: modelDisplayName(savedModel)
  };
}

export function formatScanTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function discoveredModelMatchesForm(candidate: DiscoveredLlmModel, form: SettingsFormState): boolean {
  return (
    candidate.provider === form.provider &&
    sameModelBaseUrl(candidate.baseUrl, form.baseUrl) &&
    candidate.model === form.model.trim()
  );
}

export function applyDiscoveredModelToForm(form: SettingsFormState, candidate: DiscoveredLlmModel): SettingsFormState {
  return {
    ...form,
    provider: candidate.provider,
    baseUrl: candidate.baseUrl,
    model: candidate.model
  };
}

function modelSelectionMatchesSettings(
  form: SettingsFormState,
  settings: RuntimeSettingsResponse["settings"]
): boolean {
  return (
    form.provider === settings.provider &&
    sameModelBaseUrl(form.baseUrl, settings.baseUrl) &&
    form.model.trim() === settings.model.trim()
  );
}

export function syncFormWithDiscoveredModels(
  form: SettingsFormState,
  discovery: LlmModelDiscoveryResponse,
  savedSettings?: RuntimeSettingsResponse["settings"] | null
): SettingsFormState {
  const currentModel = form.model.trim();
  const currentBaseUrl = form.baseUrl.trim();
  const canUpdateModelSelection = !savedSettings || modelSelectionMatchesSettings(form, savedSettings);
  const modelsForCurrentEndpoint = currentBaseUrl
    ? discovery.models.filter((candidate) => sameModelBaseUrl(candidate.baseUrl, currentBaseUrl))
    : [];

  if (discovery.models.some((candidate) => discoveredModelMatchesForm(candidate, form))) {
    return form;
  }

  if (!currentModel) {
    if (!canUpdateModelSelection) return form;
    const candidate =
      modelsForCurrentEndpoint.length === 1
        ? modelsForCurrentEndpoint[0]
        : discovery.models.length === 1
          ? discovery.models[0]
          : undefined;
    return candidate ? applyDiscoveredModelToForm(form, candidate) : form;
  }

  if (!currentBaseUrl) return form;

  const currentEndpointConnected = discovery.endpoints.some(
    (endpoint) => endpoint.connected && sameModelBaseUrl(endpoint.baseUrl, currentBaseUrl)
  );
  if (!currentEndpointConnected) return form;

  if (modelsForCurrentEndpoint.length === 1) {
    if (!canUpdateModelSelection) return form;
    return applyDiscoveredModelToForm(form, modelsForCurrentEndpoint[0]);
  }

  if (modelsForCurrentEndpoint.length === 0) {
    if (!canUpdateModelSelection) return form;
    return { ...form, model: "" };
  }

  return form;
}
