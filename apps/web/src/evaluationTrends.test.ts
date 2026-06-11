import { describe, expect, it } from "vitest";
import {
  averageScore,
  evaluationTrendsForRuns,
  latestRunsByLanguage,
  roundedScore,
  type EvaluationRun
} from "./evaluationTrends";

function evaluationRun(overrides: Partial<EvaluationRun> & Pick<EvaluationRun, "id" | "languageId" | "createdAt" | "scores">): EvaluationRun {
  return {
    systemVersion: "test-system",
    fixtureVersion: "test-fixture",
    failures: [],
    summary: "Evaluation completed.",
    ...overrides
  };
}

describe("evaluation trend helpers", () => {
  it("averages score categories and returns zero for empty scores", () => {
    expect(averageScore({ corpusCoverage: 0.9, noteQuality: 0.8, exerciseQuality: 1 })).toBeCloseTo(0.9);
    expect(averageScore({})).toBe(0);
  });

  it("rounds scores to four decimal places", () => {
    expect(roundedScore(0.123456)).toBe(0.1235);
    expect(roundedScore(0.8)).toBe(0.8);
  });

  it("selects the newest evaluation run for each language", () => {
    const olderAvenik = evaluationRun({
      id: "avenik-older",
      languageId: "avenik",
      createdAt: "2026-06-01T00:00:00.000Z",
      scores: { corpusCoverage: 0.75 }
    });
    const newestAvenik = evaluationRun({
      id: "avenik-newest",
      languageId: "avenik",
      createdAt: "2026-06-03T00:00:00.000Z",
      scores: { corpusCoverage: 0.95 }
    });
    const solari = evaluationRun({
      id: "solari-only",
      languageId: "solari",
      createdAt: "2026-06-02T00:00:00.000Z",
      scores: { noteQuality: 0.85 }
    });

    expect(latestRunsByLanguage([newestAvenik, solari, olderAvenik])).toEqual({
      avenik: newestAvenik,
      solari
    });
  });

  it("builds sorted language trends with rounded averages, deltas, and category deltas", () => {
    const trends = evaluationTrendsForRuns([
      evaluationRun({
        id: "solari-latest",
        languageId: "solari",
        createdAt: "2026-06-04T00:00:00.000Z",
        scores: { noteQuality: 0.733333 }
      }),
      evaluationRun({
        id: "avenik-previous",
        languageId: "avenik",
        createdAt: "2026-06-01T00:00:00.000Z",
        scores: { corpusCoverage: 0.7, noteQuality: 0.9 }
      }),
      evaluationRun({
        id: "avenik-latest",
        languageId: "avenik",
        createdAt: "2026-06-03T00:00:00.000Z",
        scores: { corpusCoverage: 0.9, exerciseQuality: 0.8 }
      })
    ]);

    expect(trends).toEqual([
      {
        languageId: "avenik",
        latestRunId: "avenik-latest",
        previousRunId: "avenik-previous",
        latestAverageScore: 0.85,
        previousAverageScore: 0.8,
        averageDelta: 0.05,
        status: "improved",
        categoryDeltas: {
          corpusCoverage: { latestScore: 0.9, previousScore: 0.7, delta: 0.2 },
          exerciseQuality: { latestScore: 0.8, previousScore: null, delta: null },
          noteQuality: { latestScore: 0, previousScore: 0.9, delta: -0.9 }
        }
      },
      {
        languageId: "solari",
        latestRunId: "solari-latest",
        previousRunId: null,
        latestAverageScore: 0.7333,
        previousAverageScore: null,
        averageDelta: null,
        status: "single-run",
        categoryDeltas: {
          noteQuality: { latestScore: 0.7333, previousScore: null, delta: null }
        }
      }
    ]);
  });
});
