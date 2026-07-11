import { describe, expect, it, vi } from "vitest";
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

  it("keeps run ids unique when evaluations happen in the same millisecond", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T00:00:00.000Z"));
    try {
      const [first] = runEvaluationForState(buildTestWorkspaceState());
      const [second] = runEvaluationForState(buildTestWorkspaceState());

      expect(first?.id).toMatch(/^eval-testlang-/);
      expect(second?.id).toMatch(/^eval-testlang-/);
      expect(first?.id).not.toBe(second?.id);
    } finally {
      vi.useRealTimers();
    }
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
      expect.arrayContaining(["Testlang noteAccuracy threshold: score 95.0% is below required 96.0%."])
    );
  });

  it("fails the gate for a language with no answer keys or exercises", () => {
    const state = buildTestWorkspaceState();
    state.noteAnswerKeys = [];
    state.corpusAnswerKeys = [];
    state.corpus = [];
    state.exercises = [];
    state.notes = [];

    const runs = runEvaluationForState(state);
    const gate = summarizeEvaluationGate(runs);

    expect(gate.passed).toBe(false);
    expect(gate.exitCode).toBe(1);
    expect(gate.failureLines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("noteCoverage:empty"),
        expect.stringContaining("exerciseGrading:empty"),
        "Testlang evaluation gate: no scored evaluation items; language cannot pass without answer keys or exercises."
      ])
    );
  });

  it("evaluates model drafts and sets systemVersion to model-study-loop-v1 when model drafts cover all answer-key topics", () => {
    const state = buildTestWorkspaceState();
    const sharedFields = {
      languageId: "testlang",
      examples: [] as [],
      evidencePassageIds: ["testlang-c001"],
      evidenceCount: 1,
      confidence: "medium" as const,
      status: "draft" as const,
      reviewer: {
        lastReviewedBy: null,
        lastReviewedAt: null,
        comments: [] as string[]
      },
      dialectScope: "general",
      editHistory: [] as []
    };
    state.notes.push(
      {
        ...sharedFields,
        id: "model-draft-testlang-1-xyz",
        topic: "syntax/basic-order",
        explanation: "Subjects come before verbs."
      },
      {
        ...sharedFields,
        id: "model-draft-testlang-2-xyz",
        topic: "morphology/verb/past-suffix",
        explanation: "Past tense uses -lo before the person suffix."
      }
    );

    const runs = runEvaluationForState(state);
    const run = runs.find((item: any) => item.languageId === "testlang");
    expect(run).toBeDefined();
    expect(run?.systemVersion).toBe("model-study-loop-v1");
  });

  it("does not switch to model-study-loop-v1 for a single stray model-draft note", () => {
    const state = buildTestWorkspaceState();
    state.notes.push({
      id: "model-draft-testlang-stray-xyz",
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
    expect(run?.systemVersion).toBe("deterministic-study-loop-v1");
  });

  it("falls back to languageId when the run summary has no usable label", () => {
    const [run] = runEvaluationForState(buildTestWorkspaceState());
    if (!run) throw new Error("Missing evaluation run");

    const gate = summarizeEvaluationGate([
      {
        ...run,
        summary: "   : blank label should not win",
        failures: [
          {
            category: "noteCoverage",
            languageId: run.languageId,
            itemId: "note-1",
            message: "Missing note topic"
          }
        ],
        scores: run.scores
      }
    ]);

    expect(gate.passed).toBe(false);
    expect(gate.failureLines[0]).toBe(`${run.languageId} noteCoverage note-1: Missing note topic`);
  });

  it("applies the default threshold to unknown score categories", () => {
    const [run] = runEvaluationForState(buildTestWorkspaceState());
    if (!run) throw new Error("Missing evaluation run");

    const gate = summarizeEvaluationGate([
      {
        ...run,
        failures: [],
        scores: {
          ...run.scores,
          experimentalMetric: 0.5
        }
      }
    ]);

    expect(gate.passed).toBe(false);
    expect(gate.failureLines).toEqual(
      expect.arrayContaining(["Testlang experimentalMetric threshold: score 50.0% is below required 96.0%."])
    );
  });
});
