import { useEffect, useState, type FormEvent } from "react";
import type {
  DiscoveredLlmModel,
  LlmModelDiscoveryResponse,
  LlmReachability,
  LlmStatus,
  ObservabilityData,
  RuntimeSettingsResponse,
  RuntimeSettingsUpdate
} from "../api";
import { useI18n } from "../i18n";
import {
  applyDiscoveredModelToForm,
  DEFAULT_FORM,
  discoveredModelMatchesForm,
  findStaleActiveModel,
  formFromSettings,
  formStateFromControls,
  formatScanTime,
  positiveInteger,
  syncFormWithDiscoveredModels,
  type SettingsFormState
} from "../lib/modelSettings";
import type { AsyncState } from "../lib/types";
import { DesktopToolsPanel } from "./DesktopToolsPanel";
import { ModelDiscoveryPanel } from "./ModelDiscoveryPanel";
import { ModelObservabilityPanel } from "./ModelObservabilityPanel";
import { ModelSettingsFormFields } from "./ModelSettingsFormFields";
import { ProviderReadinessPanel } from "./ProviderReadinessPanel";

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

  useEffect(() => {
    if (settingsState.status === "ready") {
      setForm(formFromSettings(settingsState.data));
      setFormError(null);
    }
  }, [settingsState]);

  useEffect(() => {
    if (settingsState.status !== "ready" || modelDiscoveryState.status !== "ready") return;
    setForm((current) => syncFormWithDiscoveredModels(
      current,
      modelDiscoveryState.data,
      settingsState.data.settings
    ));
  }, [modelDiscoveryState, settingsState]);

  const discoveredModels = modelDiscoveryState.status === "ready" ? modelDiscoveryState.data.models : [];

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextForm = formStateFromControls(event.currentTarget, form);
    setForm(nextForm);
    const payload = buildSettingsPayload(nextForm);
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
      <ProviderReadinessPanel
        isCheckingReachability={isCheckingReachability}
        isSavingSettings={isSavingSettings}
        isTestingModel={isTestingModel}
        modelTestIsPlaceholder={modelTestIsPlaceholder}
        modelTestResult={modelTestResult}
        onSmokeTest={onSmokeTest}
        onTestConnection={onTestConnection}
        reachabilityError={reachabilityError}
        reachabilityResult={reachabilityResult}
        status={status}
      />

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
        <DesktopToolsPanel
          connectedEndpointCount={connectedEndpoints.length}
          discoveryEndpoints={discoveryEndpoints}
          discoveryErrorCount={discoveryErrors.length}
          discoveredModels={discoveredModels}
          failedEndpointCount={failedEndpoints.length}
          lastModelScan={lastModelScan}
          modelDiscoveryState={modelDiscoveryState}
          observabilityState={observabilityState}
          settings={settings}
          status={status}
        />
        {settingsState.status === "ready" && (
          <form className="settings-form" onSubmit={handleSubmit}>
            <ModelSettingsFormFields
              form={form}
              isSavingSettings={isSavingSettings}
              setForm={setForm}
            >
              <ModelDiscoveryPanel
                connectedEndpoints={connectedEndpoints}
                discoveryErrors={discoveryErrors}
                discoveredModels={discoveredModels}
                failedEndpoints={failedEndpoints}
                formBaseUrl={form.baseUrl}
                isAutoRefreshingModels={isAutoRefreshingModels}
                isSavingSettings={isSavingSettings}
                isScanningModels={isScanningModels}
                lastModelScan={lastModelScan}
                modelDiscoveryState={modelDiscoveryState}
                onApplyLoadedModel={handleApplyLoadedModel}
                onClearSavedModel={handleClearSavedModel}
                onDiscoveredModelChange={handleDiscoveredModelChange}
                onRefreshModelDiscovery={onRefreshModelDiscovery}
                selectedDiscoveredModelId={selectedDiscoveredModelId}
                staleActiveModel={staleActiveModel}
              />
            </ModelSettingsFormFields>

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

      <ModelObservabilityPanel observabilityState={observabilityState} />

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
