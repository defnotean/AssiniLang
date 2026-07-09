import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DashboardData } from "./api/languageApi";
import type { ElderContext } from "./api/elderApi";
import type { ElderWorkspaceState } from "./hooks/useElderWorkspace";
import { ElderPage } from "./views/ElderPage";

function createDashboardData(): DashboardData {
  return {
    languages: [
      {
        id: "avenik",
        name: "Avenik",
        typology: "agglutinative",
        description: "Agglutinative test language.",
        orthography: "Latin",
        status: "active"
      }
    ],
    corpus: [
      {
        id: "avn-c001",
        languageId: "avenik",
        source: "field-recording",
        sourceMetadata: {
          author: "fixture-author",
          year: 2026,
          license: "cc-by",
          consentRecord: "community-consent-001"
        },
        textTarget: "mira talo-mi-na",
        textTranslation: "I walk by the river.",
        morphologicalSegmentation: [],
        topicTags: ["movement"],
        consentStatus: { use: "testing-only", restrictions: [] }
      }
    ],
    notes: [
      {
        id: "avn-rule-verb-chain-note",
        languageId: "avenik",
        topic: "verb chains",
        explanation: "Avenik verbs use transparent suffix chains.",
        examples: [],
        evidencePassageIds: [],
        evidenceCount: 0,
        confidence: "high",
        status: "approved",
        reviewer: {
          lastReviewedBy: "mentor-reviewer",
          lastReviewedAt: "2026-06-02T15:30:00.000Z",
          comments: []
        },
        dialectScope: "baseline",
        editHistory: []
      }
    ],
    exercises: [],
    evaluations: []
  };
}

function createElderContext(): ElderContext {
  const data = createDashboardData();
  return {
    language: data.languages[0]!,
    corpus: data.corpus,
    notes: data.notes,
    corrections: [],
    governance: []
  };
}

function createElderState(overrides: Partial<ElderWorkspaceState> = {}): ElderWorkspaceState {
  return {
    elderContext: createElderContext(),
    isLoadingElder: false,
    correctionSuccess: null,
    correctionError: null,
    formNoteId: "",
    setFormNoteId: vi.fn(),
    formPassageId: "",
    setFormPassageId: vi.fn(),
    formSeverity: "minor",
    setFormSeverity: vi.fn(),
    formCorrection: "",
    setFormCorrection: vi.fn(),
    formRationale: "",
    setFormRationale: vi.fn(),
    formContextText: "",
    setFormContextText: vi.fn(),
    isSubmittingCorrection: false,
    reviewingCorrectionId: null,
    applyingCorrectionId: null,
    correctionApplyDrafts: {},
    setCorrectionApplyDrafts: vi.fn(),
    handleSubmitCorrection: vi.fn(),
    handleReviewCorrection: vi.fn(),
    handleApplyCorrection: vi.fn(),
    reloadElderContext: vi.fn(),
    ...overrides
  };
}

