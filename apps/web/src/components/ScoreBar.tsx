import { formatMetric, scoreTone } from "../lib/format";

export function ScoreBar({ metric, score }: { metric: string; score: number }) {
  const percent = Math.round(score * 100);
  return (
    <div className={`score-row ${scoreTone(score)}`}>
      <span className="metric-label">{formatMetric(metric)}</span>
      <div
        className="progress-bg"
        role="progressbar"
        aria-label={formatMetric(metric)}
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
