/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LearnerWorkspace } from "./hooks/useLearnerWorkspace";
import { LearnerView } from "./views/LearnerView";
import type { PublicExercise, PublicNote } from "./lib/types";

const apiMock = vi.hoisted(() => ({
  fetchRecommendedExercises: vi.fn(),
  validateExerciseAuthoring: vi.fn()
}));

vi.mock("./api", () => apiMock);

const fixtureNotes: PublicNote[] = [
  {
    id: "avn-rule-verb-chain-note",
    languageId: "avenik",
    topic: "verb chains",
    explanation: "Avenik verbs use transparent suffix chains.",
    examples: [],
    evidencePassageIds: ["avn-c001"],
    evidenceCount: 1,
    confidence: "high",
    status: "draft",
    reviewer: {
      lastReviewedBy: null,
      lastReviewedAt: null,
      comments: []
    },
    dialectScope: "baseline",
    editHistory: []
  },
  {
    id: "avn-rule-case-note",
    languageId: "avenik",
    topic: "case particles",
    explanation: "Avenik marks oblique roles with postposed particles.",
    examples: [],
    evidencePassageIds: ["avn-c004"],
    evidenceCount: 1,
    confidence: "medium",
    status: "under_review",
    reviewer: {
      lastReviewedBy: null,
      lastReviewedAt: null,
      comments: []
    },
    dialectScope: "baseline",
    editHistory: []
  }
];

function createLearnerStub(overrides: Partial<LearnerWorkspace> = {}): LearnerWorkspace {
  return {
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
    handleGrade: vi.fn(async () => undefined),
    handleCreateExercise: vi.fn(async () => undefined),
    handleGenerateExercise: vi.fn(async () => ({
      exercise: {
        type: "translate_to_target",
        prompt: "",
        allowedVocabulary: [],
        allowedRuleIds: [],
        expectedAnswers: [],
        adversarialAnswers: [],
        gradingExplanation: ""
      },
      warnings: []
    })),
    ...overrides
  };
}

function fillRequiredAuthoringFields() {
  fireEvent.change(screen.getByLabelText("Exercise prompt"), {
    target: { value: "Translate into Avenik: I walk by the river." }
  });
  fireEvent.change(screen.getByLabelText("Allowed vocabulary"), {
    target: { value: "mira, talo, -mi, -na" }
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
  fireEvent.change(screen.getByLabelText("Grading explanation"), {
    target: { value: "Use mira for river and talo for walk with the present chain." }
  });
}

describe("LearnerView rule/note picker", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists grammar notes and sends selected note ids on validate dry-run", async () => {
    apiMock.fetchRecommendedExercises.mockResolvedValue({ exercises: [], rationale: [] });
    apiMock.validateExerciseAuthoring.mockResolvedValue({
      ok: true,
      errors: [],
      warnings: [],
      preview: {
        expectedAnswers: ["mira talo-mi-na"],
        adversarialAnswers: [
          { answer: "talo-mi-na mira", reason: "Verb-first order." },
          { answer: "mira talo-na-mi", reason: "Suffix order drift." }
        ]
      }
    });

    render(
      <LearnerView
        languageId="avenik"
        exercises={[] as PublicExercise[]}
        notes={fixtureNotes}
        isWorkflowBusy={false}
        learner={createLearnerStub()}
      />
    );

    const picker = await screen.findByRole("group", { name: "Allowed grammar notes" });
    expect(within(picker).getByText("verb chains")).toBeInTheDocument();
    expect(within(picker).getByText("avn-rule-verb-chain-note")).toBeInTheDocument();
    expect(within(picker).getByText("case particles")).toBeInTheDocument();

    fillRequiredAuthoringFields();
    fireEvent.click(screen.getByRole("checkbox", { name: /verb chains/i }));
    fireEvent.click(screen.getByRole("button", { name: "Validate exercise authoring" }));

    await waitFor(() => expect(apiMock.validateExerciseAuthoring).toHaveBeenCalledTimes(1));
    expect(apiMock.validateExerciseAuthoring).toHaveBeenCalledWith(
      "avenik",
      expect.objectContaining({
        allowedRuleIds: ["avn-rule-verb-chain-note"]
      })
    );
  });

  it("merges checkbox selection with advanced pasted note ids on create", async () => {
    apiMock.fetchRecommendedExercises.mockResolvedValue({ exercises: [], rationale: [] });
    const handleCreateExercise = vi.fn().mockResolvedValue(undefined);

    render(
      <LearnerView
        languageId="avenik"
        exercises={[] as PublicExercise[]}
        notes={fixtureNotes}
        isWorkflowBusy={false}
        learner={createLearnerStub({ handleCreateExercise })}
      />
    );

    expect(await screen.findByRole("group", { name: "Allowed grammar notes" })).toBeInTheDocument();
    fillRequiredAuthoringFields();
    fireEvent.click(screen.getByRole("checkbox", { name: /case particles/i }));

    fireEvent.click(screen.getByText("Advanced: paste note IDs"));
    fireEvent.change(screen.getByLabelText("Allowed rule IDs"), {
      target: { value: "avn-rule-verb-chain-note" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Create exercise" }));

    await waitFor(() => expect(handleCreateExercise).toHaveBeenCalledTimes(1));
    expect(handleCreateExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedRuleIds: ["avn-rule-case-note", "avn-rule-verb-chain-note"]
      })
    );
  });

  it("pre-fills known draft rule ids into the checkbox picker", async () => {
    apiMock.fetchRecommendedExercises.mockResolvedValue({ exercises: [], rationale: [] });
    const handleGenerateExercise = vi.fn().mockResolvedValue({
      exercise: {
        type: "translate_to_target",
        prompt: "Translate into Avenik: The child sleeps.",
        allowedVocabulary: ["nemi", "lo", "-ki"],
        allowedRuleIds: ["avn-rule-verb-chain-note", "unknown-rule"],
        expectedAnswers: ["nemi lo-ki"],
        adversarialAnswers: [
          { answer: "lo-ki nemi", reason: "Fronts the verb." },
          { answer: "nemi-ki lo", reason: "Wrong stem." }
        ],
        gradingExplanation: "Use nemi for child and lo for sleep with the -ki present suffix."
      },
      warnings: []
    });

    render(
      <LearnerView
        languageId="avenik"
        exercises={[] as PublicExercise[]}
        notes={fixtureNotes}
        isWorkflowBusy={false}
        learner={createLearnerStub({ handleGenerateExercise })}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Generate with model" }));

    await waitFor(() => expect(handleGenerateExercise).toHaveBeenCalled());
    expect(screen.getByRole("checkbox", { name: /verb chains/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /case particles/i })).not.toBeChecked();
    expect(screen.getByLabelText("Allowed rule IDs")).toHaveValue("unknown-rule");
  });
});
