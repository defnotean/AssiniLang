import { useEffect, useState, type FormEvent } from "react";
import { LLM_PROVIDER_OPTIONS } from "../lib/llmProviders";
import type {
  DiscoveredLlmModel,
  LlmModelDiscoveryResponse,
  LlmReachability,
  LlmStatus,
  ObservabilityData,
  RuntimeSettingsResponse,
  RuntimeSettingsUpdate
} from "../api";
import { StatusBadge } from "../components/badges";
import { useI18n } from "../i18n";
import {
  getDesktopBridgeInfo,
  refreshDesktopBackupSummary,
  refreshDesktopShortcutSummary,
  runDesktopAction,
  saveDesktopDiagnosticsReport,
  setDesktopPreferences,
  type DesktopAction,
  type DesktopBackupSummary,
  type DesktopPreferences,
  type DesktopShortcutSummary
} from "../lib/desktopBridge";
import { countFailedSessions, formatCount, formatMode, formatReachability, formatStatus } from "../lib/format";
import type { AsyncState } from "../lib/types";

type SettingsFormState = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  clearApiKey: boolean;
  timeoutMs: string;
  maxTokens: string;
  jsonMode: boolean;
  transcriptionBaseUrl: string;
  transcriptionModel: string;
  transcriptionApiKey: string;
  clearTranscriptionApiKey: boolean;
  ocrLang: string;
  allowPrivateUrls: boolean;
};

type DesktopActionNotice = {
  kind: "success" | "error";
  message: string;
};

type StaleActiveModel = {
  baseUrl: string;
  replacement: DiscoveredLlmModel | null;
  savedModel: string;
  savedModelDisplay: string;
};

const DEFAULT_FORM: SettingsFormState = {
  provider: "deterministic",
  baseUrl: "",
  model: "",
  apiKey: "",
  clearApiKey: false,
  timeoutMs: "180000",
  maxTokens: "4096",
  jsonMode: false,
  transcriptionBaseUrl: "",
  transcriptionModel: "whisper-1",
  transcriptionApiKey: "",
  clearTranscriptionApiKey: false,
  ocrLang: "eng",
  allowPrivateUrls: false
};

function formFromSettings(response: RuntimeSettingsResponse): SettingsFormState {
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
    transcriptionBaseUrl: settings.transcriptionBaseUrl,
    transcriptionModel: settings.transcriptionModel,
    transcriptionApiKey: "",
    clearTranscriptionApiKey: false,
    ocrLang: settings.ocrLang,
    allowPrivateUrls: settings.allowPrivateUrls
  };
}

