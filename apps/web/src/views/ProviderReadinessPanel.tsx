import type { LlmReachability, LlmStatus } from "../api";
import { useI18n } from "../i18n";
import { formatMode, formatReachability } from "../lib/format";
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

  return (
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
          {status.warnings.map((warning, index) => (
            <p key={`${index}:${warning}`}>{warning}</p>
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
  );
}
