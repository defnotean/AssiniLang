import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore } from "@assini/db";
import { runEvaluationForState, summarizeEvaluationGate } from "./runEvaluation";

const currentFilePath = fileURLToPath(import.meta.url);
const evalDbPath = resolve(dirname(currentFilePath), "..", "..", "..", "data", "local-db.json");

const store = new JsonStore(evalDbPath);
const state = await store.read();

if (state.languages.length === 0) {
  throw new Error("No languages found. Run npm run seed first.");
}

const runs = runEvaluationForState(state);
await store.write({
  ...state,
  evaluationRuns: [...state.evaluationRuns, ...runs]
});

for (const run of runs) {
  console.log(run.summary);
}

const gate = summarizeEvaluationGate(runs);
if (!gate.passed) {
  console.error("Evaluation gate failed:");
  for (const line of gate.failureLines) {
    console.error(`- ${line}`);
  }
  process.exitCode = gate.exitCode;
}
