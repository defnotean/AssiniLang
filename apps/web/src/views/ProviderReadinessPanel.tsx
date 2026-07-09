import type { LlmReachability, LlmStatus } from "../api";
import { useI18n } from "../i18n";
import { formatLlmProvider, formatMode, formatReachability, localizeLlmStatusWarning } from "../lib/format";
import { modelDisplayName } from "../lib/modelFormatting";

type ProviderReadinessPanelProps = {
  isCheckingReachability: boolean;
  isSavingSettings: boolean;
  isTestingModel: boolean;
  modelTestIsPlaceholder: boolean;
  modelTestResult: string | null;
  onSmokeTest: () => void;
  onTestConnection: () => void;
  reachabilityError: string | null;
  reachabilityResult: LlmReachability | null;
  status: LlmStatus;
};

export function ProviderReadinessPanel({
  isCheckingReachability,
  isSavingSettings,
  isTestingModel,
  modelTestIsPlaceholder,
  modelTestResult,
  onSmokeTest,
  onTestConnection,
  reachabilityError,
  reachabilityResult,
  status
}: ProviderReadinessPanelProps) {
  const { t } = useI18n();
  const connectionChecked = reachabilityResult?.checked === true;
  const connected = connectionChecked && reachabilityResult.reachable;
  const unavailable = connectionChecked && !reachabilityResult.reachable;
  const heading = !status.configured
    ? t("model.needsConfiguration")
    : isCheckingReachability
      ? t("model.connectionChecking")
      : connected
        ? t("model.connected")
        : unavailable
          ? t("model.unavailable")
          : t("model.configured");
  const badge = !status.configured
    ? t("model.incomplete")
    : connected
      ? t("model.connected")
      : unavailable
        ? t("model.unavailable")
        : t("model.notChecked");
  const badgeClass = connected ? "approved" : unavailable ? "rejected" : "under_review";

  return (
    <section className="panel-card model-status" aria-label={t("model.providerReadinessAria")}>
      <div className="record-topline">
        <div>
          <span className="detail-label">{t("model.providerReadiness")}</span>
          <h2>{heading}</h2>
        </div>
        <span className={`status-badge ${badgeClass}`}>
          {badge}
        </span>
      </div>
      {!status.configured && (
        <p className="muted empty-state" role="status" aria-live="polite">
          {t("model.needsConfigurationHint")}
        </p>
      )}
      <dl className="detail-grid">
        <div>
          <dt>{t("model.mode")}</dt>
          <dd>{formatMode(status.mode, t)}</dd>
        </div>
        <div>
          <dt>{t("model.provider")}</dt>
          <dd>{formatLlmProvider(status.provider, t)}</dd>
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
          {status.warnings.map((warning, index) => (
            <p key={`${index}:${warning}`}>{localizeLlmStatusWarning(warning, t)}</p>
          ))}
        </div>
      )}
      <div className="model-actions">
        <button
          type="button"
          onClick={onSmokeTest}
          disabled={isTestingModel || isSavingSettings}
          aria-busy={isTestingModel}
        >
          {isTestingModel ? t("model.testingProvider") : t("model.runSmokeTest")}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onTestConnection}
          disabled={isCheckingReachability || isSavingSettings}
          aria-busy={isCheckingReachability}
        >
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
        <p className="result-notice error" role="alert" aria-live="assertive">
          {reachabilityError}
        </p>
      )}
      {reachabilityResult && (
        <p className="result-notice" role="status" aria-live="polite">
          {formatReachability(reachabilityResult, t)}
        </p>
      )}
    </section>
  );
}
