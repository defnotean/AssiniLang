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
    expect(screen.getByText("No suggestions yet. Use the steps above to send your first one.")).toBeInTheDocument();
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
