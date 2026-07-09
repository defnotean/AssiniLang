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
});
