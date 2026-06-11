import { scoreTone } from "../lib/format";

export function ScoreRing({ score }: { score: number }) {
  const percent = Math.round(score * 100);
  const circumference = 157.08;
  return (
    <svg className={`score-ring ${scoreTone(score)}`} viewBox="0 0 60 60" aria-hidden="true">
      <circle cx="30" cy="30" r="25" className="score-track" />
      <circle
        cx="30"
        cy="30"
        r="25"
        className="score-fill"
        strokeDasharray={`${score * circumference} ${circumference}`}
        transform="rotate(-90 30 30)"
      />
      <text x="30" y="35" textAnchor="middle">
        {percent}%
      </text>
    </svg>
  );
}
