import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { CorpusPassage, Note } from "@assini/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewView } from "./ReviewView";

const duplicateComment = "Local model verification approved this synthetic test note.";

function createReviewNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
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
    status: "approved",
    reviewer: {
      lastReviewedBy: "elder-1",
      lastReviewedAt: "2026-07-07T20:00:00.000Z",
      comments: [duplicateComment, duplicateComment]
    },
    dialectScope: "baseline",
    editHistory: [],
    ...overrides
  };
}

function createCorpusPassage(overrides: Partial<CorpusPassage> = {}): CorpusPassage {
  return {
    id: "avn-c001",
    languageId: "avenik",
    source: "fixture",
    sourceMetadata: {
      author: "fixture-author",
      year: 2026,
      license: "cc-by",
      consentRecord: "community-consent-001"
    },
    textTarget: "mira talo-mi-na",
    textTranslation: "I walk by the river.",
    morphologicalSegmentation: [],
    topicTags: [],
    consentStatus: {
      use: "testing-only",
      restrictions: []
    },
    ...overrides
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReviewView", () => {
  it("renders duplicate reviewer comments without React key warnings", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const note = createReviewNote();

    render(
      <ReviewView
        notes={[note]}
        selectedNote={note}
        isWorkflowBusy={false}
        reviewingNoteId={null}
        onSelectNote={vi.fn()}
        onReview={vi.fn()}
        onSaveExplanation={vi.fn()}
      />
    );

    expect(screen.getAllByText(duplicateComment)).toHaveLength(2);
    expect(consoleError.mock.calls.some((call) => String(call[0]).includes("same key"))).toBe(false);
  });

  it("shows a Build-oriented empty state when the language has no notes", () => {
    render(
      <ReviewView
        notes={[]}
        selectedNote={null}
        isWorkflowBusy={false}
        reviewingNoteId={null}
        onSelectNote={vi.fn()}
        onReview={vi.fn()}
        onSaveExplanation={vi.fn()}
      />
    );

    const reviewQueue = screen.getByRole("region", { name: "Review queue" });
    const queueEmpty = reviewQueue.querySelector(".empty-state");
    expect(queueEmpty).toHaveAttribute("role", "status");
    expect(queueEmpty).toHaveAttribute("aria-live", "polite");
    expect(queueEmpty).toHaveTextContent("No notes for this language yet.");
    expect(queueEmpty).toHaveTextContent(
      "Process a source in Build, accept grammar-note drafts there, then review them here."
    );

    const detailEmpty = screen.getByRole("region", { name: "Note detail panel" }).querySelector(".empty-state");
    expect(detailEmpty).toHaveAttribute("aria-live", "polite");
    expect(detailEmpty).toHaveTextContent(
      "Process a source in Build, accept grammar-note drafts there, then review them here."
    );
  });

  it("shows filter-specific next-step guidance when no notes match the active filter", () => {
    const note = createReviewNote({ status: "approved" });

    render(
      <ReviewView
        notes={[note]}
        selectedNote={note}
        isWorkflowBusy={false}
        reviewingNoteId={null}
        onSelectNote={vi.fn()}
        onReview={vi.fn()}
        onSaveExplanation={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Rejected/i }));

    const reviewQueue = screen.getByRole("region", { name: "Review queue" });
    const queueEmpty = reviewQueue.querySelector(".empty-state");
    expect(queueEmpty).toHaveAttribute("aria-live", "polite");
    expect(queueEmpty).toHaveTextContent("No Rejected notes.");
    expect(queueEmpty).toHaveTextContent("Try another filter, or process a source in Build to add notes.");
    expect(document.querySelector("button.note-row")).not.toBeInTheDocument();

    // Detail must not claim the language is empty, and must hide Approve for a
    // note the filtered queue is not listing.
    const detailPanel = screen.getByRole("region", { name: "Note detail panel" });
    const detailEmpty = detailPanel.querySelector(".empty-state");
    expect(detailEmpty).toHaveAttribute("aria-live", "polite");
    expect(detailEmpty).toHaveTextContent("No Rejected notes.");
    expect(detailEmpty).toHaveTextContent("Try another filter, or process a source in Build to add notes.");
    expect(detailPanel).not.toHaveTextContent("No notes for this language yet.");
    expect(screen.queryByRole("button", { name: "Approve verb chains" })).not.toBeInTheDocument();
  });

  it("prompts to select a note when the queue has rows but none is selected", () => {
    const note = createReviewNote({ status: "approved" });

    render(
      <ReviewView
        notes={[note]}
        selectedNote={null}
        isWorkflowBusy={false}
        reviewingNoteId={null}
        onSelectNote={vi.fn()}
        onReview={vi.fn()}
        onSaveExplanation={vi.fn()}
      />
    );

    const detailPanel = screen.getByRole("region", { name: "Note detail panel" });
    expect(detailPanel).toHaveTextContent("Select a note in the queue to review it.");
    expect(detailPanel).toHaveTextContent("Choose a row above, or change the filter if the note you need is hidden.");
    expect(detailPanel).not.toHaveTextContent("No notes for this language yet.");
  });

  it("shows next-step guidance when a selected note has empty examples, comments, and edit history", () => {
    const note = createReviewNote({
      examples: [],
      reviewer: {
        lastReviewedBy: null,
        lastReviewedAt: null,
        comments: []
      },
      editHistory: []
    });

    render(
      <ReviewView
        notes={[note]}
        selectedNote={note}
        isWorkflowBusy={false}
        reviewingNoteId={null}
        onSelectNote={vi.fn()}
        onReview={vi.fn()}
        onSaveExplanation={vi.fn()}
      />
    );

    const examplesEmpty = screen.getByText(/No examples on this note yet/);
    expect(examplesEmpty).toHaveAttribute("role", "status");
    expect(examplesEmpty).toHaveAttribute("aria-live", "polite");
    expect(examplesEmpty).toHaveTextContent(/Add one from a language passage below/);

    const commentsEmpty = screen.getByText(/No reviewer comments yet/);
    expect(commentsEmpty).toHaveAttribute("aria-live", "polite");
    expect(commentsEmpty).toHaveTextContent(/Leave a note when contesting/);

    const historyEmpty = screen.getByText(/No edit history yet/);
    expect(historyEmpty).toHaveAttribute("aria-live", "polite");
    expect(historyEmpty).toHaveTextContent(/Saving a revised explanation or examples below starts this trail/);
  });

  it("lets reviewers add and remove examples, then save them with the explanation", async () => {
    const note = createReviewNote({
      examples: [],
      explanation: "Avenik verbs use transparent suffix chains for person marking."
    });
    const corpus = [
      createCorpusPassage(),
      createCorpusPassage({
        id: "avn-c002",
        textTarget: "saku nemi-lo-ki",
        textTranslation: "The child taught."
      })
    ];
    const onSaveExplanation = vi.fn().mockResolvedValue(undefined);

    render(
      <ReviewView
        notes={[note]}
        corpus={corpus}
        selectedNote={note}
        isWorkflowBusy={false}
        reviewingNoteId={null}
        onSelectNote={vi.fn()}
        onReview={vi.fn()}
        onSaveExplanation={onSaveExplanation}
      />
    );

    const examplesEditor = screen.getByLabelText("Note examples editor");
    fireEvent.change(screen.getByLabelText("Add example from passage"), {
      target: { value: "avn-c002" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Add example" }));
    expect(within(examplesEditor).getByText("The child taught.")).toBeInTheDocument();
    expect(examplesEditor.querySelector("code")?.textContent).toBe("saku nemi-lo-ki");
    expect(within(examplesEditor).getByRole("button", { name: "Remove" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(within(examplesEditor).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(within(examplesEditor).getByText(/No examples on this note yet/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Add example from passage"), {
      target: { value: "avn-c001" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Add example" }));

    const saveButton = screen.getByRole("button", { name: "Save note edits" });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    expect(onSaveExplanation).toHaveBeenCalledWith({
      explanation: "Avenik verbs use transparent suffix chains for person marking.",
      examples: [
        {
          passageId: "avn-c001",
          target: "mira talo-mi-na",
          translation: "I walk by the river."
        }
      ]
    });
    expect(await screen.findByText("Note examples updated.")).toBeInTheDocument();
  });

  it("disables review actions while workflow is busy", () => {
    const note = createReviewNote();

    render(
      <ReviewView
        notes={[note]}
        selectedNote={note}
        isWorkflowBusy
        reviewingNoteId={null}
        onSelectNote={vi.fn()}
        onReview={vi.fn()}
        onSaveExplanation={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Approve verb chains" })).toBeDisabled();
    expect(screen.getByLabelText("Revised note explanation")).toBeDisabled();
    expect(document.querySelector("button.note-row")).toBeDisabled();
  });

  it("marks save and review actions busy while a note review is in flight", () => {
    const note = createReviewNote();

    render(
      <ReviewView
        notes={[note]}
        selectedNote={note}
        isWorkflowBusy={false}
        reviewingNoteId={note.id}
        onSelectNote={vi.fn()}
        onReview={vi.fn()}
        onSaveExplanation={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving..." })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Approve verb chains" })).toBeDisabled();
    expect(document.querySelector(".review-bar")).toHaveAttribute("aria-busy", "true");
  });

  it("surfaces review action errors in the detail panel", () => {
    const note = createReviewNote();

    render(
      <ReviewView
        notes={[note]}
        selectedNote={note}
        isWorkflowBusy={false}
        reviewingNoteId={null}
        actionError="Review update failed."
        onSelectNote={vi.fn()}
        onReview={vi.fn()}
        onSaveExplanation={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Review update failed.");
  });

  it("shows humanized status and confidence badge labels in the queue and detail", () => {
    const note = createReviewNote({ status: "under_review", confidence: "medium" });

    render(
      <ReviewView
        notes={[note]}
        selectedNote={note}
        isWorkflowBusy={false}
        reviewingNoteId={null}
        onSelectNote={vi.fn()}
        onReview={vi.fn()}
        onSaveExplanation={vi.fn()}
      />
    );

    expect(screen.getAllByText("under review").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("medium confidence").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("under_review")).not.toBeInTheDocument();
  });

  it("localizes edit-history action tokens instead of raw snake_case", () => {
    const note = createReviewNote({
      editHistory: [
        {
          at: "2026-06-01T12:00:00.000Z",
          by: "draft-agent",
          action: "drafted",
          summary: "Generated from the Avenik grammar fixture."
        },
        {
          at: "2026-06-02T12:00:00.000Z",
          by: "elder-1",
          action: "applied_correction",
          summary: "Applied an elder correction."
        }
      ]
    });

    render(
      <ReviewView
        notes={[note]}
        selectedNote={note}
        isWorkflowBusy={false}
        reviewingNoteId={null}
        onSelectNote={vi.fn()}
        onReview={vi.fn()}
        onSaveExplanation={vi.fn()}
      />
    );

    expect(screen.getByText("Drafted")).toBeInTheDocument();
    expect(screen.getByText("Applied correction")).toBeInTheDocument();
    expect(screen.queryByText("drafted")).not.toBeInTheDocument();
    expect(screen.queryByText("applied_correction")).not.toBeInTheDocument();
  });
});
