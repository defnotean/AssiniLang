import {
  appStateSchema,
  corpusPassageToAnswerKey,
  createEmptyState,
  type AppState,
  type CorpusPassage,
  type Exercise,
  type Morpheme,
  type Note
} from "@assini/db";
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

function cloneMorpheme(morpheme: Morpheme): Morpheme {
  return {
    ...morpheme,
    features: [...morpheme.features]
  };
}

function cloneCorpusPassage(passage: CorpusPassage): CorpusPassage {
  return {
    ...passage,
    sourceMetadata: { ...passage.sourceMetadata },
    morphologicalSegmentation: passage.morphologicalSegmentation.map(cloneMorpheme),
    topicTags: [...passage.topicTags],
    consentStatus: {
      ...passage.consentStatus,
      restrictions: [...passage.consentStatus.restrictions]
    }
  };
}

function cloneExercise(exercise: Exercise): Exercise {
  return {
    ...exercise,
    allowedVocabulary: [...exercise.allowedVocabulary],
    allowedRuleIds: [...exercise.allowedRuleIds],
    expectedAnswers: [...exercise.expectedAnswers]
  };
}

export function buildSeedState(): AppState {
  const state = createEmptyState();
  state.corpusAnswerKeys = [];
  for (const fixture of syntheticLanguageFixtures) {
    const corpus = fixture.corpus.map(cloneCorpusPassage);

    state.languages.push(fixture.language);
    state.corpus.push(...corpus);
    state.corpusAnswerKeys.push(...corpus.map(corpusPassageToAnswerKey));
    state.noteAnswerKeys.push(...fixture.notesAnswerKey.map(cloneNote));
    state.notes.push(...fixture.notesAnswerKey.map((note) => ({ ...cloneNote(note), status: "draft" as const })));
    state.exercises.push(...fixture.exercisesAnswerKey.map(cloneExercise));
  }
  return appStateSchema.parse(state);
}
