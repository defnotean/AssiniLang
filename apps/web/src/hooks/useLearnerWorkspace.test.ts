/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardData } from "../api";
import { ApiError } from "../lib/apiClient";
import { useLearnerWorkspace } from "./useLearnerWorkspace";

const submitExerciseAnswer = vi.fn();
const fetchExerciseSubmissions = vi.fn();

vi.mock("../api", () => ({
  submitExerciseAnswer: (...args: unknown[]) => submitExerciseAnswer(...args),
  fetchExerciseSubmissions: (...args: unknown[]) => fetchExerciseSubmissions(...args),
  createExercise: vi.fn(),
  generateModelExercise: vi.fn()
}));

vi.mock("../i18n", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        "learner.errSubmissionFailed": "Exercise submission failed",
        "app.sessionExpired":
          "Your local session expired. Sign out from the sidebar and reload, or press Retry to open a fresh session.",
        "errors.invalidPrototypeSessionBody": "Choose a valid local prototype user before signing in."
      };
      return messages[key] ?? key;
    }
  })
}));

describe("useLearnerWorkspace", () => {
  beforeEach(() => {
    submitExerciseAnswer.mockReset();
    fetchExerciseSubmissions.mockReset();
    fetchExerciseSubmissions.mockResolvedValue([]);
  });

  it("localizes grade failures instead of surfacing raw API English", async () => {
    submitExerciseAnswer.mockRejectedValue(
      new ApiError("Request failed: /exercises/ex-1/submissions (401): Unauthorized", { status: 401 })
    );

    const data: DashboardData = {
      languages: [],
      corpus: [],
      notes: [],
      exercises: [
        {
          id: "ex-1",
          languageId: "lang-1",
          type: "translate_to_target",
          prompt: "Translate",
          allowedVocabulary: [],
          allowedRuleIds: []
        }
      ],
      evaluations: []
    };

    const { result } = renderHook(() => useLearnerWorkspace("learner", "lang-1", data, async () => undefined));

    await waitFor(() => {
      expect(result.current.selectedExercise?.id).toBe("ex-1");
    });

    await act(async () => {
      result.current.setExerciseAnswer("answer");
    });
    await act(async () => {
      await result.current.handleGrade();
    });

    expect(result.current.exerciseResult).toBe(
      "Your local session expired. Sign out from the sidebar and reload, or press Retry to open a fresh session."
    );
  });
});
