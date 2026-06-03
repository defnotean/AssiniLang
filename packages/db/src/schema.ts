import { z } from "zod";

export const languageTypologySchema = z.enum([
  "agglutinative",
  "isolating",
  "fusional",
  "polysynthetic-lite"
]);

export const languageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  typology: languageTypologySchema,
  description: z.string().min(1),
  orthography: z.string().min(1),
  status: z.literal("synthetic"),
  fixtureSource: z.string().min(1)
});

export const morphemeSchema = z.object({
  surface: z.string().min(1),
  lemma: z.string().min(1),
  gloss: z.string().min(1),
  features: z.array(z.string()).default([])
});

export const corpusPassageSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  source: z.string().min(1),
  sourceMetadata: z.object({
    author: z.string().min(1),
    year: z.number().int(),
    license: z.string().min(1),
    consentRecord: z.string().min(1)
  }),
  textTarget: z.string().min(1),
  textTranslation: z.string().min(1),
  morphologicalSegmentation: z.array(morphemeSchema),
  topicTags: z.array(z.string()),
  consentStatus: z.object({
    use: z.literal("synthetic-testing-only"),
    restrictions: z.array(z.string())
  })
});

export const corpusAnswerKeySchema = z.object({
  passageId: z.string().min(1),
  languageId: z.string().min(1),
  textTarget: z.string().min(1),
  textTranslation: z.string().min(1),
  morphologicalSegmentation: z.array(morphemeSchema)
});

export const noteStatusSchema = z.enum(["draft", "under_review", "approved", "contested", "rejected"]);
export const confidenceSchema = z.enum(["low", "medium", "high"]);

export const noteSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  topic: z.string().min(1),
  explanation: z.string().min(1),
  examples: z.array(z.object({
    passageId: z.string().min(1),
    target: z.string().min(1),
    translation: z.string().min(1)
  })),
  evidencePassageIds: z.array(z.string().min(1)),
  evidenceCount: z.number().int().nonnegative(),
  confidence: confidenceSchema,
  status: noteStatusSchema,
  reviewer: z.object({
    lastReviewedBy: z.string().nullable(),
    lastReviewedAt: z.string().nullable(),
    comments: z.array(z.string())
  }),
  dialectScope: z.string().min(1),
  editHistory: z.array(z.object({
    at: z.string(),
    by: z.string(),
    action: z.string(),
    summary: z.string()
  }))
});

export const exerciseSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  type: z.enum(["translate_to_target", "translate_to_english", "segment", "choose_particle"]),
  prompt: z.string().min(1),
  allowedVocabulary: z.array(z.string()),
  allowedRuleIds: z.array(z.string()),
  expectedAnswers: z.array(z.string().min(1)),
  gradingExplanation: z.string().min(1)
});

export const exerciseSubmissionSchema = z.object({
  id: z.string().min(1),
  exerciseId: z.string().min(1),
  languageId: z.string().min(1),
  answer: z.string().min(1),
  accepted: z.boolean(),
  explanation: z.string().min(1),
  submittedAt: z.string().min(1),
  learnerId: z.string().min(1)
});

export const evaluationFailureSchema = z.object({
  category: z.string().min(1),
  languageId: z.string().min(1),
  itemId: z.string().min(1),
  message: z.string().min(1)
});

export const evaluationRunSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  createdAt: z.string().min(1),
  systemVersion: z.string().min(1),
  fixtureVersion: z.string().min(1),
  scores: z.record(z.number().min(0).max(1)),
  failures: z.array(evaluationFailureSchema),
  summary: z.string().min(1)
});

export const appStateSchema = z.object({
  schemaVersion: z.literal(3),
  languages: z.array(languageSchema),
  corpus: z.array(corpusPassageSchema),
  corpusAnswerKeys: z.array(corpusAnswerKeySchema).optional(),
  noteAnswerKeys: z.array(noteSchema),
  notes: z.array(noteSchema),
  exercises: z.array(exerciseSchema),
  exerciseSubmissions: z.array(exerciseSubmissionSchema),
  evaluationRuns: z.array(evaluationRunSchema)
});

