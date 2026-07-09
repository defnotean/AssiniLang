/** Soft empty-workspace stdout when `ASSINI_EVAL_REQUIRE_LANGUAGES` is unset. */
export const EMPTY_WORKSPACE_EVAL_GUIDANCE = [
  "No languages in the workspace yet; nothing to evaluate.",
  "Create a language from the sidebar (or API), ingest sources, then run System Eval from Checks or re-run `npm run eval`."
] as const;

/** Hard-fail stderr when verify (or callers) set `ASSINI_EVAL_REQUIRE_LANGUAGES`. */
export const EMPTY_WORKSPACE_EVAL_REQUIRE_LANGUAGES_GUIDANCE = [
  "Evaluation gate failed: workspace has no languages (ASSINI_EVAL_REQUIRE_LANGUAGES is set).",
  "Seed a fixture language before running verify, or unset ASSINI_EVAL_REQUIRE_LANGUAGES for an empty local workspace."
] as const;

/**
 * Fail-closed guidance when languages exist but evaluation produced no runs
 * (avoids a vacuous green gate from `summarizeEvaluationGate([])`).
 */
export const NO_EVAL_RUNS_CLI_GUIDANCE = [
  "No evaluation runs were produced for the workspace languages; nothing to gate.",
  "Confirm each language still exists, then re-run `npm run eval` or use Run System Eval from Checks."
] as const;
