import {
  appStateSchema,
  corpusPassageToAnswerKey,
  createEmptyState,
  type AppState,
  type CorpusPassage,
  type Exercise,
  type Morpheme,
  type Note,
  type ReviewPolicy
} from "@assini/db";
import { syntheticLanguageFixtures, type SyntheticLanguageFixture } from "./fixtures";
import { validateSyntheticLanguageFixtures } from "./validation";

export { syntheticLanguageFixtures };
export { validateSyntheticLanguageFixtures } from "./validation";

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
    expectedAnswers: [...exercise.expectedAnswers],
    adversarialAnswers: exercise.adversarialAnswers.map((adversarial) => ({ ...adversarial }))
  };
}

export function buildSeedState(fixtures: SyntheticLanguageFixture[] = syntheticLanguageFixtures): AppState {
  const diagnostics = validateSyntheticLanguageFixtures(fixtures);
  if (diagnostics.length > 0) {
    throw new Error(["Synthetic fixture validation failed:", ...diagnostics].join("\n"));
  }

  const state = createEmptyState();
  state.corpusAnswerKeys = [];
  for (const fixture of fixtures) {
    const corpus = fixture.corpus.map(cloneCorpusPassage);
    const reviewPolicy: ReviewPolicy = {
      id: `review-policy-${fixture.language.id}`,
      languageId: fixture.language.id,
      assignedReviewerIds: ["reviewer-1", "elder-1"],
      approvalThreshold: 2,
      requiresAssignedReviewer: true,
      updatedAt: "2026-06-06T00:00:00.000Z",
      updatedBy: "system-seed"
    };

    state.languages.push(fixture.language);
    state.corpus.push(...corpus);
    state.corpusAnswerKeys.push(...corpus.map(corpusPassageToAnswerKey));
    state.noteAnswerKeys.push(...fixture.notesAnswerKey.map(cloneNote));
    state.notes.push(...fixture.notesAnswerKey.map((note) => ({ ...cloneNote(note), status: "draft" as const })));
    state.exercises.push(...fixture.exercisesAnswerKey.map(cloneExercise));
    state.reviewPolicies.push(reviewPolicy);
  }
  return appStateSchema.parse(state);
}
