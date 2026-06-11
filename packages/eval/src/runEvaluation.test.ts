import { describe, expect, it } from "vitest";
import { buildTestWorkspaceState } from "@assini/db";
import { runEvaluationForState, summarizeEvaluationGate } from "./runEvaluation.js";

describe("evaluation run gate", () => {
  it("passes for a clean workspace baseline", () => {
    const runs = runEvaluationForState(buildTestWorkspaceState());
    const gate = summarizeEvaluationGate(runs);

    expect(gate).toEqual({
      passed: true,
      exitCode: 0,
      failureLines: []
    });
  });

  it("produces no runs for an empty workspace", () => {
    const runs = runEvaluationForState({
      ...buildTestWorkspaceState(),
      languages: [],
      corpus: [],
      corpusAnswerKeys: [],
      lexemes: [],
      notes: [],
      noteAnswerKeys: [],
      exercises: [],
      reviewPolicies: []
    });
    const gate = summarizeEvaluationGate(runs);

    expect(runs).toHaveLength(0);
    expect(gate.passed).toBe(true);
  });

  it("fails loudly with traceable lines when any evaluation run has failures", () => {
    const state = buildTestWorkspaceState();
    const passage = state.corpus.find((item) => item.id === "testlang-c001");
    if (!passage) throw new Error("Missing testlang-c001");
    passage.textTranslation = "A wrong translation.";

    const runs = runEvaluationForState(state);
    const gate = summarizeEvaluationGate(runs);

    expect(gate.passed).toBe(false);
    expect(gate.exitCode).toBe(1);
    expect(gate.failureLines).toEqual(
      expect.arrayContaining([
        "Testlang translationAccuracy testlang-c001: Translation mismatch for corpus passage testlang-c001."
      ])
    );
  });

  it("fails loudly when a category score drops below its required threshold", () => {
    const [run] = runEvaluationForState(buildTestWorkspaceState());
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
        "Testlang noteAccuracy threshold: score 95.0% is below required 96.0%."
      ])
    );
  });

  it("evaluates model drafts and sets systemVersion to model-study-loop-v1 when model drafts exist", () => {
    const state = buildTestWorkspaceState();
    state.notes.push({
      id: "model-draft-testlang-1-xyz",
      languageId: "testlang",
      topic: "syntax/basic-order",
      explanation: "Subjects come before verbs.",
      examples: [],
      evidencePassageIds: ["testlang-c001"],
      evidenceCount: 1,
      confidence: "medium",
      status: "draft",
      reviewer: {
        lastReviewedBy: null,
        lastReviewedAt: null,
        comments: []
      },
      dialectScope: "general",
      editHistory: []
    });

    const runs = runEvaluationForState(state);
    const run = runs.find((item: any) => item.languageId === "testlang");
    expect(run).toBeDefined();
    expect(run?.systemVersion).toBe("model-study-loop-v1");
  });
});