function positiveInteger(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function compactMiddle(value: string, maxLength = 96): string {
  if (value.length <= maxLength) return value;
  const sideLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, sideLength)}...${value.slice(value.length - sideLength)}`;
}

function modelDisplayName(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return trimmed;

  const normalized = trimmed.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const fileName = parts.at(-1) ?? trimmed;
  const repoSegment = parts.find((part) => part.startsWith("models--"));
  if (repoSegment) {
    const repoName = repoSegment.replace(/^models--/, "").replace(/--/g, "/");
    return compactMiddle(`${repoName} / ${fileName}`);
  }

  if (parts.length > 1) {
    return compactMiddle(fileName);
  }

  return compactMiddle(trimmed);
}

function discoveredModelLabel(candidate: DiscoveredLlmModel): string {
  return `${compactMiddle(modelDisplayName(candidate.model), 52)} | ${candidate.providerLabel}`;
}

function diagnosticValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "not set";
}

function diagnosticYesNo(value: boolean | undefined): string {
  return value ? "yes" : "no";
}

function diagnosticApiKey(status: LlmStatus): string {
  if (status.apiKey.configured) return "configured server-side";
  return status.apiKey.required ? "required but not configured" : "optional/not configured";
}

function findStaleActiveModel(
  settings: RuntimeSettingsResponse["settings"],
  discovery: LlmModelDiscoveryResponse
): StaleActiveModel | null {
  const savedModel = settings.model.trim();
  const savedBaseUrl = settings.baseUrl.trim();
  if (!savedModel || !savedBaseUrl) return null;

  const savedEndpointConnected = discovery.endpoints.some((endpoint) => (
    endpoint.connected && sameModelBaseUrl(endpoint.baseUrl, savedBaseUrl)
  ));
  if (!savedEndpointConnected) return null;

  const savedModelStillLoaded = discovery.models.some((candidate) => (
    sameModelBaseUrl(candidate.baseUrl, savedBaseUrl) && candidate.model === savedModel
  ));
  if (savedModelStillLoaded) return null;

  const modelsForSavedEndpoint = discovery.models.filter((candidate) => (
    sameModelBaseUrl(candidate.baseUrl, savedBaseUrl)
  ));

  return {
    baseUrl: savedBaseUrl,
    replacement: modelsForSavedEndpoint.length === 1 ? modelsForSavedEndpoint[0] : null,
    savedModel,
    savedModelDisplay: modelDisplayName(savedModel)
  };
}

function formatScanTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatBackupTime(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function normalizeModelBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.hostname.toLowerCase() === "localhost") {
      url.hostname = "127.0.0.1";
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function sameModelBaseUrl(left: string, right: string): boolean {
  return normalizeModelBaseUrl(left) === normalizeModelBaseUrl(right);
}

function discoveredModelMatchesForm(candidate: DiscoveredLlmModel, form: SettingsFormState): boolean {
  return candidate.provider === form.provider
    && sameModelBaseUrl(candidate.baseUrl, form.baseUrl)
    && candidate.model === form.model.trim();
}

function applyDiscoveredModelToForm(form: SettingsFormState, candidate: DiscoveredLlmModel): SettingsFormState {
  return {
    ...form,
    provider: candidate.provider,
    baseUrl: candidate.baseUrl,
    model: candidate.model
  };
}

function syncFormWithDiscoveredModels(
  form: SettingsFormState,
  discovery: LlmModelDiscoveryResponse
): SettingsFormState {
  const currentModel = form.model.trim();
  const currentBaseUrl = form.baseUrl.trim();
  const modelsForCurrentEndpoint = currentBaseUrl
    ? discovery.models.filter((candidate) => sameModelBaseUrl(candidate.baseUrl, currentBaseUrl))
    : [];

  if (discovery.models.some((candidate) => discoveredModelMatchesForm(candidate, form))) {
    return form;
  }

  if (!currentModel) {
    const candidate = modelsForCurrentEndpoint.length === 1
      ? modelsForCurrentEndpoint[0]
      : discovery.models.length === 1
        ? discovery.models[0]
        : undefined;
    return candidate ? applyDiscoveredModelToForm(form, candidate) : form;
  }

  if (!currentBaseUrl) return form;

  const currentEndpointConnected = discovery.endpoints.some((endpoint) => (
    endpoint.connected && sameModelBaseUrl(endpoint.baseUrl, currentBaseUrl)
  ));
  if (!currentEndpointConnected) return form;

  if (modelsForCurrentEndpoint.length === 1) {
    return applyDiscoveredModelToForm(form, modelsForCurrentEndpoint[0]);
  }

  if (modelsForCurrentEndpoint.length === 0) {
    return { ...form, model: "" };
  }

  return form;
}

export function ModelSetupView({
  llmState,
  settingsState,
  modelDiscoveryState,
  observabilityState,
  isTestingModel,
  modelTestResult,
  modelTestIsPlaceholder,
  onSmokeTest,
  isCheckingReachability,
  reachabilityResult,
  reachabilityError,
  onTestConnection,
  isSavingSettings,
  settingsSaveResult,
  settingsSaveError,
  isRefreshingModels,
  isAutoRefreshingModels,
  onRefreshModelDiscovery,
  onSaveSettings
}: {
  llmState: AsyncState<LlmStatus>;
  settingsState: AsyncState<RuntimeSettingsResponse>;
  modelDiscoveryState: AsyncState<LlmModelDiscoveryResponse>;
  observabilityState: AsyncState<ObservabilityData>;
  isTestingModel: boolean;
  modelTestResult: string | null;
  modelTestIsPlaceholder: boolean;
  onSmokeTest: () => void;
  isCheckingReachability: boolean;
  reachabilityResult: LlmReachability | null;
  reachabilityError: string | null;
  onTestConnection: () => void;
  isSavingSettings: boolean;
  settingsSaveResult: string | null;
  settingsSaveError: string | null;
  isRefreshingModels: boolean;
  isAutoRefreshingModels: boolean;
  onRefreshModelDiscovery: (baseUrl?: string) => Promise<void>;
  onSaveSettings: (payload: RuntimeSettingsUpdate) => Promise<void>;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<SettingsFormState>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [desktopActionBusy, setDesktopActionBusy] = useState<DesktopAction | null>(null);
  const [desktopActionNotice, setDesktopActionNotice] = useState<DesktopActionNotice | null>(null);
  const [desktopPreferenceBusy, setDesktopPreferenceBusy] = useState<keyof Pick<DesktopPreferences, "hideToTray" | "launchAtLogin"> | null>(null);
  const [isCopyingDiagnostics, setIsCopyingDiagnostics] = useState(false);
  const [isSavingDiagnostics, setIsSavingDiagnostics] = useState(false);
  const desktopBridge = getDesktopBridgeInfo();
  const [desktopBackupSummary, setDesktopBackupSummary] = useState<DesktopBackupSummary | null>(
    () => desktopBridge?.backupSummary ?? null
  );
  const [desktopShortcutSummary, setDesktopShortcutSummary] = useState<DesktopShortcutSummary | null>(
    () => desktopBridge?.shortcutSummary ?? null
  );
  const [desktopPreferences, setDesktopPreferencesState] = useState<DesktopPreferences | null>(
    () => desktopBridge?.preferences ?? null
  );

  useEffect(() => {
    setDesktopBackupSummary(desktopBridge?.backupSummary ?? null);
  }, [
    desktopBridge?.backupSummary?.backupsDir,
    desktopBridge?.backupSummary?.count,
    desktopBridge?.backupSummary?.latestCreatedAt,
    desktopBridge?.backupSummary?.latestName,
    desktopBridge?.backupSummary?.latestPath
  ]);

  useEffect(() => {
    setDesktopShortcutSummary(desktopBridge?.shortcutSummary ?? null);
  }, [
    desktopBridge?.shortcutSummary?.desktopExists,
    desktopBridge?.shortcutSummary?.desktopPath,
    desktopBridge?.shortcutSummary?.startMenuExists,
    desktopBridge?.shortcutSummary?.startMenuPath
  ]);

  useEffect(() => {
    if (!desktopBridge) return;
    let cancelled = false;
    void refreshDesktopBackupSummary().then((result) => {
      if (!cancelled && result.backupSummary) {
        setDesktopBackupSummary(result.backupSummary);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [desktopBridge?.backupsDir]);

  useEffect(() => {
    if (!desktopBridge) return;
    let cancelled = false;
    void refreshDesktopShortcutSummary().then((result) => {
      if (!cancelled && result.shortcutSummary) {
        setDesktopShortcutSummary(result.shortcutSummary);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [desktopBridge?.isPackaged]);

  useEffect(() => {
    setDesktopPreferencesState(desktopBridge?.preferences ?? null);
  }, [
    desktopBridge?.preferences?.hideToTray,
    desktopBridge?.preferences?.hideToTraySupported,
    desktopBridge?.preferences?.launchAtLogin,
    desktopBridge?.preferences?.launchAtLoginSupported
  ]);

  useEffect(() => {
    if (settingsState.status === "ready") {
      setForm(formFromSettings(settingsState.data));
      setFormError(null);
    }
  }, [settingsState]);

  useEffect(() => {
    if (settingsState.status !== "ready" || modelDiscoveryState.status !== "ready") return;
    setForm((current) => syncFormWithDiscoveredModels(current, modelDiscoveryState.data));
  }, [modelDiscoveryState, settingsState.status]);

  const discoveredModels = modelDiscoveryState.status === "ready" ? modelDiscoveryState.data.models : [];
  const desktopControlsBusy = desktopActionBusy !== null
    || desktopPreferenceBusy !== null
    || isCopyingDiagnostics
    || isSavingDiagnostics;

  if (llmState.status === "loading" || llmState.status === "idle") {
    return (
      <div className="panel-card" role="status" aria-live="polite">
        {t("model.checkingConfiguration")}
      </div>
    );
  }

  if (llmState.status === "error") {
    return (
      <div className="panel-card error" role="alert">
        {llmState.message}
      </div>
    );
  }

  const status = llmState.data;
  const settings = settingsState.status === "ready" ? settingsState.data.settings : null;
  const discoveryEndpoints = modelDiscoveryState.status === "ready" ? modelDiscoveryState.data.endpoints ?? [] : [];
  const discoveryErrors = modelDiscoveryState.status === "ready" ? modelDiscoveryState.data.errors : [];
  const connectedEndpoints = discoveryEndpoints.filter((endpoint) => endpoint.connected);
  const failedEndpoints = discoveryEndpoints.filter((endpoint) => !endpoint.connected);
  const isScanningModels = isRefreshingModels || modelDiscoveryState.status === "loading";
  const lastModelScan = modelDiscoveryState.status === "ready"
    ? formatScanTime(modelDiscoveryState.data.scannedAt)
    : null;
  const observability = observabilityState.status === "ready" ? observabilityState.data : null;
  const recentSessions = observability?.sessions.slice(0, 5) ?? [];
  const selectedDiscoveredModelId = discoveredModels.find((candidate) => discoveredModelMatchesForm(candidate, form))?.id ?? "";
  const staleActiveModel = settings && modelDiscoveryState.status === "ready"
    ? findStaleActiveModel(settings, modelDiscoveryState.data)
    : null;

  function buildSettingsPayload(nextForm: SettingsFormState): RuntimeSettingsUpdate | null {
    const timeoutMs = positiveInteger(nextForm.timeoutMs);
    const maxTokens = positiveInteger(nextForm.maxTokens);
    if (!timeoutMs || !maxTokens) {
      setFormError(t("model.settingsNumericError"));
      return null;
    }

    setFormError(null);
    return {
      provider: nextForm.provider,
      baseUrl: nextForm.baseUrl.trim(),
      model: nextForm.model.trim(),
      apiKey: nextForm.apiKey,
      clearApiKey: nextForm.clearApiKey,
      timeoutMs,
      maxTokens,
      jsonMode: nextForm.jsonMode,
      transcriptionBaseUrl: nextForm.transcriptionBaseUrl.trim(),
      transcriptionModel: nextForm.transcriptionModel.trim(),
      transcriptionApiKey: nextForm.transcriptionApiKey,
      clearTranscriptionApiKey: nextForm.clearTranscriptionApiKey,
      ocrLang: nextForm.ocrLang.trim(),
      allowPrivateUrls: nextForm.allowPrivateUrls
    };
  }

  function clearSecretFields() {
    setForm((current) => ({
      ...current,
      apiKey: "",
      clearApiKey: false,
      transcriptionApiKey: "",
      clearTranscriptionApiKey: false
    }));
  }

  async function saveSettingsForm(nextForm: SettingsFormState) {
    const payload = buildSettingsPayload(nextForm);
    if (!payload) return;

    try {
      await onSaveSettings(payload);
      clearSecretFields();
    } catch {
      return;
    }
  }

  async function handleDiscoveredModelChange(value: string) {
    const candidate = discoveredModels.find((item) => item.id === value);
    if (!candidate) return;
    const nextForm = applyDiscoveredModelToForm(form, candidate);
    setForm(nextForm);
    await saveSettingsForm(nextForm);
  }

  async function handleApplyLoadedModel(candidate: DiscoveredLlmModel) {
    const nextForm = applyDiscoveredModelToForm(form, candidate);
    setForm(nextForm);
    await saveSettingsForm(nextForm);
  }

  async function handleClearSavedModel() {
    const nextForm = {
      ...form,
      provider: "deterministic",
      baseUrl: "",
      model: "",
      apiKey: "",
      clearApiKey: true
    };
    setForm(nextForm);
    await saveSettingsForm(nextForm);
  }

  function discoveredModelNamesForEndpoint(endpoint: typeof connectedEndpoints[number]): string[] {
    return [...new Set(
      discoveredModels
        .filter((candidate) => sameModelBaseUrl(candidate.baseUrl, endpoint.baseUrl))
        .map((candidate) => modelDisplayName(candidate.model))
    )];
  }

  function fullDiscoveredModelNamesForEndpoint(endpoint: typeof connectedEndpoints[number]): string {
    return [...new Set(
      discoveredModels
        .filter((candidate) => sameModelBaseUrl(candidate.baseUrl, endpoint.baseUrl))
        .map((candidate) => candidate.model)
    )].join(", ");
  }

  function connectedEndpointMessage(endpoint: typeof connectedEndpoints[number]): string {
    const modelNames = discoveredModelNamesForEndpoint(endpoint);
    if (modelNames.length === 1) {
      return t("model.endpointConnectedOneNamed", { model: modelNames[0], baseUrl: endpoint.baseUrl });
    }
    if (modelNames.length > 1) {
      return t("model.endpointConnectedNamed", {
        baseUrl: endpoint.baseUrl,
        count: modelNames.length,
        models: modelNames.slice(0, 3).join(", ")
      });
    }
    if (endpoint.modelCount === 1) {
      return t("model.endpointConnectedOne", { baseUrl: endpoint.baseUrl });
    }
    if (endpoint.modelCount > 1) {
      return t("model.endpointConnected", { baseUrl: endpoint.baseUrl, count: endpoint.modelCount });
    }
    return t("model.endpointConnectedNoModels", { baseUrl: endpoint.baseUrl });
  }

  function buildDiagnosticsText(): string {
    const lines = [
      "AssiniLang Desktop diagnostics",
      `Generated: ${new Date().toISOString()}`,
      "",
      "Desktop",
      `- Bridge: ${desktopBridge ? "available" : "not available"}`,
      `- Packaged: ${diagnosticYesNo(desktopBridge?.isPackaged)}`,
      `- App version: ${diagnosticValue(desktopBridge?.appVersion)}`,
      `- App executable: ${diagnosticValue(desktopBridge?.appPath)}`,
      `- App folder: ${diagnosticValue(desktopBridge?.appFolder)}`,
      `- Data folder: ${diagnosticValue(desktopBridge?.dataDir)}`,
      `- Settings file: ${diagnosticValue(desktopBridge?.settingsPath)}`,
      `- Backups folder: ${diagnosticValue(desktopBridge?.backupsDir)}`,
      `- Diagnostics folder: ${diagnosticValue(desktopBridge?.diagnosticsDir)}`,
      `- Backups available: ${desktopBackupSummary?.count ?? "not loaded"}`,
      `- Latest backup: ${diagnosticValue(desktopBackupSummary?.latestName)}`,
      `- Latest backup created: ${diagnosticValue(formatBackupTime(desktopBackupSummary?.latestCreatedAt))}`,
      `- Desktop shortcut: ${desktopShortcutSummary?.desktopExists ? "installed" : "not installed"}`,
      `- Desktop shortcut path: ${diagnosticValue(desktopShortcutSummary?.desktopPath)}`,
      `- Start Menu shortcut: ${desktopShortcutSummary?.startMenuExists ? "installed" : "not installed"}`,
      `- Start Menu shortcut path: ${diagnosticValue(desktopShortcutSummary?.startMenuPath)}`,
      `- Launch at sign-in: ${diagnosticYesNo(desktopPreferences?.launchAtLogin)}`,
      `- Launch at sign-in supported: ${diagnosticYesNo(desktopPreferences?.launchAtLoginSupported)}`,
      `- Hide to tray on close: ${diagnosticYesNo(desktopPreferences?.hideToTray)}`,
      `- Hide to tray supported: ${diagnosticYesNo(desktopPreferences?.hideToTraySupported)}`,
      "",
      "Provider readiness",
      `- Ready: ${diagnosticYesNo(status.configured)}`,
      `- Mode: ${formatMode(status.mode)}`,
      `- Provider: ${diagnosticValue(status.provider)}`,
      `- Active provider: ${diagnosticValue(status.activeProviderName)}`,
      `- Model: ${diagnosticValue(status.model)}`,
      `- Model display: ${status.model ? modelDisplayName(status.model) : "not set"}`,
      `- Base URL: ${diagnosticValue(status.baseUrl)}`,
      `- Timeout ms: ${status.timeoutMs}`,
      `- API key: ${diagnosticApiKey(status)}`,
      `- Warnings: ${status.warnings.length}`,
      "",
      "Runtime settings",
      `- Loaded: ${settings ? "yes" : "no"}`,
      `- Provider: ${diagnosticValue(settings?.provider)}`,
      `- Base URL: ${diagnosticValue(settings?.baseUrl)}`,
      `- Model: ${diagnosticValue(settings?.model)}`,
      `- Max tokens: ${settings?.maxTokens ?? "not set"}`,
      `- JSON mode: ${diagnosticYesNo(settings?.jsonMode)}`,
      `- Allow private URLs: ${diagnosticYesNo(settings?.allowPrivateUrls)}`,
      `- Transcription base URL: ${diagnosticValue(settings?.transcriptionBaseUrl)}`,
      `- Transcription model: ${diagnosticValue(settings?.transcriptionModel)}`,
      `- Transcription key: ${settings?.transcriptionApiKeyConfigured ? "configured server-side" : "not configured"}`,
      `- OCR language: ${diagnosticValue(settings?.ocrLang)}`,
      "",
      "Model discovery",
      `- State: ${modelDiscoveryState.status}`,
      `- Last scan: ${lastModelScan ?? "not scanned"}`,
      `- Models: ${discoveredModels.length}`,
      `- Connected endpoints: ${connectedEndpoints.length}`,
      `- Failed endpoints: ${failedEndpoints.length}`,
      `- Discovery errors: ${discoveryErrors.length}`,
      "",
      "Observability",
      `- State: ${observabilityState.status}`,
      `- Total sessions: ${observability?.totals.sessions ?? "not loaded"}`,
      `- Failed recent sessions: ${observability ? countFailedSessions(observability) : "not loaded"}`
    ];

    if (discoveredModels.length > 0) {
      lines.push("", "Loaded models");
      discoveredModels.slice(0, 25).forEach((candidate) => {
        lines.push(`- ${candidate.model} (${candidate.providerLabel}, ${candidate.baseUrl})`);
      });
      if (discoveredModels.length > 25) {
        lines.push(`- ${discoveredModels.length - 25} more models omitted`);
      }
    }

    if (discoveryEndpoints.length > 0) {
      lines.push("", "Discovery endpoints");
      discoveryEndpoints.forEach((endpoint) => {
        const detail = endpoint.detail ? `; detail: ${endpoint.detail}` : "";
        const statusCode = endpoint.status ? `; status: ${endpoint.status}` : "";
        lines.push(
          `- ${endpoint.connected ? "connected" : "failed"} ${endpoint.baseUrl} (${endpoint.providerLabel}; models: ${endpoint.modelCount}${statusCode}${detail})`
        );
      });
    }

    return lines.join("\n");
  }

  async function handleCopyDiagnostics() {
    const clipboard = typeof window === "undefined" ? undefined : window.navigator.clipboard;
    if (!clipboard?.writeText) {
      setDesktopActionNotice({
        kind: "error",
        message: t("model.diagnosticsCopyUnavailable")
      });
      return;
    }

    setIsCopyingDiagnostics(true);
    setDesktopActionNotice(null);
    try {
      await clipboard.writeText(buildDiagnosticsText());
      setDesktopActionNotice({
        kind: "success",
        message: t("model.diagnosticsCopied")
      });
    } catch (error) {
      setDesktopActionNotice({
        kind: "error",
        message: error instanceof Error ? error.message : t("model.diagnosticsCopyFailed")
      });
    } finally {
      setIsCopyingDiagnostics(false);
    }
  }

  async function handleSaveDiagnosticsReport() {
    setIsSavingDiagnostics(true);
    setDesktopActionNotice(null);
    try {
      const result = await saveDesktopDiagnosticsReport(buildDiagnosticsText());
      setDesktopActionNotice({
        kind: result.ok ? "success" : "error",
        message: result.message ?? (result.ok ? t("model.diagnosticsSaved") : t("model.diagnosticsSaveFailed"))
      });
    } catch (error) {
      setDesktopActionNotice({
        kind: "error",
        message: error instanceof Error ? error.message : t("model.diagnosticsSaveFailed")
      });
    } finally {
      setIsSavingDiagnostics(false);
    }
  }

  async function handleDesktopPreferenceChange(
    key: keyof Pick<DesktopPreferences, "hideToTray" | "launchAtLogin">,
    value: boolean
  ) {
    setDesktopPreferenceBusy(key);
    setDesktopActionNotice(null);
    try {
      const result = await setDesktopPreferences({ [key]: value });
      if (result.preferences) {
        setDesktopPreferencesState(result.preferences);
      }
      setDesktopActionNotice({
        kind: result.ok ? "success" : "error",
        message: result.message ?? (result.ok ? t("model.desktopPreferenceSaved") : t("model.desktopPreferenceFailed"))
      });
    } catch (error) {
      setDesktopActionNotice({
        kind: "error",
        message: error instanceof Error ? error.message : t("model.desktopPreferenceFailed")
      });
    } finally {
      setDesktopPreferenceBusy(null);
    }
  }

  async function handleDesktopAction(action: DesktopAction) {
    setDesktopActionBusy(action);
    setDesktopActionNotice(null);
    try {
      const result = await runDesktopAction(action);
      if (result.backupSummary) {
        setDesktopBackupSummary(result.backupSummary);
      }
      if (result.shortcutSummary) {
        setDesktopShortcutSummary(result.shortcutSummary);
      }
      setDesktopActionNotice({
        kind: result.ok ? "success" : "error",
        message: result.message ?? (result.ok ? t("model.desktopActionComplete") : t("model.desktopActionFailed"))
      });
    } catch (error) {
      setDesktopActionNotice({
        kind: "error",
        message: error instanceof Error ? error.message : t("model.desktopActionFailed")
      });
    } finally {
      setDesktopActionBusy(null);
    }
  }

  async function handleRestoreLatestBackup() {
    if (typeof window !== "undefined" && !window.confirm(t("model.restoreBackupConfirm"))) {
      return;
    }
    await handleDesktopAction("restoreLatestDataBackup");
  }

  async function handlePruneOldBackups() {
    if (typeof window !== "undefined" && !window.confirm(t("model.pruneBackupsConfirm"))) {
      return;
    }
    await handleDesktopAction("pruneOldDataBackups");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildSettingsPayload(form);
    if (!payload) return;

    try {
      await onSaveSettings(payload);
    } catch {
      return;
    }
    clearSecretFields();
  }

  return (
    <div className="model-grid">
      <section className="panel-card model-status" aria-label={t("model.providerReadinessAria")}>
        <div className="record-topline">
          <div>
            <span className="detail-label">{t("model.providerReadiness")}</span>
            <h2>{status.configured ? t("model.ready") : t("model.needsConfiguration")}</h2>
          </div>
          <span className={`status-badge ${status.configured ? "approved" : "under_review"}`}>
            {status.configured ? t("model.configured") : t("model.incomplete")}
          </span>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>{t("model.mode")}</dt>
            <dd>{formatMode(status.mode)}</dd>
          </div>
          <div>
            <dt>{t("model.provider")}</dt>
            <dd>{status.provider}</dd>
          </div>
          <div>
            <dt>{t("model.model")}</dt>
            <dd title={status.model}>{status.model ? modelDisplayName(status.model) : t("model.notSet")}</dd>
          </div>
          <div>
            <dt>{t("model.baseUrl")}</dt>
            <dd>{status.baseUrl ?? t("model.notSet")}</dd>
          </div>
          <div>
            <dt>{t("model.apiKey")}</dt>
            <dd>{status.apiKey.configured ? t("model.configuredServerSide") : status.apiKey.required ? t("model.required") : t("model.optionalNotSet")}</dd>
          </div>
          <div>
            <dt>{t("model.timeout")}</dt>
            <dd>{t("model.timeoutValue", { ms: status.timeoutMs })}</dd>
          </div>
        </dl>
        <p className="privacy-note">
          {t("model.privacyNote")}
        </p>
        {status.warnings.length > 0 && (
          <div className="warning-list">
            {status.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
        <div className="model-actions">
          <button type="button" onClick={onSmokeTest} disabled={isTestingModel || isSavingSettings}>
            {isTestingModel ? t("model.testingProvider") : t("model.runSmokeTest")}
          </button>
          <button type="button" className="secondary" onClick={onTestConnection} disabled={isCheckingReachability || isSavingSettings}>
            {isCheckingReachability ? t("model.testing") : t("model.testConnection")}
          </button>
        </div>
        {modelTestResult && (
          <>
            {modelTestIsPlaceholder && (
              <p className="result-notice warning" role="status" aria-live="polite">
                {t("model.offlinePlaceholder")}
              </p>
            )}
            <p className="result-notice" role="status" aria-live="polite">
              {modelTestResult}
            </p>
          </>
        )}
        {reachabilityError && (
          <p className="result-notice error" role="alert">
            {reachabilityError}
          </p>
        )}
        {reachabilityResult && (
          <p className="result-notice" role="status" aria-live="polite">
            {formatReachability(reachabilityResult)}
          </p>
        )}
      </section>

      <section className="panel-card model-settings" aria-label={t("model.runtimeSettingsAria")}>
        <div className="record-topline">
          <div>
            <span className="detail-label">{t("model.runtimeSettings")}</span>
            <h2>{t("model.configureProvider")}</h2>
          </div>
          {settings && (
            <span className={`status-badge ${settings.apiKeyConfigured ? "approved" : "under_review"}`}>
              {settings.apiKeyConfigured ? t("model.keyStored") : t("model.noKeyStored")}
            </span>
          )}
        </div>
        {settingsState.status === "loading" && (
          <p className="inline-empty" role="status" aria-live="polite">{t("model.loadingSettings")}</p>
        )}
        {settingsState.status === "error" && (
          <p className="inline-error" role="alert">{settingsState.message}</p>
        )}
        {desktopBridge && (
          <div className="desktop-tools" aria-label={t("model.desktopToolsAria")}>
            <div>
              <span className="detail-label">{t("model.desktopApp")}</span>
              <dl className="detail-grid">
                {desktopBridge.appVersion && (
                  <div data-desktop-info="version">
                    <dt>{t("model.desktopAppVersion")}</dt>
                    <dd>{desktopBridge.appVersion}</dd>
                  </div>
                )}
                {desktopBridge.appFolder && (
                  <div data-desktop-path="app">
                    <dt>{t("model.desktopAppFolder")}</dt>
                    <dd><code>{desktopBridge.appFolder}</code></dd>
                  </div>
                )}
                {desktopBridge.dataDir && (
                  <div data-desktop-path="data">
                    <dt>{t("model.desktopDataPath")}</dt>
                    <dd><code>{desktopBridge.dataDir}</code></dd>
                  </div>
                )}
                {desktopBridge.settingsPath && (
                  <div data-desktop-path="settings">
                    <dt>{t("model.desktopSettingsPath")}</dt>
                    <dd><code>{desktopBridge.settingsPath}</code></dd>
                  </div>
                )}
                {desktopBridge.backupsDir && (
                  <div data-desktop-path="backups">
                    <dt>{t("model.desktopBackupsPath")}</dt>
                    <dd><code>{desktopBridge.backupsDir}</code></dd>
                  </div>
                )}
                {desktopBridge.diagnosticsDir && (
                  <div data-desktop-path="diagnostics">
                    <dt>{t("model.desktopDiagnosticsPath")}</dt>
                    <dd><code>{desktopBridge.diagnosticsDir}</code></dd>
                  </div>
                )}
                {desktopBackupSummary && (
                  <div data-desktop-backup-summary="count">
                    <dt>{t("model.desktopBackupCount")}</dt>
                    <dd>{t("model.desktopBackupCountValue", { count: desktopBackupSummary.count })}</dd>
                  </div>
                )}
                {desktopBackupSummary?.latestName && (
                  <div data-desktop-backup-summary="latest">
                    <dt>{t("model.desktopLatestBackup")}</dt>
                    <dd>
                      <code>{desktopBackupSummary.latestName}</code>
                      {desktopBackupSummary.latestCreatedAt && (
                        <span>{t("model.desktopLatestBackupCreated", { time: formatBackupTime(desktopBackupSummary.latestCreatedAt) })}</span>
                      )}
                    </dd>
                  </div>
                )}
                {desktopShortcutSummary && (
                  <>
                    <div data-desktop-shortcut-summary="desktop">
                      <dt>{t("model.desktopShortcutDesktop")}</dt>
                      <dd className="desktop-shortcut-status">
                        <span>{desktopShortcutSummary.desktopExists ? t("model.shortcutInstalled") : t("model.shortcutMissing")}</span>
                        {desktopShortcutSummary.desktopPath && <code>{desktopShortcutSummary.desktopPath}</code>}
                      </dd>
                    </div>
                    <div data-desktop-shortcut-summary="start-menu">
                      <dt>{t("model.desktopShortcutStartMenu")}</dt>
                      <dd className="desktop-shortcut-status">
                        <span>{desktopShortcutSummary.startMenuExists ? t("model.shortcutInstalled") : t("model.shortcutMissing")}</span>
                        {desktopShortcutSummary.startMenuPath && <code>{desktopShortcutSummary.startMenuPath}</code>}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
            {desktopPreferences && (
              <div className="desktop-preferences" aria-label={t("model.desktopPreferencesAria")}>
                <label className="checkbox-row settings-checkbox" htmlFor="desktop-launch-at-login">
                  <input
                    id="desktop-launch-at-login"
                    type="checkbox"
                    checked={desktopPreferences.launchAtLogin}
                    disabled={
                      desktopControlsBusy
                      || desktopPreferences.launchAtLoginSupported === false
                    }
                    onChange={(event) => void handleDesktopPreferenceChange("launchAtLogin", event.target.checked)}
                  />
                  {desktopPreferenceBusy === "launchAtLogin" ? t("model.savingDesktopPreference") : t("model.launchAtSignIn")}
                </label>
                <label className="checkbox-row settings-checkbox" htmlFor="desktop-hide-to-tray">
                  <input
                    id="desktop-hide-to-tray"
                    type="checkbox"
                    checked={desktopPreferences.hideToTray}
                    disabled={
                      desktopControlsBusy
                      || desktopPreferences.hideToTraySupported === false
                    }
                    onChange={(event) => void handleDesktopPreferenceChange("hideToTray", event.target.checked)}
                  />
                  {desktopPreferenceBusy === "hideToTray" ? t("model.savingDesktopPreference") : t("model.hideToTrayOnClose")}
                </label>
              </div>
            )}
            <div className="desktop-action-groups" aria-label={t("model.desktopActionGroupsAria")}>
              <div className="desktop-action-group" data-desktop-action-group="recovery">
                <span className="detail-label">{t("model.desktopGroupRecovery")}</span>
                <div className="settings-actions desktop-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={desktopControlsBusy}
                    onClick={() => void handleDesktopAction("resetWindowLayout")}
                  >
                    {desktopActionBusy === "resetWindowLayout" ? t("model.resettingWindowLayout") : t("model.resetWindowLayout")}
                  </button>
                </div>
              </div>
              <div className="desktop-action-group" data-desktop-action-group="diagnostics">
                <span className="detail-label">{t("model.desktopGroupDiagnostics")}</span>
                <div className="settings-actions desktop-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={desktopControlsBusy}
                    onClick={() => void handleCopyDiagnostics()}
                  >
                    {isCopyingDiagnostics ? t("model.copyingDiagnostics") : t("model.copyDiagnostics")}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={desktopControlsBusy}
                    onClick={() => void handleSaveDiagnosticsReport()}
                  >
                    {isSavingDiagnostics ? t("model.savingDiagnosticsReport") : t("model.saveDiagnosticsReport")}
                  </button>
                </div>
              </div>
              <div className="desktop-action-group" data-desktop-action-group="folders">
                <span className="detail-label">{t("model.desktopGroupFolders")}</span>
                <div className="settings-actions desktop-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={desktopControlsBusy}
                    onClick={() => void handleDesktopAction("openAppFolder")}
                  >
                    {desktopActionBusy === "openAppFolder" ? t("model.openingDesktopPath") : t("model.openAppFolder")}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={desktopControlsBusy}
                    onClick={() => void handleDesktopAction("openDataFolder")}
                  >
                    {desktopActionBusy === "openDataFolder" ? t("model.openingDesktopPath") : t("model.openDataFolder")}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={desktopControlsBusy}
                    onClick={() => void handleDesktopAction("openSettingsFolder")}
                  >
                    {desktopActionBusy === "openSettingsFolder" ? t("model.openingDesktopPath") : t("model.openSettingsFolder")}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={desktopControlsBusy}
                    onClick={() => void handleDesktopAction("openDiagnosticsFolder")}
                  >
                    {desktopActionBusy === "openDiagnosticsFolder" ? t("model.openingDesktopPath") : t("model.openDiagnosticsFolder")}
                  </button>
                </div>
              </div>
              <div className="desktop-action-group" data-desktop-action-group="backups">
                <span className="detail-label">{t("model.desktopGroupBackups")}</span>
                <div className="settings-actions desktop-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={desktopControlsBusy}
                    onClick={() => void handleDesktopAction("createDataBackup")}
                  >
                    {desktopActionBusy === "createDataBackup" ? t("model.creatingBackup") : t("model.createDataBackup")}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={desktopControlsBusy}
                    onClick={() => void handleRestoreLatestBackup()}
                  >
                    {desktopActionBusy === "restoreLatestDataBackup" ? t("model.restoringBackup") : t("model.restoreLatestBackup")}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={desktopControlsBusy}
                    onClick={() => void handleDesktopAction("openBackupsFolder")}
                  >
                    {desktopActionBusy === "openBackupsFolder" ? t("model.openingDesktopPath") : t("model.openBackupsFolder")}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={
                      desktopControlsBusy
                      || !desktopBackupSummary?.latestName
                    }
                    onClick={() => void handleDesktopAction("openLatestBackupFolder")}
                  >
                    {desktopActionBusy === "openLatestBackupFolder" ? t("model.openingDesktopPath") : t("model.openLatestBackupFolder")}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={
                      desktopControlsBusy
                      || (desktopBackupSummary?.count ?? 0) <= 5
                    }
                    onClick={() => void handlePruneOldBackups()}
                  >
                    {desktopActionBusy === "pruneOldDataBackups" ? t("model.pruningBackups") : t("model.pruneOldBackups")}
                  </button>
                </div>
              </div>
              {desktopBridge.isPackaged && (
                <div className="desktop-action-group" data-desktop-action-group="shortcuts">
                  <span className="detail-label">{t("model.desktopGroupShortcuts")}</span>
                  <div className="settings-actions desktop-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={desktopControlsBusy}
                      onClick={() => void handleDesktopAction("createAppShortcuts")}
                    >
                      {desktopActionBusy === "createAppShortcuts" ? t("model.creatingShortcut") : t("model.createAppShortcuts")}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={desktopControlsBusy}
                      onClick={() => void handleDesktopAction("createDesktopShortcut")}
                    >
                      {desktopActionBusy === "createDesktopShortcut" ? t("model.creatingShortcut") : t("model.createDesktopShortcut")}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={desktopControlsBusy}
                      onClick={() => void handleDesktopAction("createStartMenuShortcut")}
                    >
                      {desktopActionBusy === "createStartMenuShortcut" ? t("model.creatingShortcut") : t("model.createStartMenuShortcut")}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {desktopActionNotice && (
              <p
                className={`result-notice ${desktopActionNotice.kind === "error" ? "error" : ""}`}
                role={desktopActionNotice.kind === "error" ? "alert" : "status"}
                aria-live="polite"
              >
                {desktopActionNotice.message}
              </p>
            )}
          </div>
        )}
        {settingsState.status === "ready" && (
          <form className="settings-form" onSubmit={handleSubmit}>
            <div className="settings-grid">
              <div className="form-group wide">
                <label htmlFor="discovered-model">{t("model.discoveredModels")}</label>
                <div className="settings-inline-row">
                  <select
                    id="discovered-model"
                    value={selectedDiscoveredModelId}
                    disabled={isSavingSettings || isScanningModels || discoveredModels.length === 0}
                    onChange={(event) => void handleDiscoveredModelChange(event.target.value)}
                  >
                    <option value="">
                      {isScanningModels
                        ? t("model.scanningModels")
                        : discoveredModels.length > 0
                          ? t("model.chooseDiscoveredModel")
                          : t("model.noDiscoveredModels")}
                    </option>
                    {discoveredModels.map((candidate) => (
                      <option
                        key={candidate.id}
                        value={candidate.id}
                        title={`${candidate.model} (${candidate.providerLabel}, ${candidate.baseUrl})`}
                      >
                        {discoveredModelLabel(candidate)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="secondary"
                    disabled={isSavingSettings || isScanningModels}
                    onClick={() => void onRefreshModelDiscovery(form.baseUrl.trim() || undefined)}
                  >
                    {isScanningModels ? t("model.scanningModels") : t("model.refreshModels")}
                  </button>
                </div>
                {modelDiscoveryState.status === "error" && (
                  <p className="inline-error" role="alert">{modelDiscoveryState.message}</p>
                )}
                {modelDiscoveryState.status === "ready" && (
                  <p className="model-scan-meta" role="status" aria-live="polite">
                    {isAutoRefreshingModels
                      ? t("model.autoRefreshingModels")
                      : lastModelScan
                        ? t("model.lastModelScan", { time: lastModelScan })
                        : t("model.autoDiscoveryActive")}
                  </p>
                )}
                {connectedEndpoints.slice(0, 2).map((endpoint) => (
                  <p
                    key={`connected:${endpoint.source}:${endpoint.baseUrl}`}
                    className="result-notice"
                    role="status"
                    aria-live="polite"
                    title={fullDiscoveredModelNamesForEndpoint(endpoint)}
                  >
                    {connectedEndpointMessage(endpoint)}
                  </p>
                ))}
                {staleActiveModel && (
                  <div className="result-notice warning stale-model-notice" role="status" aria-live="polite">
                    <p>
                      {staleActiveModel.replacement
                        ? t("model.savedModelUnavailableWithReplacement", {
                          baseUrl: staleActiveModel.baseUrl,
                          model: staleActiveModel.savedModelDisplay,
                          replacement: modelDisplayName(staleActiveModel.replacement.model)
                        })
                        : t("model.savedModelUnavailable", {
                          baseUrl: staleActiveModel.baseUrl,
                          model: staleActiveModel.savedModelDisplay
                        })}
                    </p>
                    <div className="settings-actions">
                      {staleActiveModel.replacement && (
                        <button
                          type="button"
                          className="secondary"
                          disabled={isSavingSettings}
                          onClick={() => void handleApplyLoadedModel(staleActiveModel.replacement!)}
                        >
                          {t("model.applyLoadedModel")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="secondary"
                        disabled={isSavingSettings}
                        onClick={() => void handleClearSavedModel()}
                      >
                        {t("model.clearSavedModel")}
                      </button>
                    </div>
                  </div>
                )}
                {failedEndpoints.slice(0, 2).map((endpoint) => (
                  <p key={`failed:${endpoint.source}:${endpoint.baseUrl}:${endpoint.detail}`} className="inline-error">
                    {t("model.endpointConnectionFailed", {
                      baseUrl: endpoint.baseUrl,
                      detail: endpoint.detail ?? t("model.errModelDiscoveryFailed")
                    })}
                  </p>
                ))}
                {failedEndpoints.length === 0 && connectedEndpoints.length === 0 && discoveryErrors.slice(0, 2).map((error) => (
                  <p key={`${error.source}:${error.baseUrl}:${error.detail}`} className="inline-error">
                    {t("model.endpointConnectionFailed", { baseUrl: error.baseUrl, detail: error.detail })}
                  </p>
                ))}
              </div>
              <div className="form-group">
                <label htmlFor="model-provider">{t("model.provider")}</label>
                <select
                  id="model-provider"
                  value={form.provider}
                  disabled={isSavingSettings}
                  onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
                >
                  {LLM_PROVIDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="model-base-url">{t("model.baseUrl")}</label>
                <input
                  id="model-base-url"
                  value={form.baseUrl}
                  placeholder="http://127.0.0.1:11434/v1"
                  disabled={isSavingSettings}
                  onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="model-name">{t("model.model")}</label>
                <input
                  id="model-name"
                  value={form.model}
                  placeholder="irene-fusion"
                  disabled={isSavingSettings}
                  onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="model-api-key">{t("model.replaceApiKey")}</label>
                <input
                  id="model-api-key"
                  type="password"
                  value={form.apiKey}
                  autoComplete="off"
                  disabled={isSavingSettings || form.clearApiKey}
                  onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
                />
              </div>
              <label className="checkbox-row settings-checkbox" htmlFor="clear-model-key">
                <input
                  id="clear-model-key"
                  type="checkbox"
                  checked={form.clearApiKey}
                  disabled={isSavingSettings}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    clearApiKey: event.target.checked,
                    apiKey: event.target.checked ? "" : current.apiKey
                  }))}
                />
                {t("model.clearApiKey")}
              </label>
              <label className="checkbox-row settings-checkbox" htmlFor="json-mode">
                <input
                  id="json-mode"
                  type="checkbox"
                  checked={form.jsonMode}
                  disabled={isSavingSettings}
                  onChange={(event) => setForm((current) => ({ ...current, jsonMode: event.target.checked }))}
                />
                {t("model.jsonMode")}
              </label>
              <div className="form-group">
                <label htmlFor="model-timeout">{t("model.timeout")}</label>
                <input
                  id="model-timeout"
                  type="number"
                  min="1"
                  value={form.timeoutMs}
                  disabled={isSavingSettings}
                  onChange={(event) => setForm((current) => ({ ...current, timeoutMs: event.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="model-max-tokens">{t("model.maxTokens")}</label>
                <input
                  id="model-max-tokens"
                  type="number"
                  min="1"
                  value={form.maxTokens}
                  disabled={isSavingSettings}
                  onChange={(event) => setForm((current) => ({ ...current, maxTokens: event.target.value }))}
                />
              </div>
            </div>

            <div className="settings-subsection">
              <span className="detail-label">{t("model.transcriptionSettings")}</span>
              <div className="settings-grid">
                <div className="form-group">
                  <label htmlFor="transcribe-base-url">{t("model.transcriptionBaseUrl")}</label>
                  <input
                    id="transcribe-base-url"
                    value={form.transcriptionBaseUrl}
                    placeholder="http://127.0.0.1:9000/v1"
                    disabled={isSavingSettings}
                    onChange={(event) => setForm((current) => ({ ...current, transcriptionBaseUrl: event.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="transcribe-model">{t("model.transcriptionModel")}</label>
                  <input
                    id="transcribe-model"
                    value={form.transcriptionModel}
                    disabled={isSavingSettings}
                    onChange={(event) => setForm((current) => ({ ...current, transcriptionModel: event.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="transcribe-api-key">{t("model.replaceTranscriptionApiKey")}</label>
                  <input
                    id="transcribe-api-key"
                    type="password"
                    value={form.transcriptionApiKey}
                    autoComplete="off"
                    disabled={isSavingSettings || form.clearTranscriptionApiKey}
                    onChange={(event) => setForm((current) => ({ ...current, transcriptionApiKey: event.target.value }))}
                  />
                </div>
                <label className="checkbox-row settings-checkbox" htmlFor="clear-transcribe-key">
                  <input
                    id="clear-transcribe-key"
                    type="checkbox"
                    checked={form.clearTranscriptionApiKey}
                    disabled={isSavingSettings}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      clearTranscriptionApiKey: event.target.checked,
                      transcriptionApiKey: event.target.checked ? "" : current.transcriptionApiKey
                    }))}
                  />
                  {t("model.clearTranscriptionApiKey")}
                </label>
              </div>
            </div>

            <div className="settings-subsection">
              <span className="detail-label">{t("model.ingestionSettings")}</span>
              <div className="settings-grid">
                <div className="form-group">
                  <label htmlFor="ocr-lang">{t("model.ocrLanguage")}</label>
                  <input
                    id="ocr-lang"
                    value={form.ocrLang}
                    disabled={isSavingSettings}
                    onChange={(event) => setForm((current) => ({ ...current, ocrLang: event.target.value }))}
                  />
                </div>
                <label className="checkbox-row settings-checkbox" htmlFor="allow-private-urls">
                  <input
                    id="allow-private-urls"
                    type="checkbox"
                    checked={form.allowPrivateUrls}
                    disabled={isSavingSettings}
                    onChange={(event) => setForm((current) => ({ ...current, allowPrivateUrls: event.target.checked }))}
                  />
                  {t("model.allowPrivateUrls")}
                </label>
              </div>
            </div>

            <div className="settings-actions">
              <button type="submit" disabled={isSavingSettings}>
                {isSavingSettings ? t("model.savingSettings") : t("model.saveSettings")}
              </button>
              {formError && <p className="inline-error" role="alert">{formError}</p>}
              {settingsSaveError && <p className="inline-error" role="alert">{settingsSaveError}</p>}
              {settingsSaveResult && <p className="result-notice" role="status" aria-live="polite">{settingsSaveResult}</p>}
            </div>
          </form>
        )}
      </section>

      <section className="panel-card model-observability" aria-label={t("model.observabilityAria")}>
        <div className="record-topline">
          <div>
            <span className="detail-label">{t("model.sessionObservability")}</span>
            <h2>{observability ? t("model.sessionsCount", { count: observability.totals.sessions }) : t("model.loadingSessions")}</h2>
          </div>
          {observability && (
            <span className={`status-badge ${countFailedSessions(observability) > 0 ? "contested" : "approved"}`}>
              {t("model.failedCount", { count: countFailedSessions(observability) })}
            </span>
          )}
        </div>
        {observabilityState.status === "loading" && (
          <p className="inline-empty" role="status" aria-live="polite">{t("model.loadingObservability")}</p>
        )}
        {observabilityState.status === "error" && (
          <p className="inline-error" role="alert">{observabilityState.message}</p>
        )}
        {observability && (
          <>
            <dl className="detail-grid">
              <div>
                <dt>{t("model.active")}</dt>
                <dd>{observability.totals.activeSessions}</dd>
              </div>
              <div>
                <dt>{t("model.failed")}</dt>
                <dd>{countFailedSessions(observability)}</dd>
              </div>
              <div>
                <dt>{t("model.messages")}</dt>
                <dd>{observability.totals.messages}</dd>
              </div>
              <div>
                <dt>{t("model.elderCorrections")}</dt>
                <dd>{observability.totals.elderCorrections}</dd>
              </div>
            </dl>
            {recentSessions.length === 0 ? (
              <p className="inline-empty">{t("model.noSessions")}</p>
            ) : (
              <div className="detail-list session-list">
                {recentSessions.map((session) => (
                  <div key={session.id} className="detail-row session-row">
                    <StatusBadge status={session.status} />
                    <strong>{formatStatus(session.mode)}</strong>
                    <span>{session.languageId}</span>
                    <span>{formatCount(session.messageCount, "message")}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="panel-card setup-card" aria-label={t("model.localSetupAria")}>
        <span className="detail-label">{t("model.localEndpoints")}</span>
        <h2>{t("model.localProviders")}</h2>
        <p>{t("model.localSetupIntroBefore")}<code>/v1/chat/completions</code>{t("model.localSetupIntroAfter")}</p>
        <div className="command-list">
          {status.setup.localExamples.map((example) => (
            <code key={example}>{example}</code>
          ))}
        </div>
      </section>

      <section className="panel-card setup-card" aria-label={t("model.remoteSetupAria")}>
        <span className="detail-label">{t("model.remoteIntegration")}</span>
        <h2>{t("model.serverSideKeysOnly")}</h2>
        <p>{t("model.remoteSetupIntro")}</p>
        <div className="command-list">
          {status.setup.remoteExamples.map((example) => (
            <code key={example}>{example}</code>
          ))}
        </div>
      </section>
    </div>
  );
}
