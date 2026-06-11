import { useEffect, useMemo, useState } from "react";
import {
  averageScore,
  evaluationTrendsForRuns,
  latestRunsByLanguage,
  type EvaluationRun
} from "../evaluationTrends";
import { ScoreBar } from "../components/ScoreBar";
import { ScoreRing } from "../components/ScoreRing";
import { formatCount, formatSignedTrendPoints, formatTrendPoints, scoreTone, trendVerb } from "../lib/format";
import type { Language, SnapshotDownload } from "../lib/types";

export function EvaluationView({
  evaluations,
  languages,
  selectedLanguageId,
  isWorkflowBusy,
  artifactDownload,
  artifactError,
  isExportingArtifact,
  onExportArtifact
}: {
  evaluations: EvaluationRun[];
  languages: Language[];
  selectedLanguageId: string | null;
  isWorkflowBusy: boolean;
  artifactDownload: SnapshotDownload | null;
  artifactError: string | null;
  isExportingArtifact: boolean;
  onExportArtifact: () => void;
}) {
  const [activeLanguageId, setActiveLanguageId] = useState<string | null>(selectedLanguageId);
  useEffect(() => {
    setActiveLanguageId(selectedLanguageId);
  }, [selectedLanguageId]);

  const latestByLanguage = useMemo(() => latestRunsByLanguage(evaluations), [evaluations]);
  const trends = useMemo(() => evaluationTrendsForRuns(evaluations), [evaluations]);
  const comparableTrends = trends.filter((trend) => trend.previousRunId !== null);
  const activeRun = (activeLanguageId ? latestByLanguage[activeLanguageId] : undefined) ?? evaluations[0] ?? null;
  const activeLanguage = languages.find((language) => language.id === (activeRun?.languageId ?? activeLanguageId));

  if (evaluations.length === 0) {
    return <p className="empty-state panel-card">No evaluation runs yet.</p>;
  }

  return (
    <div className="evaluation-view">
      <div className="eval-language-grid">
        {languages.map((language) => {
          const latest = latestByLanguage[language.id];
          const score = latest ? averageScore(latest.scores) : 0;
          const isActive = (activeRun?.languageId ?? activeLanguageId) === language.id;
          return (
            <button
              type="button"
              key={language.id}
              aria-label={`${language.name} evaluation score`}
              className={`eval-language-card ${scoreTone(score)}${isActive ? " active" : ""}`}
              onClick={() => setActiveLanguageId(language.id)}
            >
              <div>
                <strong>{language.name}</strong>
                <span>{language.typology}</span>
              </div>
              <ScoreRing score={score} />
            </button>
          );
        })}
      </div>

      <section className="panel-card evaluation-export-card" aria-label="Evaluation artifact export">
        <div>
          <span className="detail-label">Evaluation export</span>
          <h2>Portable quality artifact</h2>
        </div>
        <div className="snapshot-actions">
          <button type="button" onClick={onExportArtifact} disabled={isWorkflowBusy || isExportingArtifact}>
            {isExportingArtifact ? "Exporting..." : "Export evaluation artifact"}
          </button>
          {artifactDownload && (
            <a className="download-link" href={artifactDownload.href} download={artifactDownload.fileName}>
              Download evaluation artifact JSON
            </a>
          )}
        </div>
        {artifactDownload && (
          <p className="result-notice">
            {artifactDownload.summary}
          </p>
        )}
        {artifactError && <p className="result-notice error">{artifactError}</p>}
      </section>

      <section className="panel-card evaluation-trend-card" aria-label="Evaluation trends">
        <div>
          <span className="detail-label">Regression watch</span>
          <h2>{formatCount(comparableTrends.length, "comparison")}</h2>
        </div>
        {comparableTrends.length === 0 ? (
          <p className="empty-state">Run evaluations more than once to show score movement.</p>
        ) : (
          <div className="trend-grid">
            {comparableTrends.map((trend) => {
              const language = languages.find((item) => item.id === trend.languageId);
              const languageName = language?.name ?? trend.languageId;
              return (
                <article className={`trend-card ${trend.status}`} key={trend.languageId}>
                  <p>{languageName} {trendVerb(trend.status)} by {formatTrendPoints(trend.averageDelta)} since previous run.</p>
                  <div className="pill-row">
                    {Object.entries(trend.categoryDeltas)
                      .filter(([, delta]) => delta.delta !== null)
                      .map(([category, delta]) => (
                        <span className="pill trend-pill" key={`${trend.languageId}-${category}`}>
                          {category} {formatSignedTrendPoints(delta.delta)}
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
              <span className="detail-label">Latest run</span>
              <h2>{activeLanguage?.name ?? activeRun.languageId} score breakdown</h2>
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
