import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useI18n, type MessageKey } from "../i18n";
import { LLM_PROVIDER_OPTIONS } from "../lib/llmProviders";
import type { SettingsFormState } from "../lib/modelSettings";

type ModelSettingsFormFieldsProps = {
  children: ReactNode;
  form: SettingsFormState;
  isSavingSettings: boolean;
  setForm: Dispatch<SetStateAction<SettingsFormState>>;
};

export function ModelSettingsFormFields({
  children,
  form,
  isSavingSettings,
  setForm
}: ModelSettingsFormFieldsProps) {
  const { t } = useI18n();

  return (
    <>
      <div className="settings-grid">
        {children}
        <div className="form-group">
          <label htmlFor="model-provider">{t("model.provider")}</label>
          <select
            id="model-provider"
            value={form.provider}
            disabled={isSavingSettings}
            onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
          >
            {LLM_PROVIDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(`model.providerOption.${option.value}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="model-base-url">{t("model.baseUrl")}</label>
          <input
            id="model-base-url"
            value={form.baseUrl}
            placeholder={t("model.baseUrlPlaceholder")}
            disabled={isSavingSettings}
            onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
          />
        </div>
        <div className="form-group">
          <label htmlFor="model-name">{t("model.model")}</label>
          <input
            id="model-name"
            value={form.model}
            placeholder={t("model.modelNamePlaceholder")}
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
              placeholder={t("model.transcriptionBaseUrlPlaceholder")}
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
        <span className="detail-label">{t("model.ocrSettings")}</span>
        <div className="settings-grid">
          <div className="form-group">
            <label htmlFor="ocr-base-url">{t("model.ocrBaseUrl")}</label>
            <input
              id="ocr-base-url"
              value={form.ocrBaseUrl}
              placeholder={t("model.ocrBaseUrlPlaceholder")}
              disabled={isSavingSettings}
              onChange={(event) => setForm((current) => ({ ...current, ocrBaseUrl: event.target.value }))}
            />
            <small className="muted">{t("model.ocrBaseUrlHelp")}</small>
          </div>
          <div className="form-group">
            <label htmlFor="ocr-model">{t("model.ocrModel")}</label>
            <input
              id="ocr-model"
              value={form.ocrModel}
              disabled={isSavingSettings}
              onChange={(event) => setForm((current) => ({ ...current, ocrModel: event.target.value }))}
            />
            <small className="muted">{t("model.ocrModelHelp")}</small>
          </div>
          <div className="form-group">
            <label htmlFor="ocr-api-key">{t("model.replaceOcrApiKey")}</label>
            <input
              id="ocr-api-key"
              type="password"
              value={form.ocrApiKey}
              autoComplete="off"
              disabled={isSavingSettings || form.clearOcrApiKey}
              onChange={(event) => setForm((current) => ({ ...current, ocrApiKey: event.target.value }))}
            />
          </div>
          <label className="checkbox-row settings-checkbox" htmlFor="clear-ocr-key">
            <input
              id="clear-ocr-key"
              type="checkbox"
              checked={form.clearOcrApiKey}
              disabled={isSavingSettings}
              onChange={(event) => setForm((current) => ({
                ...current,
                clearOcrApiKey: event.target.checked,
                ocrApiKey: event.target.checked ? "" : current.ocrApiKey
              }))}
            />
            {t("model.clearOcrApiKey")}
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
            <small className="muted">{t("model.ocrLanguageHelp")}</small>
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
    </>
  );
}
