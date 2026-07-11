import type { DashboardData } from "./api";

export type EvaluationRun = DashboardData["evaluations"][number];
export type EvaluationTrendStatus = "improved" | "regressed" | "stable" | "single-run";
export type EvaluationTrend = {
  languageId: string;
  latestRunId: string;
  previousRunId: string | null;
  latestAverageScore: number;
  previousAverageScore: number | null;
  averageDelta: number | null;
  status: EvaluationTrendStatus;
  categoryDeltas: Record<
    string,
    {
      latestScore: number;
      previousScore: number | null;
      delta: number | null;
    }
  >;
};

export function averageScore(scores: Record<string, number>): number {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  return values.reduce((sum, score) => sum + score, 0) / values.length;
}

export function roundedScore(value: number): number {
  return Number(value.toFixed(4));
}

export function latestRunsByLanguage(runs: EvaluationRun[]): Record<string, EvaluationRun> {
  return runs.reduce<Record<string, EvaluationRun>>((latest, run) => {
    const current = latest[run.languageId];
    if (!current || new Date(run.createdAt).getTime() > new Date(current.createdAt).getTime()) {
      latest[run.languageId] = run;
    }
    return latest;
  }, {});
}

export function evaluationTrendsForRuns(runs: EvaluationRun[]): EvaluationTrend[] {
  const grouped = runs.reduce<Record<string, EvaluationRun[]>>((byLanguage, run) => {
    byLanguage[run.languageId] = [...(byLanguage[run.languageId] ?? []), run];
    return byLanguage;
  }, {});

  return Object.entries(grouped)
    .map(([languageId, languageRuns]): EvaluationTrend | undefined => {
      const sorted = languageRuns
        .slice()
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
      const latest = sorted[sorted.length - 1];
      if (!latest) return undefined;

      const previous = sorted[sorted.length - 2];
      const latestAverageScore = roundedScore(averageScore(latest.scores));
      const previousAverageScore = previous ? roundedScore(averageScore(previous.scores)) : null;
      const averageDelta =
        previousAverageScore === null ? null : roundedScore(latestAverageScore - previousAverageScore);
      const categories = new Set([...Object.keys(latest.scores), ...Object.keys(previous?.scores ?? {})]);
      const categoryDeltas = [...categories].sort().reduce<EvaluationTrend["categoryDeltas"]>((deltas, category) => {
        const latestScore = roundedScore(latest.scores[category] ?? 0);
        const previousScore = previous?.scores[category] === undefined ? null : roundedScore(previous.scores[category]);
        deltas[category] = {
          latestScore,
          previousScore,
          delta: previousScore === null ? null : roundedScore(latestScore - previousScore)
        };
        return deltas;
      }, {});

      let status: EvaluationTrendStatus = "single-run";
      if (averageDelta !== null) {
        if (averageDelta < 0) status = "regressed";
        if (averageDelta > 0) status = "improved";
        if (averageDelta === 0) status = "stable";
      }

      return {
        languageId,
        latestRunId: latest.id,
        previousRunId: previous ? previous.id : null,
        latestAverageScore,
        previousAverageScore,
        averageDelta,
        status,
        categoryDeltas
      };
    })
    .filter((trend): trend is EvaluationTrend => trend !== undefined)
    .sort((left, right) => left.languageId.localeCompare(right.languageId));
}
