import type { AppState, EvaluationRun } from "@assini/db";
import { scoreLanguageEvaluation } from "./scoring";
import { draftNotesForLanguage } from "./studyLoop";

export type EvaluationGateSummary = {
  passed: boolean;
  exitCode: 0 | 1;
  failureLines: string[];
};

export const DEFAULT_EVALUATION_CATEGORY_THRESHOLD = 0.96;

export const EVALUATION_CATEGORY_THRESHOLDS: Record<string, number> = {
  noteCoverage: DEFAULT_EVALUATION_CATEGORY_THRESHOLD,
  noteAccuracy: DEFAULT_EVALUATION_CATEGORY_THRESHOLD,
  evidenceAccuracy: DEFAULT_EVALUATION_CATEGORY_THRESHOLD,
  segmentationAccuracy: DEFAULT_EVALUATION_CATEGORY_THRESHOLD,
  translationAccuracy: DEFAULT_EVALUATION_CATEGORY_THRESHOLD,
  exerciseGrading: DEFAULT_EVALUATION_CATEGORY_THRESHOLD,
  generationPolicy: 1
};

export function runEvaluationForState(state: AppState): EvaluationRun[] {
  return state.languages.map((language) => {
    const drafted = draftNotesForLanguage(language.id, state);
    const result = scoreLanguageEvaluation(language.id, state, drafted);
    const average =
      Object.values(result.scores).reduce((sum, score) => sum + score, 0) / Object.values(result.scores).length;

    return {
      id: `eval-${language.id}-${Date.now()}`,
      languageId: language.id,
      createdAt: new Date().toISOString(),
      systemVersion: "deterministic-study-loop-v1",
      fixtureVersion: "workspace-corpus-v1",
      scores: result.scores,
      failures: result.failures,
      summary: `${language.name}: ${(average * 100).toFixed(1)}% average score across ${Object.keys(result.scores).length} categories.`
    };
  });
}

function languageLabelForRun(run: EvaluationRun, fallbackLanguageId: string): string {
  const summaryLabel = run.summary.split(":")[0]?.trim();
  return summaryLabel && summaryLabel.length > 0 ? summaryLabel : fallbackLanguageId;
}

function thresholdForCategory(category: string): number {
  return EVALUATION_CATEGORY_THRESHOLDS[category] ?? DEFAULT_EVALUATION_CATEGORY_THRESHOLD;
}

function formatPercent(score: number): string {
  return `${(score * 100).toFixed(1)}%`;
}

function thresholdFailureLines(run: EvaluationRun): string[] {
  return Object.entries(run.scores).flatMap(([category, score]) => {
    const threshold = thresholdForCategory(category);
    if (score >= threshold) return [];

    return [
      `${languageLabelForRun(run, run.languageId)} ${category} threshold: score ${formatPercent(score)} is below required ${formatPercent(threshold)}.`
    ];
  });
}

export function summarizeEvaluationGate(runs: EvaluationRun[]): EvaluationGateSummary {
  const failureLines = runs.flatMap((run) =>
    [
      ...run.failures.map((failure) =>
        `${languageLabelForRun(run, failure.languageId)} ${failure.category} ${failure.itemId}: ${failure.message}`
      ),
      ...thresholdFailureLines(run)
    ]
  );

  return {
    passed: failureLines.length === 0,
    exitCode: failureLines.length === 0 ? 0 : 1,
    failureLines
  };
}
