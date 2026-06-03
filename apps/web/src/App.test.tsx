import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const apiMock = vi.hoisted(() => ({
  fetchDashboardData: vi.fn(),
  fetchExerciseSubmissions: vi.fn(),
  runEvaluation: vi.fn(),
  reviewNote: vi.fn(),
  submitExerciseAnswer: vi.fn()
}));

vi.mock("./api", () => apiMock);

function createDashboardData() {
  return {
    languages: [
      {
        id: "avenik",
        name: "Avenik",
        typology: "agglutinative",
        description: "Synthetic agglutinative language.",
        orthography: "Latin",
        status: "synthetic",
        fixtureSource: "test"
      },
      {
        id: "solari",
        name: "Solari",
        typology: "isolating",
        description: "Synthetic isolating language.",
        orthography: "Latin",
        status: "synthetic",
        fixtureSource: "test"
      }
    ],
    corpus: [],
    notes: [
      {
        id: "avn-rule-verb-chain-note",
        languageId: "avenik",
        topic: "verb chains",
        explanation: "Avenik verbs use transparent suffix chains.",
        examples: [
          {
            passageId: "avn-c001",
            target: "mira talo-mi-na",
            translation: "I walk by the river."
          }
        ],
        evidencePassageIds: ["avn-c001"],
        evidenceCount: 1,
        confidence: "high",
        status: "draft",
        reviewer: {
          lastReviewedBy: "mentor-reviewer",
          lastReviewedAt: "2026-06-02T15:30:00.000Z",
          comments: ["Check suffix boundaries before approval."]
        },
        dialectScope: "synthetic baseline",
        editHistory: [
          {
            at: "2026-06-01T12:00:00.000Z",
            by: "draft-agent",
            action: "drafted",
            summary: "Generated from the Avenik grammar fixture."
          }
        ]
      },
      {
        id: "avn-rule-case-note",
        languageId: "avenik",
        topic: "case particles",
        explanation: "Avenik marks oblique roles with postposed particles.",
        examples: [
          {
            passageId: "avn-c004",
            target: "sela mora-ke",
            translation: "The child is near the house."
          }
        ],
        evidencePassageIds: ["avn-c004", "avn-c005"],
        evidenceCount: 2,
        confidence: "medium",
        status: "under_review",
        reviewer: {
          lastReviewedBy: null,
          lastReviewedAt: null,
          comments: []
        },
        dialectScope: "synthetic baseline",
        editHistory: [
          {
            at: "2026-06-01T13:00:00.000Z",
            by: "draft-agent",
            action: "revised",
            summary: "Added a second evidence passage."
          }
        ]
      }
    ],
    exercises: [
      {
        id: "avn-ex001",
        languageId: "avenik",
        type: "translate_to_target",
        prompt: "Translate: I walk by the river.",
        allowedVocabulary: ["mira", "talo", "-mi", "-na"],
        allowedRuleIds: ["avn-rule-verb-chain"],
        gradingExplanation: "Use mira for river, talo for walk, -mi for present, and -na for first person singular."
      },
      {
        id: "avn-ex002",
        languageId: "avenik",
        type: "segment",
        prompt: "Segment: nemi-lo-ki",
        allowedVocabulary: ["nemi", "-lo", "-ki"],
        allowedRuleIds: ["avn-rule-verb-chain"],
        gradingExplanation: "Split the verb stem from past tense and third-person singular suffixes."
      }
    ],
    evaluations: []
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

describe("App", () => {
  beforeEach(() => {
    apiMock.fetchExerciseSubmissions.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the main synthetic data surfaces", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.runEvaluation.mockResolvedValue([]);

    render(<App />);
    expect(await screen.findByText("Synthetic Language Evaluation")).toBeInTheDocument();
    expect(await screen.findByText("Corpus Browser")).toBeInTheDocument();
    expect(await screen.findByText("Note Review Queue")).toBeInTheDocument();
    expect(await screen.findByText("Evaluation Dashboard")).toBeInTheDocument();
    expect(await screen.findByText("Learner Exercise Preview")).toBeInTheDocument();
    const languageSelector = screen.getByRole("region", { name: "Language selector" });
    expect(within(languageSelector).getByRole("button", { name: /Avenik/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(languageSelector).getByRole("button", { name: /Solari/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("announces loading state through a live status region", async () => {
    const initialLoad = createDeferred<ReturnType<typeof createDashboardData>>();
    apiMock.fetchDashboardData.mockReturnValue(initialLoad.promise);

    render(<App />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Loading synthetic data...");

    initialLoad.resolve(createDashboardData());
    expect(await screen.findByText("Corpus Browser")).toBeInTheDocument();
  });

  it("announces load errors through an alert region", async () => {
    apiMock.fetchDashboardData.mockRejectedValue(new Error("Synthetic data unavailable"));

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic data unavailable");
  });

  it("disables language switching while an evaluation refresh is in flight", async () => {
    const evaluationRun = createDeferred<unknown[]>();
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.runEvaluation.mockReturnValue(evaluationRun.promise);

    render(<App />);

    const solariButton = await screen.findByRole("button", { name: /Solari/ });
    fireEvent.click(screen.getByRole("button", { name: "Run Evaluation" }));

    await waitFor(() => expect(solariButton).toBeDisabled());

    fireEvent.click(solariButton);

    expect(apiMock.fetchDashboardData).not.toHaveBeenCalledWith("solari");

    evaluationRun.resolve([]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Evaluation" })).toBeEnabled());
  });

  const reviewActionCases = [
    {
      action: "approval",
      buttonName: "Approve verb chains",
      reviewerComment: "Approved in local prototype.",
      status: "approved"
    },
    {
      action: "contest",
      buttonName: "Contest verb chains",
      reviewerComment: "Contested in local prototype.",
      status: "contested"
    }
  ] as const;

  it.each(reviewActionCases)("submits note $action actions and refreshes the selected language", async (reviewCase) => {
    const data = createDashboardData();
    apiMock.fetchDashboardData.mockResolvedValue(data);
    apiMock.reviewNote.mockResolvedValue({ ...data.notes[0], status: reviewCase.status });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: reviewCase.buttonName }));

    await waitFor(() =>
      expect(apiMock.reviewNote).toHaveBeenCalledWith("avn-rule-verb-chain-note", {
        status: reviewCase.status,
        reviewerComment: reviewCase.reviewerComment
      })
    );
    expect(apiMock.fetchDashboardData).toHaveBeenLastCalledWith("avenik");
  });

  it("shows selected note examples, evidence, reviewer info, comments, and edit history", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());

    render(<App />);

    const detail = await screen.findByRole("article", { name: "Selected note detail" });
    expect(await screen.findByRole("heading", { name: "verb chains" })).toBeInTheDocument();
    expect(within(detail).getByText("mira talo-mi-na")).toBeInTheDocument();
    expect(within(detail).getByText("I walk by the river.")).toBeInTheDocument();
    expect(within(detail).getByText("1 evidence link")).toBeInTheDocument();
    expect(within(detail).getByText("avn-c001")).toBeInTheDocument();
    expect(within(detail).getByText("mentor-reviewer")).toBeInTheDocument();
    expect(within(detail).getByText("2026-06-02T15:30:00.000Z")).toBeInTheDocument();
    expect(within(detail).getByText("Check suffix boundaries before approval.")).toBeInTheDocument();
    expect(within(detail).getByText("draft-agent")).toBeInTheDocument();
    expect(within(detail).getByText("Generated from the Avenik grammar fixture.")).toBeInTheDocument();
  });

  it("switches the note detail panel when another note is selected", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /case particles/ }));

    const detail = screen.getByRole("article", { name: "Selected note detail" });
    expect(within(detail).getByRole("heading", { name: "case particles" })).toBeInTheDocument();
    expect(within(detail).getByText("sela mora-ke")).toBeInTheDocument();
    expect(within(detail).getByText("2 evidence links")).toBeInTheDocument();
    expect(within(detail).getByText("avn-c004")).toBeInTheDocument();
    expect(within(detail).getByText("avn-c005")).toBeInTheDocument();
    expect(within(detail).getByText("Added a second evidence passage.")).toBeInTheDocument();
  });

  it("disables language switching while a note review refresh is in flight", async () => {
    const review = createDeferred<unknown>();
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.reviewNote.mockReturnValue(review.promise);

    render(<App />);

    const solariButton = await screen.findByRole("button", { name: /Solari/ });
    fireEvent.click(screen.getByRole("button", { name: "Approve verb chains" }));

    await waitFor(() => expect(solariButton).toBeDisabled());

    fireEvent.click(solariButton);

    expect(apiMock.fetchDashboardData).not.toHaveBeenCalledWith("solari");

    review.resolve({});
    await waitFor(() => expect(solariButton).toBeEnabled());
  });

  it("submits learner exercise answers through the API", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.submitExerciseAnswer.mockResolvedValue({
      accepted: true,
      explanation: "Use mira for river, talo for walk, -mi for present, and -na for first person singular."
    });

    render(<App />);

    const answerBox = await screen.findByLabelText("Exercise answer");
    fireEvent.change(answerBox, { target: { value: "mira talo-mi-na" } });
    fireEvent.click(screen.getByRole("button", { name: "Grade" }));

    await waitFor(() => expect(apiMock.submitExerciseAnswer).toHaveBeenCalledWith("avn-ex001", "mira talo-mi-na"));
    expect(
      await screen.findByText("Use mira for river, talo for walk, -mi for present, and -na for first person singular.")
    ).toBeInTheDocument();
  });

  it("shows sanitized exercise submission history and refreshes it after grading", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());
    apiMock.fetchExerciseSubmissions
      .mockResolvedValueOnce([
        {
          id: "submission-1",
          exerciseId: "avn-ex001",
          languageId: "avenik",
          accepted: false,
          explanation: "Answer did not match the synthetic exercise key.",
          submittedAt: "2026-06-03T15:00:00.000Z",
          learnerId: "local-learner"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "submission-2",
          exerciseId: "avn-ex001",
          languageId: "avenik",
          accepted: true,
          explanation: "Accepted synthetic exercise submission.",
          submittedAt: "2026-06-03T15:01:00.000Z",
          learnerId: "local-learner"
        }
      ]);
    apiMock.submitExerciseAnswer.mockResolvedValue({
      accepted: true,
      explanation: "Use mira for river, talo for walk, -mi for present, and -na for first person singular."
    });

    render(<App />);

    const history = await screen.findByRole("region", { name: "Exercise submission history" });
    expect(await within(history).findByText("Answer did not match the synthetic exercise key.")).toBeInTheDocument();
    expect(within(history).queryByText("mira talo-mi-na")).not.toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText("Exercise answer"), { target: { value: "mira talo-mi-na" } });
    fireEvent.click(screen.getByRole("button", { name: "Grade" }));

    await waitFor(() => expect(apiMock.fetchExerciseSubmissions).toHaveBeenLastCalledWith("avn-ex001"));
    expect(await within(history).findByText("Accepted synthetic exercise submission.")).toBeInTheDocument();
    expect(within(history).queryByText("mira talo-mi-na")).not.toBeInTheDocument();
  });

  it("switches learner exercise selection and loads that exercise history", async () => {
    apiMock.fetchDashboardData.mockResolvedValue(createDashboardData());

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Segment: nemi-lo-ki/ }));

    expect(await screen.findByRole("heading", { name: "Segment: nemi-lo-ki" })).toBeInTheDocument();
    await waitFor(() => expect(apiMock.fetchExerciseSubmissions).toHaveBeenLastCalledWith("avn-ex002"));
  });
});
