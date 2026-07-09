/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dispatch, SetStateAction } from "react";
import { LearnerView } from "./views/LearnerView";
import type { PublicExercise } from "./lib/types";

const apiMock = vi.hoisted(() => ({
  fetchRecommendedExercises: vi.fn(),
  validateExerciseAuthoring: vi.fn()
}));

vi.mock("./api", () => apiMock);

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

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
    cleanup();
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
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
    const emptyState = within(panel).getByRole("status");
    expect(emptyState).toHaveAttribute("aria-live", "polite");
    expect(emptyState).toHaveTextContent(
      "Recommendations are empty even though exercises exist. Pick one from the list, or author another task below to grow the Practice next queue."
    );
    expect(within(panel).getByRole("button", { name: "Author an exercise" })).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Open Build" })).not.toBeInTheDocument();
  });

  it("offers author and Build CTAs when the language has no exercises", async () => {
    apiMock.fetchRecommendedExercises.mockResolvedValue({ exercises: [], rationale: [] });
    const onOpenBuild = vi.fn();
    const focusSpy = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();

    render(
      <LearnerView
        languageId="avenik"
        exercises={[]}
        isWorkflowBusy={false}
        onOpenBuild={onOpenBuild}
        learner={{
          selectedExercise: null,
          selectedExerciseId: null,
          setSelectedExerciseId: vi.fn(),
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

    const panel = await screen.findByRole("region", { name: "Practice next" });
    expect(within(panel).getByText("No exercises to recommend yet.")).toBeInTheDocument();
    expect(within(panel).getByText(
      "Author the first learner task below, or open Build to accept grammar drafts that can become practice."
    )).toBeInTheDocument();

    const promptField = screen.getByLabelText("Exercise prompt");
    promptField.focus = focusSpy;

    fireEvent.click(within(panel).getByRole("button", { name: "Author an exercise" }));
    expect(focusSpy).toHaveBeenCalled();

    fireEvent.click(within(panel).getByRole("button", { name: "Open Build" }));
    expect(onOpenBuild).toHaveBeenCalledTimes(1);

    const exerciseList = screen.getByRole("region", { name: "Exercise selector" });
    expect(within(exerciseList).getByRole("button", { name: "Author an exercise" })).toBeInTheDocument();
    expect(within(exerciseList).getByRole("button", { name: "Open Build" })).toBeInTheDocument();
  });

  it("surfaces a one-click next recommendation after grading", async () => {
    apiMock.fetchRecommendedExercises.mockResolvedValue({
      exercises: [fixtureExercises[1], fixtureExercises[2]],
      rationale: [
        { exerciseId: "avn-ex-002", status: "new", streak: 0 },
        { exerciseId: "avn-ex-003", status: "new", streak: 0 }
      ]
    });
    const onSelectExercise = vi.fn();

    render(
      <LearnerView
        languageId="avenik"
        exercises={fixtureExercises}
        isWorkflowBusy={false}
        learner={{
          selectedExercise: fixtureExercises[0],
          selectedExerciseId: fixtureExercises[0].id,
          setSelectedExerciseId: (value) => {
            const next = typeof value === "function" ? value(fixtureExercises[0].id) : value;
            onSelectExercise(next ?? "");
          },
          exerciseAnswer: "mira talo-mi-na",
          setExerciseAnswer: vi.fn(),
          isGrading: false,
          isLoadingSubmissions: false,
          exerciseResult: "Submission accepted.",
          setExerciseResult: vi.fn(),
          submissionHistory: [],
          setSubmissionHistory: vi.fn(),
          handleGrade: vi.fn(),
          handleCreateExercise: vi.fn(),
          handleGenerateExercise: vi.fn()
        }}
      />
    );

    const nextButton = await screen.findByRole("button", { name: "Practice next recommended" });
    const followup = nextButton.closest(".practice-grade-followup");
    expect(followup).not.toBeNull();
    expect(within(followup as HTMLElement).getByText("Translate: The child walks.")).toBeInTheDocument();
    fireEvent.click(nextButton);
    expect(onSelectExercise).toHaveBeenCalledWith("avn-ex-002");
    await waitFor(() => {
      expect(apiMock.fetchRecommendedExercises.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("marks grade and authoring actions busy while in flight", async () => {
    apiMock.fetchRecommendedExercises.mockResolvedValue({ exercises: [], rationale: [] });

    render(
      <LearnerView
        languageId="avenik"
        exercises={fixtureExercises}
        isWorkflowBusy={false}
        learner={{
          selectedExercise: fixtureExercises[0],
          selectedExerciseId: fixtureExercises[0].id,
          setSelectedExerciseId: vi.fn(),
          exerciseAnswer: "mira talo-mi-na",
          setExerciseAnswer: vi.fn(),
          isGrading: true,
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

    await screen.findByText("No practice recommendations yet.");

    const gradeButton = screen.getByRole("button", { name: "Grading..." });
    expect(gradeButton).toBeDisabled();
    expect(gradeButton).toHaveAttribute("aria-busy", "true");

    const history = screen.getByRole("region", { name: "Exercise submission history" });
    expect(within(history).getByText("No submissions yet.")).toBeInTheDocument();
    expect(within(history).getByText("Grade an answer above to start this history.")).toBeInTheDocument();
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
    apiMock.fetchRecommendedExercises.mockResolvedValue({ exercises: [], rationale: [] });
    renderLearnerView({ exercises: [], selectedExercise: null });

    const exerciseList = screen.getByRole("region", { name: "Exercise selector" });
    expect(within(exerciseList).getByText(
      "No exercises yet. Author one below, or open Build to accept grammar drafts that can become practice tasks."
    )).toBeInTheDocument();
    expect(within(exerciseList).getByText("0 exercises")).toBeInTheDocument();
    expect(within(exerciseList).getByRole("button", { name: "Author an exercise" })).toBeInTheDocument();

    const detailPanel = screen.getByRole("region", { name: "Exercise detail panel" });
    const detailEmpty = within(detailPanel).getByRole("status");
    expect(detailEmpty).toHaveAttribute("aria-live", "polite");
    expect(detailEmpty).toHaveTextContent("No exercise to practice yet.");
    expect(detailEmpty).toHaveTextContent(
      "Fill the authoring form below to create the first task, or open Build to accept grammar drafts that can become practice."
    );
    expect(within(detailPanel).queryByText("Select an exercise from the list or author one below.")).not.toBeInTheDocument();
    expect(within(detailPanel).getByRole("button", { name: "Author an exercise" })).toBeInTheDocument();
    expect(within(detailPanel).getByText("No learner tasks yet. Fill the form below, validate without saving, then create the exercise.")).toBeInTheDocument();
    expect(within(detailPanel).getByText("Validate checks rules and answer keys without creating an exercise.")).toBeInTheDocument();
  });

  it("shows a dry-run success notice without creating an exercise", async () => {
    apiMock.fetchRecommendedExercises.mockResolvedValue({ exercises: [], rationale: [] });
    apiMock.validateExerciseAuthoring.mockResolvedValue({
      ok: true,
      errors: [],
      warnings: [],
      preview: {
        expectedAnswers: ["mira talo-mi-na"],
        adversarialAnswers: [
          { answer: "talo-mi-na mira", reason: "Verb-first order." },
          { answer: "mira talo-na-mi", reason: "Suffix order drift." },
          { answer: "talo mira-mi-na", reason: "Splits the verb chain." }
        ]
      }
    });

    renderLearnerView({ exercises: [], selectedExercise: null });

    fireEvent.change(screen.getByLabelText("Exercise prompt"), {
      target: { value: "Translate into Avenik: I walk by the river." }
    });
    fireEvent.change(screen.getByLabelText("Allowed vocabulary"), {
      target: { value: "mira, talo, -mi, -na" }
    });
    fireEvent.click(screen.getByText("Advanced: paste note IDs"));
    fireEvent.change(screen.getByLabelText("Allowed rule IDs"), {
      target: { value: "avn-rule-verb-chain" }
    });
    fireEvent.change(screen.getByLabelText("Expected answers"), {
      target: { value: "mira talo-mi-na" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial answer 1"), {
      target: { value: "talo-mi-na mira" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial reason 1"), {
      target: { value: "Verb-first order." }
    });
    fireEvent.change(screen.getByLabelText("Adversarial answer 2"), {
      target: { value: "mira talo-na-mi" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial reason 2"), {
      target: { value: "Suffix order drift." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Add probe" }));
    fireEvent.change(screen.getByLabelText("Adversarial answer 3"), {
      target: { value: "talo mira-mi-na" }
    });
    fireEvent.change(screen.getByLabelText("Adversarial reason 3"), {
      target: { value: "Splits the verb chain." }
    });
    fireEvent.change(screen.getByLabelText("Grading explanation"), {
      target: { value: "Use mira for river and talo for walk." }
    });

    fireEvent.click(screen.getByRole("button", { name: "Validate exercise authoring" }));

    await waitFor(() => expect(apiMock.validateExerciseAuthoring).toHaveBeenCalledTimes(1));
    expect(apiMock.validateExerciseAuthoring).toHaveBeenCalledWith("avenik", expect.objectContaining({
      adversarialAnswers: [
        { answer: "talo-mi-na mira", reason: "Verb-first order." },
        { answer: "mira talo-na-mi", reason: "Suffix order drift." },
        { answer: "talo mira-mi-na", reason: "Splits the verb chain." }
      ]
    }));
    const authoringForm = screen.getByRole("form", { name: "Exercise authoring" });
    const dryRunStatus = await within(authoringForm).findByRole("status");
    expect(dryRunStatus).toHaveTextContent("Dry-run only — nothing saved yet.");
    expect(dryRunStatus).toHaveTextContent(
      "Validation passed: 1 expected answers and 3 adversarial probes ready to save."
    );
  });

  it("keeps at least two adversarial probe rows and can remove extras", () => {
    apiMock.fetchRecommendedExercises.mockResolvedValue({ exercises: [], rationale: [] });
    renderLearnerView({ exercises: [], selectedExercise: null });

    const authoringForm = screen.getByRole("form", { name: "Exercise authoring" });
    expect(within(authoringForm).getByLabelText("Adversarial answer 1")).toBeInTheDocument();
    expect(within(authoringForm).getByLabelText("Adversarial answer 2")).toBeInTheDocument();
    expect(within(authoringForm).queryByRole("button", { name: "Remove probe" })).not.toBeInTheDocument();

    fireEvent.click(within(authoringForm).getByRole("button", { name: "Add probe" }));
    expect(within(authoringForm).getByLabelText("Adversarial answer 3")).toBeInTheDocument();
    const removeButtons = within(authoringForm).getAllByRole("button", { name: "Remove probe" });
    expect(removeButtons).toHaveLength(3);

    fireEvent.click(removeButtons[2]!);
    expect(within(authoringForm).queryByLabelText("Adversarial answer 3")).not.toBeInTheDocument();
    expect(within(authoringForm).queryByRole("button", { name: "Remove probe" })).not.toBeInTheDocument();
  });
});
