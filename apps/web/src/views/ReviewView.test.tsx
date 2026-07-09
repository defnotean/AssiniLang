import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Note } from "@assini/db";
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
    expect(reviewQueue).toHaveTextContent("No notes for this language yet.");
    expect(reviewQueue).toHaveTextContent("Process a source in Build to propose grammar notes, then review them here.");
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
    expect(reviewQueue).toHaveTextContent("No Rejected notes.");
    expect(reviewQueue).toHaveTextContent("Try another filter, or process a source in Build to add notes.");
    expect(document.querySelector("button.note-row")).not.toBeInTheDocument();

    // Detail must not claim the language is empty, and must hide Approve for a
    // note the filtered queue is not listing.
    const detailPanel = screen.getByRole("region", { name: "Note detail panel" });
    expect(detailPanel).toHaveTextContent("No Rejected notes.");
    expect(detailPanel).toHaveTextContent("Try another filter, or process a source in Build to add notes.");
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

    expect(screen.getByText(/No examples on this note yet/)).toBeInTheDocument();
    expect(screen.getByText(/Link a corpus passage as evidence in Build/)).toBeInTheDocument();
    expect(screen.getByText(/No reviewer comments yet/)).toBeInTheDocument();
    expect(screen.getByText(/Leave a note when contesting/)).toBeInTheDocument();
    expect(screen.getByText(/No edit history yet/)).toBeInTheDocument();
    expect(screen.getByText(/Saving a revised explanation below starts this trail/)).toBeInTheDocument();
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
});
