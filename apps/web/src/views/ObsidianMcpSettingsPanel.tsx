import { useEffect, useState, type FormEvent } from "react";
import {
  fetchObsidianMcpSettings,
  testObsidianMcpConnection,
  updateObsidianMcpSettings,
  type ObsidianMcpConnectionStatus,
  type ObsidianMcpSettings
} from "../api";
import { useI18n } from "../i18n";

type SettingsForm = {
  endpointUrl: string;
  token: string;
  clearToken: boolean;
  timeoutMs: string;
};

function formFromSettings(settings: ObsidianMcpSettings): SettingsForm {
  return {
    endpointUrl: settings.endpointUrl,
    token: "",
    clearToken: false,
    timeoutMs: String(settings.timeoutMs)
  };
}

export function ObsidianMcpSettingsPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<ObsidianMcpSettings | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [connection, setConnection] = useState<ObsidianMcpConnectionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchObsidianMcpSettings()
      .then((loaded) => {
        if (!active) return;
        setSettings(loaded);
        setForm(formFromSettings(loaded));
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : t("mcp.settingsLoadFailed"));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const timeoutMs = Number.parseInt(form.timeoutMs, 10);
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000) {
      setError(t("mcp.timeoutInvalid"));
      return;
    }
    setIsSaving(true);
    setError(null);
    setNotice(null);
    setConnection(null);
    try {
      const saved = await updateObsidianMcpSettings({
        endpointUrl: form.endpointUrl.trim(),
        token: form.token || undefined,
        clearToken: form.clearToken || undefined,
        timeoutMs
      });
      setSettings(saved);
      setForm(formFromSettings(saved));
      setNotice(t("mcp.settingsSaved"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("mcp.settingsSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTest() {
    setIsTesting(true);
    setError(null);
    setNotice(null);
    try {
      setConnection(await testObsidianMcpConnection());
    } catch (caught) {
      setConnection(null);
      setError(caught instanceof Error ? caught.message : t("mcp.connectionFailed"));
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <section className="panel-card setup-card" aria-label={t("mcp.settingsAria")}>
      <div className="record-topline">
        <div>
          <span className="detail-label">{t("mcp.integration")}</span>
          <h2>{t("mcp.settingsHeading")}</h2>
        </div>
        {settings ? (
          <span
            className={`status-badge ${connection?.connected ? "approved" : settings.endpointUrl ? "under_review" : "draft"}`}
          >
            {connection?.connected
              ? (connection.serverName ?? t("mcp.connected"))
              : settings.endpointUrl
                ? t("mcp.configured")
                : t("mcp.notConfigured")}
          </span>
        ) : null}
      </div>

      {isLoading && (
        <p className="inline-empty" role="status">
          {t("mcp.loadingSettings")}
        </p>
      )}
      {form ? (
        <form className="settings-form" onSubmit={handleSave} aria-busy={isSaving}>
          <div className="settings-grid">
            <div className="form-group">
              <label htmlFor="obsidian-mcp-endpoint">{t("mcp.endpoint")}</label>
              <input
                id="obsidian-mcp-endpoint"
                type="url"
                value={form.endpointUrl}
                onChange={(event) => setForm({ ...form, endpointUrl: event.target.value })}
                placeholder="http://127.0.0.1:3001/mcp"
                disabled={isSaving || isTesting}
              />
            </div>
            <div className="form-group">
              <label htmlFor="obsidian-mcp-timeout">{t("mcp.timeout")}</label>
              <input
                id="obsidian-mcp-timeout"
                type="number"
                min="1000"
                max="120000"
                step="1000"
                value={form.timeoutMs}
                onChange={(event) => setForm({ ...form, timeoutMs: event.target.value })}
                disabled={isSaving || isTesting}
              />
            </div>
            <div className="form-group">
              <label htmlFor="obsidian-mcp-token">{t("mcp.token")}</label>
              <input
                id="obsidian-mcp-token"
                type="password"
                autoComplete="off"
                value={form.token}
                onChange={(event) => setForm({ ...form, token: event.target.value, clearToken: false })}
                placeholder={settings?.tokenConfigured ? t("mcp.tokenStored") : t("mcp.tokenOptional")}
                disabled={isSaving || isTesting || form.clearToken}
              />
            </div>
            <label className="checkbox-row settings-checkbox" htmlFor="obsidian-mcp-clear-token">
              <input
                id="obsidian-mcp-clear-token"
                type="checkbox"
                checked={form.clearToken}
                onChange={(event) => setForm({ ...form, clearToken: event.target.checked, token: "" })}
                disabled={isSaving || isTesting || !settings?.tokenConfigured}
              />
              {t("mcp.clearToken")}
            </label>
          </div>
          <div className="settings-actions">
            <button type="submit" disabled={isSaving || isTesting} aria-busy={isSaving}>
              {isSaving ? t("mcp.saving") : t("mcp.save")}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={isSaving || isTesting || !settings?.endpointUrl}
              aria-busy={isTesting}
              onClick={() => void handleTest()}
            >
              {isTesting ? t("mcp.testing") : t("mcp.test")}
            </button>
          </div>
          {notice && (
            <p className="result-notice" role="status" aria-live="polite">
              {notice}
            </p>
          )}
          {error && (
            <p className="inline-error" role="alert" aria-live="assertive">
              {error}
            </p>
          )}
          {connection?.connected && (
            <p className="result-notice" role="status" aria-live="polite">
              {t("mcp.connectionReady", {
                server: connection.serverName ?? t("mcp.serverFallback"),
                count: connection.resourceCount ?? 0,
                latency: connection.latencyMs ?? 0
              })}
            </p>
          )}
          {connection && !connection.connected && (
            <p className="inline-error" role="alert" aria-live="assertive">
              {connection.detail ?? t("mcp.connectionFailed")}
            </p>
          )}
        </form>
      ) : null}
    </section>
  );
}
