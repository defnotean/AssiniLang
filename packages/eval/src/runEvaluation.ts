import { randomUUID } from "node:crypto";
import type { AppState, EvaluationRun } from "@assini/db";
import { scoreLanguageEvaluation } from "./scoring.js";
import { draftNotesForLanguage } from "./studyLoop.js";

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

function modelDraftsCoverAnswerKeyTopics(
  modelDrafts: { topic: string }[],
  answerKeyTopics: string[]
): boolean {
  if (answerKeyTopics.length === 0 || modelDrafts.length === 0) return false;
  const draftTopics = new Set(modelDrafts.map((draft) => draft.topic));
  return answerKeyTopics.every((topic) => draftTopics.has(topic));
}

export function runEvaluationForState(state: AppState): EvaluationRun[] {
  return state.languages.map((language) => {
    const modelDrafts = state.notes.filter(
      (note) => note.languageId === language.id && note.id.startsWith("model-draft-")
    );
    const answerKeyTopics = [
      ...new Set(
        state.noteAnswerKeys
          .filter((note) => note.languageId === language.id)
          .map((note) => note.topic)
      )
    ];
    const useModelDrafts = modelDraftsCoverAnswerKeyTopics(modelDrafts, answerKeyTopics);
    const drafted = useModelDrafts ? modelDrafts : draftNotesForLanguage(language.id, state);
    const result = scoreLanguageEvaluation(language.id, state, drafted);
    const scoreValues = Object.values(result.scores) as number[];
    const categoryCount = scoreValues.length;
    const average = categoryCount === 0
      ? 0
      : scoreValues.reduce((sum: number, score: number) => sum + score, 0) / categoryCount;

    return {
      id: `eval-${language.id}-${randomUUID()}`,
      languageId: language.id,
      createdAt: new Date().toISOString(),
      systemVersion: useModelDrafts ? "model-study-loop-v1" : "deterministic-study-loop-v1",
      fixtureVersion: "workspace-corpus-v1",
      scores: result.scores,
      failures: result.failures,
      summary: `${language.name}: ${(average * 100).toFixed(1)}% average score across ${categoryCount} categories.`
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

function unscoredCriticalCategoryLines(run: EvaluationRun): string[] {
  // Fail closed when every critical category was empty (no answer keys / exercises).
  // Do not treat real 0% scores from graded items as "unscored".
  const criticalCategories = Object.keys(EVALUATION_CATEGORY_THRESHOLDS);
  const emptyCategories = new Set(
    run.failures
      .filter((failure) => failure.itemId === `${failure.category}:empty`)
      .map((failure) => failure.category)
  );
  if (!criticalCategories.every((category) => emptyCategories.has(category))) {
    return [];
  }

  return [
    `${languageLabelForRun(run, run.languageId)} evaluation gate: no scored evaluation items; language cannot pass without answer keys or exercises.`
  ];
}

export function summarizeEvaluationGate(runs: EvaluationRun[]): EvaluationGateSummary {
  const failureLines = runs.flatMap((run) =>
    [
      ...run.failures.map((failure) =>
        `${languageLabelForRun(run, failure.languageId)} ${failure.category} ${failure.itemId}: ${failure.message}`
      ),
      ...thresholdFailureLines(run),
      ...unscoredCriticalCategoryLines(run)
    ]
  );

  return {
    passed: failureLines.length === 0,
    exitCode: failureLines.length === 0 ? 0 : 1,
    failureLines
  };
}
