import type { AppState, EvaluationRun } from "@assini/db";
import { scoreLanguageEvaluation } from "./scoring";
import { draftNotesForLanguage } from "./studyLoop";

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
      fixtureVersion: "synthetic-fixtures-2026-06-03",
      scores: result.scores,
      failures: result.failures,
      summary: `${language.name}: ${(average * 100).toFixed(1)}% average score across ${Object.keys(result.scores).length} categories.`
    };
  });
}
