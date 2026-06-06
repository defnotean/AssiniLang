import { describe, expect, it } from "vitest";
import { buildSeedState } from "@assini/synthetic-langs";
import { runEvaluationForState, summarizeEvaluationGate } from "./runEvaluation";

describe("evaluation run gate", () => {
  it("passes for the clean synthetic fixture baseline", () => {
    const runs = runEvaluationForState(buildSeedState());
    const gate = summarizeEvaluationGate(runs);

    expect(gate).toEqual({
      passed: true,
      exitCode: 0,
      failureLines: []
    });
  });

  it("fails loudly with traceable lines when any evaluation run has failures", () => {
    const state = buildSeedState();
    const passage = state.corpus.find((item) => item.id === "avn-c001");
    if (!passage) throw new Error("Missing avn-c001");
    passage.textTranslation = "A wrong translation.";

    const runs = runEvaluationForState(state);
    const gate = summarizeEvaluationGate(runs);

    expect(gate.passed).toBe(false);
    expect(gate.exitCode).toBe(1);
    expect(gate.failureLines).toEqual(
      expect.arrayContaining([
        "Avenik translationAccuracy avn-c001: Translation mismatch for corpus passage avn-c001."
      ])
    );
  });

  it("fails loudly when a category score drops below its required threshold", () => {
    const [run] = runEvaluationForState(buildSeedState());
    if (!run) throw new Error("Missing evaluation run");

    const gate = summarizeEvaluationGate([
      {
        ...run,
        failures: [],
        scores: {
          ...run.scores,
          noteAccuracy: 0.95
        }
      }
    ]);

    expect(gate.passed).toBe(false);
    expect(gate.exitCode).toBe(1);
    expect(gate.failureLines).toEqual(
      expect.arrayContaining([
        "Avenik noteAccuracy threshold: score 95.0% is below required 96.0%."
      ])
    );
  });
});
