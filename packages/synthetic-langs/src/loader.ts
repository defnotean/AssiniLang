import { appStateSchema, createEmptyState, type AppState, type Note } from "@assini/db";
import { syntheticLanguageFixtures } from "./fixtures";

export { syntheticLanguageFixtures };

function cloneNote(note: Note): Note {
  return {
    ...note,
    examples: note.examples.map((example) => ({ ...example })),
    evidencePassageIds: [...note.evidencePassageIds],
    reviewer: {
      ...note.reviewer,
      comments: [...note.reviewer.comments]
    },
    editHistory: note.editHistory.map((entry) => ({ ...entry }))
  };
}

export function buildSeedState(): AppState {
  const state = createEmptyState();
  for (const fixture of syntheticLanguageFixtures) {
    state.languages.push(fixture.language);
    state.corpus.push(...fixture.corpus);
    state.noteAnswerKeys.push(...fixture.notesAnswerKey.map(cloneNote));
    state.notes.push(...fixture.notesAnswerKey.map((note) => ({ ...cloneNote(note), status: "draft" as const })));
    state.exercises.push(...fixture.exercisesAnswerKey);
  }
  return appStateSchema.parse(state);
}
