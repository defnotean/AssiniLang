import type { LlmReachability, LlmStatus, ObservabilityData } from "../api";
import { StatusBadge } from "../components/badges";
import { useI18n } from "../i18n";
import { countFailedSessions, formatCount, formatMode, formatReachability, formatStatus } from "../lib/format";
import type { AsyncState } from "../lib/types";

export function ModelSetupView({
  llmState,
  observabilityState,
  isTestingModel,
  modelTestResult,
  modelTestIsPlaceholder,
  onSmokeTest,
  isCheckingReachability,
  reachabilityResult,
  reachabilityError,
  onTestConnection
}: {
  llmState: AsyncState<LlmStatus>;
  observabilityState: AsyncState<ObservabilityData>;
  isTestingModel: boolean;
  modelTestResult: string | null;
  modelTestIsPlaceholder: boolean;
  onSmokeTest: () => void;
  isCheckingReachability: boolean;
  reachabilityResult: LlmReachability | null;
  reachabilityError: string | null;
  onTestConnection: () => void;
}) {
  const { t } = useI18n();
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
  const observability = observabilityState.status === "ready" ? observabilityState.data : null;
  const recentSessions = observability?.sessions.slice(0, 5) ?? [];
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
            <dd>{status.model ?? t("model.notSet")}</dd>
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
          <button type="button" onClick={onSmokeTest} disabled={isTestingModel}>
            {isTestingModel ? t("model.testingProvider") : t("model.runSmokeTest")}
          </button>
          <button type="button" className="secondary" onClick={onTestConnection} disabled={isCheckingReachability}>
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