export type Language = z.infer<typeof languageSchema>;
export type CorpusPassage = z.infer<typeof corpusPassageSchema>;
export type CorpusAnswerKey = z.infer<typeof corpusAnswerKeySchema>;
export type Morpheme = z.infer<typeof morphemeSchema>;
export type Note = z.infer<typeof noteSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type ExerciseSubmission = z.infer<typeof exerciseSubmissionSchema>;
export type EvaluationFailure = z.infer<typeof evaluationFailureSchema>;
export type EvaluationRun = z.infer<typeof evaluationRunSchema>;
export type AppState = z.infer<typeof appStateSchema>;

const legacyAppStateV1Schema = z.object({
  schemaVersion: z.literal(1),
  languages: z.array(languageSchema),
  corpus: z.array(corpusPassageSchema),
  notes: z.array(noteSchema),
  exercises: z.array(exerciseSchema),
  evaluationRuns: z.array(evaluationRunSchema)
});

const legacyAppStateV2Schema = z.object({
  schemaVersion: z.literal(2),
  languages: z.array(languageSchema),
  corpus: z.array(corpusPassageSchema),
  noteAnswerKeys: z.array(noteSchema),
  notes: z.array(noteSchema),
  exercises: z.array(exerciseSchema),
  evaluationRuns: z.array(evaluationRunSchema)
});

function migrateLegacyNoteToAnswerKey(note: Note): Note {
  return {
    ...note,
    examples: note.examples.map((example) => ({ ...example })),
    evidencePassageIds: [...note.evidencePassageIds],
    status: "approved",
    reviewer: {
      lastReviewedBy: "legacy-v1-migration",
      lastReviewedAt: null,
      comments: [...note.reviewer.comments, "Migrated from v1 store without explicit note answer keys."]
    },
    editHistory: [
      ...note.editHistory.map((entry) => ({ ...entry })),
      {
        at: new Date(0).toISOString(),
        by: "legacy-v1-migration",
        action: "migrated",
        summary: "Promoted legacy note content into immutable answer-key state."
      }
    ]
  };
}

function cloneMorpheme(morpheme: Morpheme): Morpheme {
  return {
    ...morpheme,
    features: [...morpheme.features]
  };
}

function cloneCorpusAnswerKey(answerKey: CorpusAnswerKey): CorpusAnswerKey {
  return {
    ...answerKey,
    morphologicalSegmentation: answerKey.morphologicalSegmentation.map(cloneMorpheme)
  };
}

export function corpusPassageToAnswerKey(passage: CorpusPassage): CorpusAnswerKey {
  return {
    passageId: passage.id,
    languageId: passage.languageId,
    textTarget: passage.textTarget,
    textTranslation: passage.textTranslation,
    morphologicalSegmentation: passage.morphologicalSegmentation.map(cloneMorpheme)
  };
}

function ensureCorpusAnswerKeys(state: AppState): AppState {
  return {
    ...state,
    corpusAnswerKeys: state.corpusAnswerKeys?.map(cloneCorpusAnswerKey) ?? state.corpus.map(corpusPassageToAnswerKey)
  };
}

export function parseAppState(input: unknown): AppState {
  const current = appStateSchema.safeParse(input);
  if (current.success) {
    return ensureCorpusAnswerKeys(current.data);
  }

  const legacy = legacyAppStateV1Schema.safeParse(input);
  if (legacy.success) {
    return ensureCorpusAnswerKeys(appStateSchema.parse({
      ...legacy.data,
      schemaVersion: 3,
      noteAnswerKeys: legacy.data.notes.map(migrateLegacyNoteToAnswerKey),
      exerciseSubmissions: []
    }));
  }

  const legacyV2 = legacyAppStateV2Schema.safeParse(input);
  if (legacyV2.success) {
    return ensureCorpusAnswerKeys(appStateSchema.parse({
      ...legacyV2.data,
      schemaVersion: 3,
      exerciseSubmissions: []
    }));
  }

  return ensureCorpusAnswerKeys(appStateSchema.parse(input));
}
