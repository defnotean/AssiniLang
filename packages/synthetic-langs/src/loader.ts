import { appStateSchema, createEmptyState, type AppState } from "@assini/db";
import { syntheticLanguageFixtures } from "./fixtures";

export { syntheticLanguageFixtures };

export function buildSeedState(): AppState {
  const state = createEmptyState();
  for (const fixture of syntheticLanguageFixtures) {
    state.languages.push(fixture.language);
    state.corpus.push(...fixture.corpus);
    state.notes.push(...fixture.notesAnswerKey.map((note) => ({ ...note, status: "draft" as const })));
    state.exercises.push(...fixture.exercisesAnswerKey);
  }
  return appStateSchema.parse(state);
}
