import { useEffect, useState, type FormEvent } from "react";
import type {
  DiscoveredLlmModel,
  ModelProfileSavePayload,
  RuntimeSettingsUpdate
} from "../api";
import type { ModelWorkspace } from "../hooks/useModelWorkspace";
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
  validateSettingsForm,
  type SettingsFormState
} from "../lib/modelSettings";
import { DesktopToolsPanel } from "./DesktopToolsPanel";
import { ModelDiscoveryPanel } from "./ModelDiscoveryPanel";
import { ModelObservabilityPanel } from "./ModelObservabilityPanel";
import { ModelSettingsFormFields } from "./ModelSettingsFormFields";
import { ProviderReadinessPanel } from "./ProviderReadinessPanel";
import { StatusScreen } from "../components/StatusScreen";

export function ModelSetupView({ model }: { model: ModelWorkspace }) {
  const {
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
    handleModelSmokeTest: onSmokeTest,
    handleTestConnection: onTestConnection,
    refreshModelDiscovery: onRefreshModelDiscovery,
    handleSaveSettings: onSaveSettings,
    handleSaveModelProfile: onSaveModelProfile,
    handleActivateModelProfile: onActivateModelProfile,
    handleDeleteModelProfile: onDeleteModelProfile,
    reloadModelWorkspace: onReloadModelWorkspace,
    refreshModelObservability: onRefreshModelObservability
  } = model;
  const { t } = useI18n();
  const [form, setForm] = useState<SettingsFormState>(DEFAULT_FORM);
  const [profileName, setProfileName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (settingsState.status === "ready") {
      setForm(formFromSettings(settingsState.data));
      const activeProfile = settingsState.data.profiles?.find((profile) => profile.id === settingsState.data.activeProfileId);
      setProfileName(activeProfile?.name ?? settingsState.data.settings.model ?? "");
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
    return <StatusScreen kind="loading" message={t("model.checkingConfiguration")} />;
  }

  if (llmState.status === "error") {
    return (
      <StatusScreen
        kind="error"
        message={llmState.message}
        onRetry={onReloadModelWorkspace}
        retryLabel={t("app.retryLoad")}
      />
    );
  }

  if (settingsState.status === "error") {
    return (
      <StatusScreen
        kind="error"
        message={settingsState.message}
        onRetry={onReloadModelWorkspace}
        retryLabel={t("app.retryLoad")}
      />
    );
  }

  const status = llmState.data;
  const settings = settingsState.status === "ready" ? settingsState.data.settings : null;
  const modelProfiles = settingsState.status === "ready" ? settingsState.data.profiles ?? [] : [];
  const activeProfileId = settingsState.status === "ready" ? settingsState.data.activeProfileId ?? "" : "";
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
    const validation = validateSettingsForm(nextForm);
    if (!validation.ok) {
      setFormError(t(validation.errorKey));
      return null;
    }

    const timeoutMs = positiveInteger(nextForm.timeoutMs);
    const maxTokens = positiveInteger(nextForm.maxTokens);
    if (!timeoutMs || !maxTokens) {
      setFormError(t("model.settingsNumericError"));
      return null;
    }

    setFormError(null);
    return {
      provider: nextForm.provider as RuntimeSettingsUpdate["provider"],
      baseUrl: nextForm.baseUrl.trim(),
      model: nextForm.model.trim(),
      apiKey: nextForm.apiKey || undefined,
      clearApiKey: nextForm.clearApiKey || undefined,
      timeoutMs,
      maxTokens,
      jsonMode: nextForm.jsonMode,
      transcriptionBaseUrl: nextForm.transcriptionBaseUrl.trim(),
      transcriptionModel: nextForm.transcriptionModel.trim(),
      transcriptionApiKey: nextForm.transcriptionApiKey || undefined,
      clearTranscriptionApiKey: nextForm.clearTranscriptionApiKey || undefined,
      ocrBaseUrl: nextForm.ocrBaseUrl.trim(),
      ocrModel: nextForm.ocrModel.trim(),
      ocrApiKey: nextForm.ocrApiKey || undefined,
      clearOcrApiKey: nextForm.clearOcrApiKey || undefined,
      ocrLang: nextForm.ocrLang.trim(),
      allowPrivateUrls: nextForm.allowPrivateUrls
    };
  }

  function buildProfilePayload(nextForm: SettingsFormState, activate: boolean): ModelProfileSavePayload | null {
    const runtimePayload = buildSettingsPayload(nextForm);
    const name = profileName.trim();
    if (!runtimePayload) return null;
    if (!name) {
      setFormError(t("model.profileNameRequired"));
      return null;
    }
    const activeProfile = modelProfiles.find((profile) => profile.id === activeProfileId);
    const saveProfileId = activeProfile?.name.trim().toLowerCase() === name.toLowerCase()
      ? activeProfileId
      : undefined;

    return {
      ...runtimePayload,
      provider: nextForm.provider as ModelProfileSavePayload["provider"],
      id: saveProfileId || undefined,
      name,
      activate
    };
  }

  function clearSecretFields() {
    setForm((current) => ({
      ...current,
      apiKey: "",
      clearApiKey: false,
      transcriptionApiKey: "",
      clearTranscriptionApiKey: false,
      ocrApiKey: "",
      clearOcrApiKey: false
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

  async function handleSaveProfile(activate: boolean) {
    const payload = buildProfilePayload(form, activate);
    if (!payload) return;

    try {
      await onSaveModelProfile(payload);
      clearSecretFields();
    } catch {
      return;
    }
  }

  async function handleActivateProfile(profileId: string) {
    if (!profileId) return;
    try {
      await onActivateModelProfile(profileId);
    } catch {
      return;
    }
  }

  async function handleDeleteProfile() {
    if (!activeProfileId) return;
    try {
      await onDeleteModelProfile(activeProfileId);
    } catch {
      return;
    }
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
            <div className="settings-subsection model-profile-manager" aria-label={t("model.profileManagerAria")}>
              <span className="detail-label">{t("model.modelProfiles")}</span>
              <div className="settings-grid">
                <div className="form-group">
                  <label htmlFor="model-profile-select">{t("model.savedProfiles")}</label>
                  <select
                    id="model-profile-select"
                    value={activeProfileId}
                    disabled={isSavingSettings || modelProfiles.length === 0}
                    onChange={(event) => void handleActivateProfile(event.target.value)}
                  >
                    <option value="">{modelProfiles.length > 0 ? t("model.chooseProfile") : t("model.noProfiles")}</option>
                    {modelProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} ({profile.model || profile.provider})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="model-profile-name">{t("model.profileName")}</label>
                  <input
                    id="model-profile-name"
                    value={profileName}
                    disabled={isSavingSettings}
                    onChange={(event) => setProfileName(event.target.value)}
                    placeholder={t("model.profileNamePlaceholder")}
                  />
                </div>
              </div>
              <div className="settings-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={isSavingSettings}
                  onClick={() => void handleSaveProfile(false)}
                >
                  {t("model.saveProfile")}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={isSavingSettings}
                  onClick={() => void handleSaveProfile(true)}
                >
                  {t("model.saveAndUseProfile")}
                </button>
                <button
                  type="button"
                  className="contest"
                  disabled={isSavingSettings || !activeProfileId}
                  onClick={() => void handleDeleteProfile()}
                >
                  {t("model.deleteProfile")}
                </button>
              </div>
            </div>
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
              <button type="submit" disabled={isSavingSettings} aria-busy={isSavingSettings}>
                {isSavingSettings ? t("model.savingSettings") : t("model.saveSettings")}
              </button>
              {formError && <p className="inline-error" role="alert">{formError}</p>}
              {settingsSaveError && <p className="inline-error" role="alert">{settingsSaveError}</p>}
              {settingsSaveResult && <p className="result-notice" role="status" aria-live="polite">{settingsSaveResult}</p>}
            </div>
          </form>
        )}
      </section>

      <ModelObservabilityPanel
        observabilityState={observabilityState}
        onRetry={onRefreshModelObservability}
      />

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
