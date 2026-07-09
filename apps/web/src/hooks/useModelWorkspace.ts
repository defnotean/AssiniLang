import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DashboardData,
  LlmModelDiscoveryResponse,
  LlmReachability,
  LlmStatus,
  ModelProfileSavePayload,
  ObservabilityData,
  RuntimeSettingsResponse,
  RuntimeSettingsUpdate
} from "../api";
import {
  activateModelProfile,
  checkLlmReachability,
  createAiSession,
  deleteModelProfile,
  fetchDiscoveredModels,
  fetchLlmStatus,
  fetchObservability,
  fetchRuntimeSettings,
  saveModelProfile,
  updateRuntimeSettings
} from "../api";
import {
  isRealModelProvider,
  latestAssistantMessage,
  localizeApiError,
  sessionUsedDeterministicFallback
} from "../lib/format";
import type { AsyncState, ViewMode } from "../lib/types";
import { useI18n } from "../i18n";

const MODEL_DISCOVERY_REFRESH_INTERVAL_MS = 30_000;

function settingsNeedInitialModel(settings: RuntimeSettingsResponse["settings"]): boolean {
  return !settings.baseUrl.trim()
    && !settings.model.trim()
    && !settings.apiKeyConfigured;
}

function payloadForDiscoveredModel(
  settings: RuntimeSettingsResponse["settings"],
  candidate: LlmModelDiscoveryResponse["models"][number]
): RuntimeSettingsUpdate {
  return {
    provider: candidate.provider,
    baseUrl: candidate.baseUrl,
    model: candidate.model,
    timeoutMs: settings.timeoutMs,
    maxTokens: settings.maxTokens,
    jsonMode: settings.jsonMode,
    transcriptionBaseUrl: settings.transcriptionBaseUrl,
    transcriptionModel: settings.transcriptionModel,
    ocrBaseUrl: settings.ocrBaseUrl,
    ocrModel: settings.ocrModel,
    ocrLang: settings.ocrLang,
    allowPrivateUrls: settings.allowPrivateUrls
  };
}

export interface ModelWorkspace {
  llmState: AsyncState<LlmStatus>;
  settingsState: AsyncState<RuntimeSettingsResponse>;
  modelDiscoveryState: AsyncState<LlmModelDiscoveryResponse>;
  observabilityState: AsyncState<ObservabilityData>;
  isTestingModel: boolean;
  modelTestResult: string | null;
  modelTestIsPlaceholder: boolean;
  isCheckingReachability: boolean;
  reachabilityResult: LlmReachability | null;
  reachabilityError: string | null;
  isSavingSettings: boolean;
  settingsSaveResult: string | null;
  settingsSaveError: string | null;
  isRefreshingModels: boolean;
  isAutoRefreshingModels: boolean;
  refreshModelObservability: () => Promise<void>;
  refreshModelDiscovery: (baseUrl?: string) => Promise<void>;
  handleSaveSettings: (payload: RuntimeSettingsUpdate) => Promise<void>;
  handleSaveModelProfile: (payload: ModelProfileSavePayload) => Promise<void>;
  handleActivateModelProfile: (profileId: string) => Promise<void>;
  handleDeleteModelProfile: (profileId: string) => Promise<void>;
  handleModelSmokeTest: () => Promise<void>;
  handleTestConnection: () => Promise<void>;
  reloadModelWorkspace: () => void;
}

/**
 * Owns the model setup workspace state: LLM status, observability, the smoke
 * test, and the reachability check, plus the model-view loading effect.
 */
