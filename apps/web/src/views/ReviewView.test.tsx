import { render, screen } from "@testing-library/react";
import type { Note } from "@assini/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewView } from "./ReviewView";

const duplicateComment = "Local model verification approved this synthetic test note.";

function createReviewNote(): Note {
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
    editHistory: []
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
});
