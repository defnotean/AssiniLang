import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTestWorkspaceState, TEST_LANGUAGE_ID } from "@assini/db";
import { describe, expect, it } from "vitest";
import { runEvaluationForState, summarizeEvaluationGate } from "./runEvaluation.js";
import { scoreLanguageEvaluation } from "./scoring.js";
import { draftNotesForLanguage } from "./studyLoop.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const baselinePath = join(projectRoot, "fixtures/eval/testlang-baseline.json");

type TestlangBaseline = {
  baselineVersion: string;
  languageId: string;
  languageName: string;
  systemVersion: string;
  fixtureVersion: string;
  source: string;
  scores: Record<string, number>;
  failureCount: number;
  gate: {
    passed: boolean;
    exitCode: 0 | 1;
  };
  scorePolicy: {
    exactMatchCategories: string[];
    tolerance: number;
  };
};

async function loadBaseline(): Promise<TestlangBaseline> {
  return JSON.parse(await readFile(baselinePath, "utf8")) as TestlangBaseline;
}

function scoreTestlangFixture() {
  const state = buildTestWorkspaceState();
  const drafted = draftNotesForLanguage(TEST_LANGUAGE_ID, state);
  const scored = scoreLanguageEvaluation(TEST_LANGUAGE_ID, state, drafted);
  const [run] = runEvaluationForState(state);
  const gate = summarizeEvaluationGate(run ? [run] : []);

  return { state, scored, run, gate };
}

function assertScoresMatchBaseline(actual: Record<string, number>, baseline: TestlangBaseline): void {
  const { exactMatchCategories, tolerance } = baseline.scorePolicy;

  for (const category of exactMatchCategories) {
    const expected = baseline.scores[category];
    const observed = actual[category];
    expect(observed, `${category} should be defined`).toBeDefined();
    if (tolerance === 0) {
      expect(observed, `${category} should match baseline exactly`).toBe(expected);
    } else {
      expect(
        Math.abs((observed ?? 0) - (expected ?? 0)),
        `${category} should be within tolerance ${tolerance}`
      ).toBeLessThanOrEqual(tolerance);
    }
  }
}

describe("testlang evaluation baseline fixture", () => {
  it("loads the committed baseline artifact", async () => {
    const baseline = await loadBaseline();

    expect(baseline.baselineVersion).toBe("testlang-baseline-v1");
    expect(baseline.languageId).toBe(TEST_LANGUAGE_ID);
    expect(baseline.source).toBe("buildTestWorkspaceState");
    expect(Object.keys(baseline.scores)).toEqual([
      "noteCoverage",
      "noteAccuracy",
      "evidenceAccuracy",
      "segmentationAccuracy",
      "translationAccuracy",
      "exerciseGrading",
      "generationPolicy"
    ]);
  });

  it("matches baseline scores for the Testlang seed fixture", async () => {
    const baseline = await loadBaseline();
    const { scored, run, gate } = scoreTestlangFixture();

    expect(run).toBeDefined();
    expect(run?.languageId).toBe(baseline.languageId);
    expect(run?.systemVersion).toBe(baseline.systemVersion);
    expect(run?.fixtureVersion).toBe(baseline.fixtureVersion);

    assertScoresMatchBaseline(scored.scores, baseline);
    expect(scored.failures).toHaveLength(baseline.failureCount);
    expect(gate).toEqual({
      passed: baseline.gate.passed,
      exitCode: baseline.gate.exitCode,
      failureLines: []
    });
  });
});