export function useModelWorkspace(
  view: ViewMode,
  selectedLanguageId: string | null,
  data: DashboardData | null
): ModelWorkspace {
  const { t } = useI18n();
  const [llmState, setLlmState] = useState<AsyncState<LlmStatus>>({ status: "idle" });
  const [settingsState, setSettingsState] = useState<AsyncState<RuntimeSettingsResponse>>({ status: "idle" });
  const [modelDiscoveryState, setModelDiscoveryState] = useState<AsyncState<LlmModelDiscoveryResponse>>({ status: "idle" });
  const [observabilityState, setObservabilityState] = useState<AsyncState<ObservabilityData>>({ status: "idle" });
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [modelTestResult, setModelTestResult] = useState<string | null>(null);
  const [modelTestIsPlaceholder, setModelTestIsPlaceholder] = useState(false);
  const [isCheckingReachability, setIsCheckingReachability] = useState(false);
  const [reachabilityResult, setReachabilityResult] = useState<LlmReachability | null>(null);
  const [reachabilityError, setReachabilityError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaveResult, setSettingsSaveResult] = useState<string | null>(null);
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [isAutoRefreshingModels, setIsAutoRefreshingModels] = useState(false);
  const discoveryRequestIdRef = useRef(0);
  const activeDiscoveryRequestIdRef = useRef<number | null>(null);
  const reachabilityRequestIdRef = useRef(0);
  const configuredDiscoveryBaseUrlRef = useRef<string | undefined>(undefined);
  const manualDiscoveryInFlightRef = useRef(false);
  const autoAppliedDiscoveryModelIdRef = useRef<string | null>(null);

  const startModelDiscovery = useCallback(async (
    baseUrl?: string,
    options: { showLoading?: boolean; includeCommonTargets?: boolean; automatic?: boolean; force?: boolean } = {}
  ) => {
    if (activeDiscoveryRequestIdRef.current !== null && !options.force) {
      return;
    }

    const requestId = ++discoveryRequestIdRef.current;
    activeDiscoveryRequestIdRef.current = requestId;
    if (options.showLoading) {
      setModelDiscoveryState({ status: "loading" });
    } else if (options.automatic) {
      setIsAutoRefreshingModels(true);
    }

    try {
      const discovery = await fetchDiscoveredModels(baseUrl, {
        includeCommonTargets: options.includeCommonTargets
      });
      if (discoveryRequestIdRef.current === requestId) {
        setModelDiscoveryState({ status: "ready", data: discovery });
      }
    } catch (error) {
      if (discoveryRequestIdRef.current === requestId && options.showLoading) {
        const message = localizeApiError(error, t, "model.errModelDiscoveryFailed");
        setModelDiscoveryState({ status: "error", message });
      } else if (discoveryRequestIdRef.current === requestId) {
        const message = localizeApiError(error, t, "model.errModelDiscoveryFailed");
        setModelDiscoveryState({
          status: "ready",
          data: {
            scannedAt: new Date().toISOString(),
            models: [],
            endpoints: [],
            errors: [{
              source: t("model.automaticRefresh"),
              baseUrl: baseUrl ?? t("model.configuredDiscoveryTargets"),
              detail: message
            }]
          }
        });
      }
    } finally {
      if (activeDiscoveryRequestIdRef.current === requestId) {
        activeDiscoveryRequestIdRef.current = null;
      }
      if (options.automatic) {
        setIsAutoRefreshingModels(false);
      }
    }
  }, [t]);

  const runReachabilityCheck = useCallback(async () => {
    const requestId = ++reachabilityRequestIdRef.current;
    setIsCheckingReachability(true);
    setReachabilityError(null);
    setReachabilityResult(null);
    try {
      const result = await checkLlmReachability();
      if (reachabilityRequestIdRef.current === requestId) {
        setReachabilityResult(result);
      }
    } catch (error) {
      if (reachabilityRequestIdRef.current === requestId) {
        setReachabilityError(localizeApiError(error, t, "model.errReachabilityFailed"));
      }
    } finally {
      if (reachabilityRequestIdRef.current === requestId) {
        setIsCheckingReachability(false);
      }
    }
  }, [t]);

  const reloadModelWorkspace = useCallback(() => {
    setLlmState({ status: "loading" });
    setSettingsState({ status: "loading" });
    setModelDiscoveryState({ status: "loading" });
    setObservabilityState({ status: "loading" });
    setModelTestResult(null);
    setSettingsSaveResult(null);
    setSettingsSaveError(null);
    fetchRuntimeSettings()
      .then((settings) => {
        configuredDiscoveryBaseUrlRef.current = settings.settings.baseUrl.trim() || undefined;
        setSettingsState({ status: "ready", data: settings });
        setLlmState({ status: "ready", data: settings.status });
      })
      .catch((error: unknown) => {
        const message = localizeApiError(error, t, "model.errSettingsLoadFailed");
        setSettingsState({ status: "error", message });
        setLlmState({ status: "error", message });
      });
    void startModelDiscovery(undefined, { showLoading: true, includeCommonTargets: true, force: true });
    fetchObservability()
      .then((observability) => {
        setObservabilityState({ status: "ready", data: observability });
      })
      .catch((error: unknown) => {
        setObservabilityState({
          status: "error",
          message: localizeApiError(error, t, "model.errObservabilityFailed")
        });
      });
  }, [startModelDiscovery, t]);

  useEffect(() => {
    let isCurrent = true;
    if (view !== "model") return () => {
      isCurrent = false;
    };

    setLlmState({ status: "loading" });
    setSettingsState({ status: "loading" });
    setModelDiscoveryState({ status: "loading" });
    setObservabilityState({ status: "loading" });
    setModelTestResult(null);
    setSettingsSaveResult(null);
    setSettingsSaveError(null);
    fetchRuntimeSettings()
      .then((settings) => {
        if (isCurrent) {
          configuredDiscoveryBaseUrlRef.current = settings.settings.baseUrl.trim() || undefined;
          setSettingsState({ status: "ready", data: settings });
          setLlmState({ status: "ready", data: settings.status });
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          const message = localizeApiError(error, t, "model.errSettingsLoadFailed");
          setSettingsState({ status: "error", message });
          // Keep llmState in sync: ModelSetupView gates on llmState, so a settings
          // failure must not leave the view stuck on the loading screen forever.
          setLlmState({ status: "error", message });
        }
      });
    void startModelDiscovery(undefined, { showLoading: true, includeCommonTargets: true });
    fetchObservability()
      .then((observability) => {
        if (isCurrent) setObservabilityState({ status: "ready", data: observability });
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setObservabilityState({
            status: "error",
            message: localizeApiError(error, t, "model.errObservabilityFailed")
          });
        }
      });

    return () => {
      isCurrent = false;
      discoveryRequestIdRef.current += 1;
    };
  }, [startModelDiscovery, view]);

  useEffect(() => {
    if (view !== "model" || llmState.status !== "ready" || !isRealModelProvider(llmState.data)) {
      return undefined;
    }

    void runReachabilityCheck();
    return () => {
      reachabilityRequestIdRef.current += 1;
    };
  }, [llmState, runReachabilityCheck, view]);

  useEffect(() => {
    if (view !== "model") return undefined;

    const refreshIfVisibleAndIdle = () => {
      if (document.visibilityState === "visible" && !manualDiscoveryInFlightRef.current) {
        void startModelDiscovery(configuredDiscoveryBaseUrlRef.current, {
          automatic: true,
          includeCommonTargets: true
        });
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshIfVisibleAndIdle();
      }
    };

    const interval = window.setInterval(refreshIfVisibleAndIdle, MODEL_DISCOVERY_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshIfVisibleAndIdle);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisibleAndIdle);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [startModelDiscovery, view]);

  async function refreshModelObservability() {
    setObservabilityState({ status: "loading" });
    try {
      setObservabilityState({ status: "ready", data: await fetchObservability() });
    } catch (error) {
      setObservabilityState({
        status: "error",
        message: localizeApiError(error, t, "model.errObservabilityFailed")
      });
    }
  }

  async function refreshModelDiscovery(baseUrl?: string) {
    manualDiscoveryInFlightRef.current = true;
    setIsRefreshingModels(true);
    try {
      await startModelDiscovery(baseUrl, { showLoading: true, includeCommonTargets: true, force: true });
    } finally {
      manualDiscoveryInFlightRef.current = false;
      setIsRefreshingModels(false);
    }
  }

  async function handleSaveSettings(payload: RuntimeSettingsUpdate) {
    setIsSavingSettings(true);
    setSettingsSaveResult(null);
    setSettingsSaveError(null);
    setReachabilityError(null);
    setReachabilityResult(null);
    setModelTestResult(null);
    setModelTestIsPlaceholder(false);
    try {
      const nextSettings = await updateRuntimeSettings(payload);
      configuredDiscoveryBaseUrlRef.current = nextSettings.settings.baseUrl.trim() || undefined;
      setSettingsState({ status: "ready", data: nextSettings });
      setLlmState({ status: "ready", data: nextSettings.status });
      setSettingsSaveResult(t("model.settingsSaved"));
      void startModelDiscovery(configuredDiscoveryBaseUrlRef.current, {
        automatic: true,
        includeCommonTargets: true,
        force: true
      });
    } catch (error) {
      setSettingsSaveError(localizeApiError(error, t, "model.errSettingsSaveFailed"));
      throw error;
    } finally {
      setIsSavingSettings(false);
    }
  }

  function applyRuntimeSettingsResponse(nextSettings: RuntimeSettingsResponse) {
    configuredDiscoveryBaseUrlRef.current = nextSettings.settings.baseUrl.trim() || undefined;
    setSettingsState({ status: "ready", data: nextSettings });
    setLlmState({ status: "ready", data: nextSettings.status });
  }

  function refreshDiscoveryForSettings(nextSettings: RuntimeSettingsResponse) {
    void startModelDiscovery(nextSettings.settings.baseUrl.trim() || undefined, {
      automatic: true,
      includeCommonTargets: true,
      force: true
    });
  }

  async function handleSaveModelProfile(payload: ModelProfileSavePayload) {
    setIsSavingSettings(true);
    setSettingsSaveResult(null);
    setSettingsSaveError(null);
    setReachabilityError(null);
    setReachabilityResult(null);
    setModelTestResult(null);
    setModelTestIsPlaceholder(false);
    try {
      const nextSettings = await saveModelProfile(payload);
      applyRuntimeSettingsResponse(nextSettings);
      setSettingsSaveResult(t(payload.activate ? "model.profileSavedAndApplied" : "model.profileSaved"));
      refreshDiscoveryForSettings(nextSettings);
    } catch (error) {
      setSettingsSaveError(localizeApiError(error, t, "model.errProfileSaveFailed"));
      throw error;
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleActivateModelProfile(profileId: string) {
    setIsSavingSettings(true);
    setSettingsSaveResult(null);
    setSettingsSaveError(null);
    setReachabilityError(null);
    setReachabilityResult(null);
    setModelTestResult(null);
    setModelTestIsPlaceholder(false);
    try {
      const nextSettings = await activateModelProfile(profileId);
      applyRuntimeSettingsResponse(nextSettings);
      setSettingsSaveResult(t("model.profileApplied"));
      refreshDiscoveryForSettings(nextSettings);
    } catch (error) {
      setSettingsSaveError(localizeApiError(error, t, "model.errProfileApplyFailed"));
      throw error;
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleDeleteModelProfile(profileId: string) {
    setIsSavingSettings(true);
    setSettingsSaveResult(null);
    setSettingsSaveError(null);
    try {
      const nextSettings = await deleteModelProfile(profileId);
      applyRuntimeSettingsResponse(nextSettings);
      setSettingsSaveResult(t("model.profileDeleted"));
    } catch (error) {
      setSettingsSaveError(localizeApiError(error, t, "model.errProfileDeleteFailed"));
      throw error;
    } finally {
      setIsSavingSettings(false);
    }
  }

  useEffect(() => {
    if (view !== "model") return;
    if (settingsState.status !== "ready" || modelDiscoveryState.status !== "ready") return;

    const noKeyModels = modelDiscoveryState.data.models.filter((candidate) => !candidate.requiresApiKey);
    if (noKeyModels.length !== 1) {
      if (noKeyModels.length === 0) {
        autoAppliedDiscoveryModelIdRef.current = null;
      }
      return;
    }

    const [candidate] = noKeyModels;
    if (!settingsNeedInitialModel(settingsState.data.settings)) return;
    if (autoAppliedDiscoveryModelIdRef.current === candidate.id) return;

    autoAppliedDiscoveryModelIdRef.current = candidate.id;
    void handleSaveSettings(payloadForDiscoveredModel(settingsState.data.settings, candidate)).catch((error) => {
      setSettingsSaveError(localizeApiError(error, t, "model.errSettingsSaveFailed"));
    });
  }, [modelDiscoveryState, settingsState, view, t]);

  async function handleModelSmokeTest() {
    if (!data) return;
    if (!selectedLanguageId) {
      setModelTestResult(t("errors.selectOrCreateLanguage"));
      return;
    }
    setIsTestingModel(true);
    setModelTestResult(null);
    setModelTestIsPlaceholder(false);
    try {
      const session = await createAiSession({
        languageId: selectedLanguageId,
        mode: "learner_practice",
        seedPrompt: t("model.smokeTest.seedPrompt"),
        contextNoteIds: data.notes.slice(0, 2).map((note) => note.id),
        contextPassageIds: data.corpus.slice(0, 2).map((passage) => passage.id)
      });
      setModelTestResult(latestAssistantMessage(session, t));
      const refreshedStatus = await fetchLlmStatus();
      setLlmState({ status: "ready", data: refreshedStatus });
      setModelTestIsPlaceholder(!isRealModelProvider(refreshedStatus) || sessionUsedDeterministicFallback(session));
      await refreshModelObservability();
    } catch (error) {
      setModelTestResult(localizeApiError(error, t, "model.errSmokeTestFailed"));
      setModelTestIsPlaceholder(false);
      await refreshModelObservability();
    } finally {
      setIsTestingModel(false);
    }
  }

  async function handleTestConnection() {
    await runReachabilityCheck();
  }

  return {
    llmState,
    settingsState,
    modelDiscoveryState,
    observabilityState,
    isTestingModel,
    modelTestResult,
    modelTestIsPlaceholder,
    isCheckingReachability,
    reachabilityResult,
    reachabilityError,
    isSavingSettings,
    settingsSaveResult,
    settingsSaveError,
    isRefreshingModels,
    isAutoRefreshingModels,
    refreshModelObservability,
    refreshModelDiscovery,
    handleSaveSettings,
    handleSaveModelProfile,
    handleActivateModelProfile,
    handleDeleteModelProfile,
    handleModelSmokeTest,
    handleTestConnection,
    reloadModelWorkspace
  };
}
