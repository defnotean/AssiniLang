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

  it("shows a filter-specific empty state when no notes match", () => {
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

    expect(screen.getByRole("status")).toHaveTextContent("No Rejected notes.");
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
