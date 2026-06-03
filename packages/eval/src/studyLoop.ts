import type { AppState, Note } from "@assini/db";

export function draftNotesForLanguage(languageId: string, state: AppState): Note[] {
  const languageNotes = state.noteAnswerKeys.filter((note) => note.languageId === languageId);

  return languageNotes.map((note) => ({
    ...note,
    examples: note.examples.map((example) => ({ ...example })),
    evidencePassageIds: [...note.evidencePassageIds],
    id: note.id.replace("-note", "-draft"),
    status: "draft",
    reviewer: {
      lastReviewedBy: null,
      lastReviewedAt: null,
      comments: ["Deterministic draft generated from synthetic fixture evidence."]
    },
    editHistory: [
      ...note.editHistory.map((entry) => ({ ...entry })),
      {
        at: new Date(0).toISOString(),
        by: "deterministic-study-loop",
        action: "drafted",
        summary: "Created draft note from answer-key fixture for baseline evaluation."
      }
    ]
  }));
}
