import type { ObservabilityData } from "../api";
import { StatusBadge } from "../components/badges";
import { useI18n } from "../i18n";
import { countFailedSessions, formatStatus } from "../lib/format";
import type { AsyncState } from "../lib/types";

type ModelObservabilityPanelProps = {
  observabilityState: AsyncState<ObservabilityData>;
  onRetry?: () => void;
};

export function ModelObservabilityPanel({ observabilityState, onRetry }: ModelObservabilityPanelProps) {
  const { t } = useI18n();
  const observability = observabilityState.status === "ready" ? observabilityState.data : null;
  const recentSessions = observability?.sessions.slice(0, 5) ?? [];

  return (
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
        <div className="inline-error" role="alert">
          <p>{observabilityState.message}</p>
          {onRetry && (
            <button type="button" className="secondary" onClick={onRetry}>
              {t("app.retryLoad")}
            </button>
          )}
        </div>
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
            <p className="inline-empty" role="status" aria-live="polite">{t("model.noSessions")}</p>
          ) : (
            <div className="detail-list session-list">
              {recentSessions.map((session) => (
                <div key={session.id} className="detail-row session-row">
                  <StatusBadge status={session.status} />
                  <strong>{formatStatus(session.mode, t)}</strong>
                  <span>{session.languageId}</span>
                  <span>
                    {session.messageCount === 1
                      ? t("format.count.messageOne", { count: session.messageCount })
                      : t("format.count.messageMany", { count: session.messageCount })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
