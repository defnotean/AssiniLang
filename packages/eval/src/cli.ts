import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore, type AppState, type EvaluationRun } from "@assini/db";
import {
  EMPTY_WORKSPACE_EVAL_GUIDANCE,
  EMPTY_WORKSPACE_EVAL_REQUIRE_LANGUAGES_GUIDANCE,
  NO_EVAL_RUNS_CLI_GUIDANCE
} from "./cliGuidance.js";
import { runEvaluationForState, summarizeEvaluationGate } from "./runEvaluation.js";

const currentFilePath = fileURLToPath(import.meta.url);
export const defaultEvalDbPath = resolve(dirname(currentFilePath), "..", "..", "..", "data", "local-db.json");

export {
  EMPTY_WORKSPACE_EVAL_GUIDANCE,
  EMPTY_WORKSPACE_EVAL_REQUIRE_LANGUAGES_GUIDANCE,
  NO_EVAL_RUNS_CLI_GUIDANCE
} from "./cliGuidance.js";

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
  evaluate = runEvaluationForState,
  stderr = console.error,
  stdout = console.log
}: {
  dbPath?: string;
  env?: NodeJS.ProcessEnv;
  evaluate?: (state: AppState) => EvaluationRun[];
  stderr?: (message?: unknown, ...optionalParams: unknown[]) => void;
  stdout?: (message?: unknown, ...optionalParams: unknown[]) => void;
} = {}) {
  const store = new JsonStore(dbPath);
  const state = await store.read();

  if (state.languages.length === 0) {
    if (requireLanguages(env)) {
      for (const line of EMPTY_WORKSPACE_EVAL_REQUIRE_LANGUAGES_GUIDANCE) {
        stderr(line);
      }
      return 1;
    }
    for (const line of EMPTY_WORKSPACE_EVAL_GUIDANCE) {
      stdout(line);
    }
    return 0;
  }

  const runs = evaluate(state);
  if (runs.length === 0) {
    for (const line of NO_EVAL_RUNS_CLI_GUIDANCE) {
      stderr(line);
    }
    return 1;
  }

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
