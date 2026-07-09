import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dispatch, SetStateAction } from "react";
import { LearnerView } from "./views/LearnerView";
import type { PublicExercise } from "./lib/types";

const apiMock = vi.hoisted(() => ({
  fetchRecommendedExercises: vi.fn()
}));

vi.mock("./api", () => apiMock);

function createExercise(id: string, prompt: string): PublicExercise {
  return {
    id,
    languageId: "avenik",
    type: "translate_to_target",
    prompt,
    allowedVocabulary: ["mira", "talo"],
    allowedRuleIds: ["avn-rule-verb-chain"]
  };
}

const fixtureExercises = [
  createExercise("avn-ex-001", "Translate: I walk by the river."),
  createExercise("avn-ex-002", "Translate: The child walks."),
  createExercise("avn-ex-003", "Translate: The river flows."),
  createExercise("avn-ex-004", "Translate: I see the river.")
];

function renderLearnerView(overrides: {
  onSelectExercise?: (exerciseId: string) => void;
  languageId?: string | null;
  exercises?: PublicExercise[];
  selectedExercise?: PublicExercise | null;
} = {}) {
  const exercises = overrides.exercises ?? fixtureExercises;
  const selectedExercise = overrides.selectedExercise === undefined ? exercises[0] ?? null : overrides.selectedExercise;
  const setSelectedExerciseId: Dispatch<SetStateAction<string | null>> = (value) => {
    const next = typeof value === "function" ? value(selectedExercise?.id ?? null) : value;
    overrides.onSelectExercise?.(next ?? "");
  };

  return render(
    <LearnerView
      languageId={overrides.languageId === undefined ? "avenik" : overrides.languageId}
      exercises={exercises}
      isWorkflowBusy={false}
      learner={{
        selectedExercise,
        selectedExerciseId: selectedExercise?.id ?? null,
        setSelectedExerciseId: overrides.onSelectExercise ? setSelectedExerciseId : vi.fn(),
        exerciseAnswer: "",
        setExerciseAnswer: vi.fn(),
        isGrading: false,
        isLoadingSubmissions: false,
        exerciseResult: null,
        setExerciseResult: vi.fn(),
        submissionHistory: [],
        setSubmissionHistory: vi.fn(),
        handleGrade: vi.fn(),
        handleCreateExercise: vi.fn(),
        handleGenerateExercise: vi.fn()
      }}
    />
  );
}

describe("LearnerView practice next panel", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows up to three recommended exercises with status badges", async () => {
    apiMock.fetchRecommendedExercises.mockResolvedValue({
      exercises: fixtureExercises,
      rationale: [
        { exerciseId: "avn-ex-001", status: "new", streak: 0 },
        { exerciseId: "avn-ex-002", status: "overdue", dueAt: "2026-06-10T00:00:00.000Z", streak: 1 },
        { exerciseId: "avn-ex-003", status: "scheduled", dueAt: "2026-06-13T00:00:00.000Z", streak: 2 },
        { exerciseId: "avn-ex-004", status: "new", streak: 0 }
      ]
    });

    renderLearnerView();

    const panel = await screen.findByRole("region", { name: "Practice next" });
    await waitFor(() => {
      expect(within(panel).getAllByRole("button", { name: "Practice" })).toHaveLength(3);
    });
    expect(apiMock.fetchRecommendedExercises).toHaveBeenCalledWith("avenik");
    expect(within(panel).getByText("New")).toBeInTheDocument();
    expect(within(panel).getByText("Overdue")).toBeInTheDocument();
    expect(within(panel).getByText("Scheduled")).toBeInTheDocument();
    expect(within(panel).getByText("Translate: I walk by the river.")).toBeInTheDocument();
    // Fourth recommendation is cut off at three.
    expect(within(panel).queryByText("Translate: I see the river.")).not.toBeInTheDocument();
  });

  it("selects the recommended exercise when its button is clicked", async () => {
    apiMock.fetchRecommendedExercises.mockResolvedValue({
      exercises: [fixtureExercises[1]],
      rationale: [{ exerciseId: "avn-ex-002", status: "overdue", dueAt: "2026-06-10T00:00:00.000Z", streak: 1 }]
    });
    const onSelectExercise = vi.fn();

    renderLearnerView({ onSelectExercise });

    const panel = await screen.findByRole("region", { name: "Practice next" });
    const button = await within(panel).findByRole("button", { name: "Practice" });
    fireEvent.click(button);

    expect(onSelectExercise).toHaveBeenCalledWith("avn-ex-002");
  });

  it("shows a loading state while recommendations are in flight", async () => {
    apiMock.fetchRecommendedExercises.mockReturnValue(new Promise(() => undefined));

    renderLearnerView();

    const panel = screen.getByRole("region", { name: "Practice next" });
    expect(within(panel).getByText("Loading practice recommendations.")).toBeInTheDocument();
  });

  it("shows an empty state when there are no recommendations", async () => {
    apiMock.fetchRecommendedExercises.mockResolvedValue({ exercises: [], rationale: [] });

    renderLearnerView();

    const panel = screen.getByRole("region", { name: "Practice next" });
    expect(await within(panel).findByText("No practice recommendations yet.")).toBeInTheDocument();
  });

  it("shows an error state when loading recommendations fails", async () => {
    apiMock.fetchRecommendedExercises.mockRejectedValue(new Error("Request failed: recommended (500)"));

    renderLearnerView();

    const panel = screen.getByRole("region", { name: "Practice next" });
    expect(await within(panel).findByRole("alert")).toHaveTextContent("Request failed: recommended (500)");
  });

  it("does not request recommendations without a selected language", () => {
    renderLearnerView({ languageId: null });

    expect(apiMock.fetchRecommendedExercises).not.toHaveBeenCalled();
  });

  it("shows empty exercise list and detail states when the language has no exercises", () => {
    renderLearnerView({ exercises: [], selectedExercise: null });

    const exerciseList = screen.getByRole("region", { name: "Exercise selector" });
    expect(within(exerciseList).getByText("No exercises available.")).toBeInTheDocument();
    expect(within(exerciseList).getByText("0 exercises")).toBeInTheDocument();

    const detailPanel = screen.getByRole("region", { name: "Exercise detail panel" });
    expect(within(detailPanel).getAllByText("No exercises available.")).toHaveLength(1);
  });
});
