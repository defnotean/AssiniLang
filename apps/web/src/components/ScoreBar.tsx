import { formatMetric, scoreTone } from "../lib/format";
import { useI18n } from "../i18n";

export function ScoreBar({ metric, score }: { metric: string; score: number }) {
  const { t } = useI18n();
  const percent = Math.round(score * 100);
  const label = formatMetric(metric, t);
  return (
    <div className={`score-row ${scoreTone(score)}`}>
      <span className="metric-label">{label}</span>
      <div
        className="progress-bg"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="metric-score">{percent}%</span>
    </div>
  );
}