describe("ElderPage loading and empty states", () => {
  it("shows a calm loading card while elder context loads", () => {
    render(
      <ElderPage
        elder={createElderState({ isLoadingElder: true, elderContext: null })}
        data={createDashboardData()}
        isWorkflowBusy={false}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("One moment…");
    expect(screen.queryByText("Suggest a fix")).not.toBeInTheDocument();
  });

  it("shows an empty suggestions message and a retry action on load failure", () => {
    const reloadElderContext = vi.fn();
    render(
      <ElderPage
        elder={createElderState({
          elderContext: null,
          correctionError: "Could not load elder suggestions.",
          reloadElderContext
        })}
        data={createDashboardData()}
        isWorkflowBusy={false}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load elder suggestions.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(reloadElderContext).toHaveBeenCalledTimes(1);
    const emptyState = screen.getByText("No suggestions yet.").closest("[role='status']");
    expect(emptyState).toBeTruthy();
    expect(emptyState).toHaveAttribute("aria-live", "polite");
    expect(emptyState).toHaveTextContent(
      "Use the three steps above to point at a lesson or sentence, write the fix and reason, then send your first correction."
    );
  });

  it("shows next-step guidance when the suggestions list is empty", () => {
    render(
      <ElderPage
        elder={createElderState()}
        data={createDashboardData()}
        isWorkflowBusy={false}
      />
    );

    const emptyState = screen.getByText("No suggestions yet.").closest("[role='status']");
    expect(emptyState).toHaveClass("empty-state");
    expect(emptyState).toHaveAttribute("aria-live", "polite");
    expect(emptyState).toHaveTextContent(/three steps above/);
  });
});

describe("ElderPage correction submit busy guard", () => {
  it("disables send and marks the button busy while a correction submit is in flight", () => {
    render(
      <ElderPage
        elder={createElderState({
          formContextText: "mira talo-mi-na",
          formCorrection: "Use -na for locative.",
          formRationale: "That is how elders say it.",
          isSubmittingCorrection: true
        })}
        data={createDashboardData()}
        isWorkflowBusy={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const sendButton = screen.getByRole("button", { name: "Sending…" });
    expect(sendButton).toBeDisabled();
    expect(sendButton).toHaveAttribute("aria-busy", "true");
  });
});

describe("ElderPage review and apply busy guards", () => {
  it("marks approve and set-aside busy while a pending correction is reviewing", () => {
    const data = createDashboardData();
    const elderContext = createElderContext();
    elderContext.corrections = [
      {
        id: "corr-1",
        languageId: "avenik",
        noteId: data.notes[0]!.id,
        correction: "Use -na for locative.",
        rationale: "That is how elders say it.",
        severity: "minor",
        status: "pending_review",
        proposedBy: "elder-1",
        proposedAt: "2026-06-06T00:00:00.000Z",
        reviewedBy: null,
        reviewedAt: null
      }
    ];

    render(
      <ElderPage
        elder={createElderState({
          elderContext,
          reviewingCorrectionId: "corr-1"
        })}
        data={data}
        isWorkflowBusy={false}
      />
    );

    const busyButtons = screen.getAllByRole("button", { name: "Working…" });
    expect(busyButtons).toHaveLength(2);
    for (const button of busyButtons) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "true");
    }
  });

  it("marks save-into-lesson busy while an accepted correction is applying", () => {
    const data = createDashboardData();
    const elderContext = createElderContext();
    elderContext.corrections = [
      {
        id: "corr-2",
        languageId: "avenik",
        noteId: data.notes[0]!.id,
        correction: "Use -na for locative.",
        rationale: "That is how elders say it.",
        severity: "minor",
        status: "accepted",
        proposedBy: "elder-1",
        proposedAt: "2026-06-06T00:00:00.000Z",
        reviewedBy: "reviewer-1",
        reviewedAt: "2026-06-06T01:00:00.000Z"
      }
    ];

    render(
      <ElderPage
        elder={createElderState({
          elderContext,
          applyingCorrectionId: "corr-2",
          correctionApplyDrafts: { "corr-2": "Revised lesson wording." }
        })}
        data={data}
        isWorkflowBusy={false}
      />
    );

    const saveButton = screen.getByRole("button", { name: "Saving…" });
    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveAttribute("aria-busy", "true");
  });

  it("seeds the apply editor from the suggested fix and shows save guidance", () => {
    const data = createDashboardData();
    const elderContext = createElderContext();
    elderContext.corrections = [
      {
        id: "corr-3",
        languageId: "avenik",
        noteId: data.notes[0]!.id,
        correction: "Use -na for locative.",
        rationale: "That is how elders say it.",
        severity: "minor",
        status: "accepted",
        proposedBy: "elder-1",
        proposedAt: "2026-06-06T00:00:00.000Z",
        reviewedBy: "reviewer-1",
        reviewedAt: "2026-06-06T01:00:00.000Z"
      }
    ];

    render(
      <ElderPage
        elder={createElderState({ elderContext })}
        data={data}
        isWorkflowBusy={false}
      />
    );

    expect(screen.getByText(/Edit the wording below/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Use -na for locative.")).toBeInTheDocument();
  });

  it("shows next-step guidance when an accepted correction has no linked lesson", () => {
    const data = createDashboardData();
    const elderContext = createElderContext();
    elderContext.corrections = [
      {
        id: "corr-4",
        languageId: "avenik",
        passageId: data.corpus[0]!.id,
        correction: "Say mira talo-mi-na.",
        rationale: "That is the river walk form.",
        severity: "minor",
        status: "accepted",
        proposedBy: "elder-1",
        proposedAt: "2026-06-06T00:00:00.000Z",
        reviewedBy: "reviewer-1",
        reviewedAt: "2026-06-06T01:00:00.000Z"
      }
    ];

    render(
      <ElderPage
        elder={createElderState({ elderContext })}
        data={data}
        isWorkflowBusy={false}
      />
    );

    const emptyState = screen.getByText(/not linked to a lesson/).closest("[role='status']");
    expect(emptyState).toHaveClass("empty-state");
    expect(emptyState).toHaveTextContent(/choose a lesson in step 1/);
  });

  it("keeps success feedback visible on the thank-you screen after send", () => {
    const data = createDashboardData();
    const elderContext = createElderContext();
    elderContext.corrections = [
      {
        id: "corr-5",
        languageId: "avenik",
        noteId: data.notes[0]!.id,
        correction: "Use -na for locative.",
        rationale: "That is how elders say it.",
        severity: "minor",
        status: "pending_review",
        proposedBy: "elder-1",
        proposedAt: "2026-06-06T00:00:00.000Z",
        reviewedBy: null,
        reviewedAt: null
      }
    ];

    render(
      <ElderPage
        elder={createElderState({
          elderContext,
          formContextText: "mira talo-mi-na",
          formCorrection: "Use -na for locative.",
          formRationale: "That is how elders say it.",
          correctionSuccess: "Elder Correction submitted successfully!"
        })}
        data={data}
        isWorkflowBusy={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Send my suggestion" }));

    expect(screen.getByText("Thank you")).toBeInTheDocument();
    expect(screen.getByText("Elder Correction submitted successfully!")).toBeInTheDocument();
  });
});
