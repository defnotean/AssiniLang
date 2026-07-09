import { useEffect, useMemo, useState } from "react";
import {
  averageScore,
  evaluationTrendsForRuns,
  latestRunsByLanguage,
  type EvaluationRun,
  type EvaluationTrendStatus
} from "../evaluationTrends";
import { ScoreBar } from "../components/ScoreBar";
import { ScoreRing } from "../components/ScoreRing";
import { formatMetric, formatSignedTrendPoints, formatTrendPoints, formatTypology, scoreTone } from "../lib/format";
import { useI18n, type MessageKey } from "../i18n";
import type { Language, SnapshotDownload } from "../lib/types";

const TREND_VERB_KEY: Record<EvaluationTrendStatus, MessageKey> = {
  improved: "eval.trendImproved",
  regressed: "eval.trendRegressed",
  stable: "eval.trendHeldSteady",
  "single-run": "eval.trendHeldSteady"
};

export function EvaluationView({
  evaluations,
  languages,
  selectedLanguageId,
  isWorkflowBusy,
  isEvaluating,
  artifactDownload,
  artifactError,
  isExportingArtifact,
  onExportArtifact
}: {
  evaluations: EvaluationRun[];
  languages: Language[];
  selectedLanguageId: string | null;
  isWorkflowBusy: boolean;
  isEvaluating: boolean;
  artifactDownload: SnapshotDownload | null;
  artifactError: string | null;
  isExportingArtifact: boolean;
  onExportArtifact: () => void;
}) {
  const { t } = useI18n();
  const [activeLanguageId, setActiveLanguageId] = useState<string | null>(selectedLanguageId);
  useEffect(() => {
    setActiveLanguageId(selectedLanguageId);
  }, [selectedLanguageId]);

  const latestByLanguage = useMemo(() => latestRunsByLanguage(evaluations), [evaluations]);
  const trends = useMemo(() => evaluationTrendsForRuns(evaluations), [evaluations]);
  const comparableTrends = trends.filter((trend) => trend.previousRunId !== null);
  const activeRun = (activeLanguageId ? latestByLanguage[activeLanguageId] : undefined) ?? evaluations[0] ?? null;
  const activeLanguage = languages.find((language) => language.id === (activeRun?.languageId ?? activeLanguageId));

  if (isEvaluating && evaluations.length === 0) {
    return (
      <div className="panel-card" role="status" aria-live="polite">
        {t("eval.evaluating")}
      </div>
    );
  }

  if (evaluations.length === 0) {
    return (
      <div className="panel-card empty-state" role="status">
        <p>{t("eval.noRuns")}</p>
        <p className="muted">{t("eval.noRunsHint")}</p>
      </div>
    );
  }

  return (
    <div className="evaluation-view">
      {isEvaluating && (
        <p className="result-notice" role="status" aria-live="polite">
          {t("eval.evaluating")}
        </p>
      )}
      <div className="eval-language-grid">
        {languages.map((language) => {
          const latest = latestByLanguage[language.id];
          const score = latest ? averageScore(latest.scores) : 0;
          const isActive = (activeRun?.languageId ?? activeLanguageId) === language.id;
          return (
            <button
              type="button"
              key={language.id}
              aria-label={t("eval.languageScoreAria", { name: language.name })}
              className={`eval-language-card ${scoreTone(score)}${isActive ? " active" : ""}`}
              onClick={() => setActiveLanguageId(language.id)}
            >
              <div>
                <strong>{language.name}</strong>
                <span>{formatTypology(language.typology, t)}</span>
              </div>
              <ScoreRing score={score} />
            </button>
          );
        })}
      </div>

      <section className="panel-card evaluation-export-card" aria-label={t("eval.exportAria")}>
        <div>
          <span className="detail-label">{t("eval.exportLabel")}</span>
          <h2>{t("eval.portableArtifact")}</h2>
        </div>
        <div className="snapshot-actions">
          <button
            type="button"
            onClick={onExportArtifact}
            disabled={isWorkflowBusy || isExportingArtifact}
            aria-busy={isExportingArtifact}
          >
            {isExportingArtifact ? t("eval.exporting") : t("eval.exportArtifact")}
          </button>
          {artifactDownload && (
            <a className="download-link" href={artifactDownload.href} download={artifactDownload.fileName}>
              {t("eval.downloadArtifact")}
            </a>
          )}
        </div>
        {artifactDownload && (
          <div role="status" aria-live="polite">
            <p className="result-notice">{t("eval.exportSuccess")}</p>
            <p className="muted">{artifactDownload.summary}</p>
          </div>
        )}
        {artifactError && <p className="result-notice error" role="alert">{artifactError}</p>}
      </section>

      <section className="panel-card evaluation-trend-card" aria-label={t("eval.trendsAria")}>
        <div>
          <span className="detail-label">{t("eval.regressionWatch")}</span>
          <h2>
            {comparableTrends.length === 1
              ? t("eval.comparisonCountOne", { count: comparableTrends.length })
              : t("eval.comparisonCountMany", { count: comparableTrends.length })}
          </h2>
        </div>
        {comparableTrends.length === 0 ? (
          <div className="empty-state" role="status">
            <p>{t("eval.runMoreThanOnce")}</p>
            {evaluations.length > 0 && (
              <p className="muted">{t("eval.trendsNextStep")}</p>
            )}
          </div>
        ) : (
          <div className="trend-grid">
            {comparableTrends.map((trend) => {
              const language = languages.find((item) => item.id === trend.languageId);
              const languageName = language?.name ?? trend.languageId;
              return (
                <article className={`trend-card ${trend.status}`} key={trend.languageId}>
                  <p>{t("eval.trendSentence", {
                    name: languageName,
                    verb: t(TREND_VERB_KEY[trend.status]),
                    points: formatTrendPoints(trend.averageDelta, t)
                  })}</p>
                  <div className="pill-row">
                    {Object.entries(trend.categoryDeltas)
                      .filter(([, delta]) => delta.delta !== null)
                      .map(([category, delta]) => (
                        <span className="pill trend-pill" key={`${trend.languageId}-${category}`}>
                          {formatMetric(category, t)} {formatSignedTrendPoints(delta.delta, t)}
                        </span>
                      ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {activeRun && (
        <article className="panel-card eval-breakdown">
          <div className="record-topline">
            <div>
              <span className="detail-label">{t("eval.latestRun")}</span>
              <h2>{t("eval.scoreBreakdown", { name: activeLanguage?.name ?? activeRun.languageId })}</h2>
            </div>
            <span className="id-badge">{new Date(activeRun.createdAt).toLocaleString()}</span>
          </div>
          <p className="eval-summary">{activeRun.summary}</p>
          <div className="score-bars">
            {Object.entries(activeRun.scores).map(([metric, score]) => (
              <ScoreBar key={metric} metric={metric} score={score} />
            ))}
          </div>
          {activeRun.failures.length > 0 && (
            <div className="failure-list">
              {activeRun.failures.map((failure) => (
                <p key={`${failure.category}-${failure.itemId}`}>
                  <strong>{failure.category}</strong> {failure.itemId}: {failure.message}
                </p>
              ))}
            </div>
          )}
        </article>
      )}
    </div>
  );
}
