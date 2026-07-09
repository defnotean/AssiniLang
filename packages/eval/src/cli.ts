import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore } from "@assini/db";
import { runEvaluationForState, summarizeEvaluationGate } from "./runEvaluation.js";

const currentFilePath = fileURLToPath(import.meta.url);
export const defaultEvalDbPath = resolve(dirname(currentFilePath), "..", "..", "..", "data", "local-db.json");

export function resolveEvalDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ASSINI_DB_PATH?.trim();
  return override ? resolve(override) : defaultEvalDbPath;
}

function requireLanguages(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.ASSINI_EVAL_REQUIRE_LANGUAGES?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export async function runEvaluationCli({
  dbPath = resolveEvalDbPath(),
  env = process.env,
  stderr = console.error,
  stdout = console.log
}: {
  dbPath?: string;
  env?: NodeJS.ProcessEnv;
  stderr?: (message?: unknown, ...optionalParams: unknown[]) => void;
  stdout?: (message?: unknown, ...optionalParams: unknown[]) => void;
} = {}) {
  const store = new JsonStore(dbPath);
  const state = await store.read();

  if (state.languages.length === 0) {
    if (requireLanguages(env)) {
      stderr("Evaluation gate failed: workspace has no languages (ASSINI_EVAL_REQUIRE_LANGUAGES is set).");
      stderr("Seed a fixture language before running verify, or unset ASSINI_EVAL_REQUIRE_LANGUAGES for an empty local workspace.");
      return 1;
    }
    stdout("No languages in the workspace yet; nothing to evaluate.");
    stdout("Create a language from the sidebar (or API), ingest sources, then run System Eval from Checks or re-run `npm run eval`.");
    return 0;
  }

  const runs = runEvaluationForState(state);
  await store.write({
    ...state,
    evaluationRuns: [...state.evaluationRuns, ...runs]
  });

  for (const run of runs) {
    stdout(run.summary);
  }

  const gate = summarizeEvaluationGate(runs);
  if (!gate.passed) {
    stderr("Evaluation gate failed:");
    for (const line of gate.failureLines) {
      stderr(`- ${line}`);
    }
    return gate.exitCode;
  }

  return 0;
}

const invokedFilePath = process.argv[1] ? resolve(process.argv[1]) : undefined;

if (invokedFilePath === currentFilePath) {
  process.exitCode = await runEvaluationCli();
}
