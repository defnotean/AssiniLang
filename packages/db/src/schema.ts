import { z } from "zod";
import {
  languageStatusSchema,
  languagePhonologySchema,
  languageSchema,
  morphemeSchema,
  consentUseSchema,
  corpusPassageSchema,
  corpusAnswerKeySchema,
  lexemeSchema,
  sourceAssetKindSchema,
  sourceAssetStatusSchema,
  sourceAssetSchema,
  extractionDraftKindSchema,
  extractionDraftPayloadSchema,
  extractionDraftSchema,
  noteSchema,
  exerciseSchema,
  exerciseSubmissionSchema,
  evaluationFailureSchema,
  evaluationRunSchema,
  userRoleSchema,
  userSchema,
  auditEventSchema,
  aiSessionModeSchema,
  aiMessageSchema,
  neuralMapSchema,
  aiSessionSchema,
  elderCorrectionSchema,
  governanceRecordSchema,
  reviewPolicySchema,
  reviewApprovalSchema,
  reviewDispositionSchema
} from "./schemaDomains.js";
import { addDuplicatePersistedValueIssue, addBlankPersistedValueIssue } from "./schemaIntegrityCore.js";
import {
  addLanguageIntegrityIssues,
  addLexemeIntegrityIssues,
  addSourceAssetIntegrityIssues,
  addExtractionDraftIntegrityIssues,
  addUserIntegrityIssues
} from "./schemaIntegritySources.js";
import { addCorpusIntegrityIssues, addNoteCollectionIntegrityIssues } from "./schemaIntegrityCorpusNotes.js";
import {
  addExerciseIntegrityIssues,
  addCorpusAnswerKeyIntegrityIssues,
  addReviewPolicyIntegrityIssues,
  addExerciseSubmissionIntegrityIssues
} from "./schemaIntegrityLearning.js";
import {
  addGovernanceIntegrityIssues,
  addAuditEventIntegrityIssues,
  addAiSessionIntegrityIssues
} from "./schemaIntegrityOperations.js";
import {
  addEvaluationRunIntegrityIssues,
  addReviewApprovalIntegrityIssues,
  addReviewDispositionIntegrityIssues,
  addElderCorrectionIntegrityIssues,
  duplicateReviewApprovalKey
} from "./schemaIntegrityReview.js";

export * from "./schemaDomains.js";

/** Current AppState schema version written and accepted by this package. */
export const CURRENT_SCHEMA_VERSION = 9 as const;

export const appStateSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    languages: z.array(languageSchema),
    corpus: z.array(corpusPassageSchema),
    corpusAnswerKeys: z.array(corpusAnswerKeySchema).optional(),
    noteAnswerKeys: z.array(noteSchema),
    notes: z.array(noteSchema),
    exercises: z.array(exerciseSchema),
    exerciseSubmissions: z.array(exerciseSubmissionSchema),
    evaluationRuns: z.array(evaluationRunSchema),
    governance: z.array(governanceRecordSchema).default([]),
    users: z.array(userSchema).default([]),
    aiSessions: z.array(aiSessionSchema).default([]),
    elderCorrections: z.array(elderCorrectionSchema).default([]),
    auditEvents: z.array(auditEventSchema).default([]),
    reviewPolicies: z.array(reviewPolicySchema).default([]),
    reviewApprovals: z.array(reviewApprovalSchema).default([]),
    reviewDispositions: z.array(reviewDispositionSchema).default([]),
    lexemes: z.array(lexemeSchema).default([]),
    sourceAssets: z.array(sourceAssetSchema).default([]),
    extractionDrafts: z.array(extractionDraftSchema).default([])
  })
  .superRefine((state, context) => {
    addDuplicatePersistedValueIssue(context, "languages", "id", state.languages, (item) => item.id);
    addLanguageIntegrityIssues(context, state);
    addBlankPersistedValueIssue(context, "corpus", "id", state.corpus, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "corpus", "id", state.corpus, (item) => item.id);
    addCorpusIntegrityIssues(context, state);
    addDuplicatePersistedValueIssue(
      context,
      "corpusAnswerKeys",
      "passageId",
      state.corpusAnswerKeys ?? [],
      (item) => item.passageId
    );
    addCorpusAnswerKeyIntegrityIssues(context, state);
    addBlankPersistedValueIssue(context, "noteAnswerKeys", "id", state.noteAnswerKeys, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "noteAnswerKeys", "id", state.noteAnswerKeys, (item) => item.id);
    addNoteCollectionIntegrityIssues(context, state, state.noteAnswerKeys, "noteAnswerKeys", "Note answer key");
    addBlankPersistedValueIssue(context, "notes", "id", state.notes, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "notes", "id", state.notes, (item) => item.id);
    addNoteCollectionIntegrityIssues(context, state, state.notes, "notes", "Note");
    addBlankPersistedValueIssue(context, "exercises", "id", state.exercises, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "exercises", "id", state.exercises, (item) => item.id);
    addExerciseIntegrityIssues(context, state);
    addBlankPersistedValueIssue(context, "exerciseSubmissions", "id", state.exerciseSubmissions, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "exerciseSubmissions", "id", state.exerciseSubmissions, (item) => item.id);
    addBlankPersistedValueIssue(context, "evaluationRuns", "id", state.evaluationRuns, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "evaluationRuns", "id", state.evaluationRuns, (item) => item.id);
    addBlankPersistedValueIssue(context, "governance", "id", state.governance, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "governance", "id", state.governance, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "users", "id", state.users, (item) => item.id);
    addUserIntegrityIssues(context, state);
    addBlankPersistedValueIssue(context, "aiSessions", "id", state.aiSessions, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "aiSessions", "id", state.aiSessions, (item) => item.id);
    addBlankPersistedValueIssue(context, "elderCorrections", "id", state.elderCorrections, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "elderCorrections", "id", state.elderCorrections, (item) => item.id);
    addBlankPersistedValueIssue(context, "auditEvents", "id", state.auditEvents, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "auditEvents", "id", state.auditEvents, (item) => item.id);
    addBlankPersistedValueIssue(context, "reviewPolicies", "id", state.reviewPolicies, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "reviewPolicies", "id", state.reviewPolicies, (item) => item.id);
    addBlankPersistedValueIssue(context, "reviewApprovals", "id", state.reviewApprovals, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "reviewApprovals", "id", state.reviewApprovals, (item) => item.id);
    addBlankPersistedValueIssue(context, "reviewDispositions", "id", state.reviewDispositions, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "reviewDispositions", "id", state.reviewDispositions, (item) => item.id);
    addExerciseSubmissionIntegrityIssues(context, state);
    addGovernanceIntegrityIssues(context, state);
    addAuditEventIntegrityIssues(context, state);
    addAiSessionIntegrityIssues(context, state);
    addEvaluationRunIntegrityIssues(context, state);
    addReviewPolicyIntegrityIssues(context, state);
    addReviewApprovalIntegrityIssues(context, state);
    addReviewDispositionIntegrityIssues(context, state);
    addElderCorrectionIntegrityIssues(context, state);
    addBlankPersistedValueIssue(context, "lexemes", "id", state.lexemes, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "lexemes", "id", state.lexemes, (item) => item.id);
    addLexemeIntegrityIssues(context, state);
    addBlankPersistedValueIssue(context, "sourceAssets", "id", state.sourceAssets, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "sourceAssets", "id", state.sourceAssets, (item) => item.id);
    addSourceAssetIntegrityIssues(context, state);
    addBlankPersistedValueIssue(context, "extractionDrafts", "id", state.extractionDrafts, (item) => item.id);
    addDuplicatePersistedValueIssue(context, "extractionDrafts", "id", state.extractionDrafts, (item) => item.id);
    addExtractionDraftIntegrityIssues(context, state);

    const duplicateApproval = duplicateReviewApprovalKey(state.reviewApprovals);
    if (duplicateApproval) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate review approval for language/note/reviewer: ${duplicateApproval}`,
        path: ["reviewApprovals"]
      });
    }
  });

export type UserRole = z.infer<typeof userRoleSchema>;
export type User = z.infer<typeof userSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AiSessionMode = z.infer<typeof aiSessionModeSchema>;
export type AiSession = z.infer<typeof aiSessionSchema>;
export type AiMessage = z.infer<typeof aiMessageSchema>;
export type NeuralMap = z.infer<typeof neuralMapSchema>;
export type ElderCorrection = z.infer<typeof elderCorrectionSchema>;
export type GovernanceRecord = z.infer<typeof governanceRecordSchema>;
export type ReviewPolicy = z.infer<typeof reviewPolicySchema>;
export type ReviewApproval = z.infer<typeof reviewApprovalSchema>;
export type ReviewDisposition = z.infer<typeof reviewDispositionSchema>;
export type Language = z.infer<typeof languageSchema>;
export type CorpusPassage = z.infer<typeof corpusPassageSchema>;
export type CorpusAnswerKey = z.infer<typeof corpusAnswerKeySchema>;
export type Morpheme = z.infer<typeof morphemeSchema>;
export type Note = z.infer<typeof noteSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type ExerciseSubmission = z.infer<typeof exerciseSubmissionSchema>;
export type EvaluationFailure = z.infer<typeof evaluationFailureSchema>;
export type EvaluationRun = z.infer<typeof evaluationRunSchema>;
export type LanguageStatus = z.infer<typeof languageStatusSchema>;
export type LanguagePhonology = z.infer<typeof languagePhonologySchema>;
export type ConsentUse = z.infer<typeof consentUseSchema>;
export type Lexeme = z.infer<typeof lexemeSchema>;
export type SourceAsset = z.infer<typeof sourceAssetSchema>;
export type SourceAssetKind = z.infer<typeof sourceAssetKindSchema>;
export type SourceAssetStatus = z.infer<typeof sourceAssetStatusSchema>;
export type ExtractionDraft = z.infer<typeof extractionDraftSchema>;
export type ExtractionDraftKind = z.infer<typeof extractionDraftKindSchema>;
export type ExtractionDraftPayload = z.infer<typeof extractionDraftPayloadSchema>;
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

const legacyAppStateV3Schema = z.object({
  schemaVersion: z.literal(3),
  languages: z.array(languageSchema),
  corpus: z.array(corpusPassageSchema),
  corpusAnswerKeys: z.array(corpusAnswerKeySchema).optional(),
  noteAnswerKeys: z.array(noteSchema),
  notes: z.array(noteSchema),
  exercises: z.array(exerciseSchema),
  exerciseSubmissions: z.array(exerciseSubmissionSchema),
  evaluationRuns: z.array(evaluationRunSchema),
  governance: z.array(governanceRecordSchema).default([]),
  users: z.array(userSchema).default([])
});

const legacyAppStateV4Schema = z.object({
  schemaVersion: z.literal(4),
  languages: z.array(languageSchema),
  corpus: z.array(corpusPassageSchema),
  corpusAnswerKeys: z.array(corpusAnswerKeySchema).optional(),
  noteAnswerKeys: z.array(noteSchema),
  notes: z.array(noteSchema),
  exercises: z.array(exerciseSchema),
  exerciseSubmissions: z.array(exerciseSubmissionSchema),
  evaluationRuns: z.array(evaluationRunSchema),
  governance: z.array(governanceRecordSchema).default([]),
  users: z.array(userSchema).default([]),
  aiSessions: z.array(aiSessionSchema).default([]),
  elderCorrections: z.array(elderCorrectionSchema).default([])
});

const legacyAppStateV5Schema = z.object({
  schemaVersion: z.literal(5),
  languages: z.array(languageSchema),
  corpus: z.array(corpusPassageSchema),
  corpusAnswerKeys: z.array(corpusAnswerKeySchema).optional(),
  noteAnswerKeys: z.array(noteSchema),
  notes: z.array(noteSchema),
  exercises: z.array(exerciseSchema),
  exerciseSubmissions: z.array(exerciseSubmissionSchema),
  evaluationRuns: z.array(evaluationRunSchema),
  governance: z.array(governanceRecordSchema).default([]),
  users: z.array(userSchema).default([]),
  aiSessions: z.array(aiSessionSchema).default([]),
  elderCorrections: z.array(elderCorrectionSchema).default([]),
  auditEvents: z.array(auditEventSchema).default([])
});

const legacyAppStateV6Schema = z.object({
  schemaVersion: z.literal(6),
  languages: z.array(languageSchema),
  corpus: z.array(corpusPassageSchema),
  corpusAnswerKeys: z.array(corpusAnswerKeySchema).optional(),
  noteAnswerKeys: z.array(noteSchema),
  notes: z.array(noteSchema),
  exercises: z.array(exerciseSchema),
  exerciseSubmissions: z.array(exerciseSubmissionSchema),
  evaluationRuns: z.array(evaluationRunSchema),
  governance: z.array(governanceRecordSchema).default([]),
  users: z.array(userSchema).default([]),
  aiSessions: z.array(aiSessionSchema).default([]),
  elderCorrections: z.array(elderCorrectionSchema).default([]),
  auditEvents: z.array(auditEventSchema).default([]),
  reviewPolicies: z.array(reviewPolicySchema).default([]),
  reviewApprovals: z.array(reviewApprovalSchema).default([])
});

const legacyAppStateV7Schema = z.object({
  schemaVersion: z.literal(7),
  languages: z.array(languageSchema),
  corpus: z.array(corpusPassageSchema),
  corpusAnswerKeys: z.array(corpusAnswerKeySchema).optional(),
  noteAnswerKeys: z.array(noteSchema),
  notes: z.array(noteSchema),
  exercises: z.array(exerciseSchema),
  exerciseSubmissions: z.array(exerciseSubmissionSchema),
  evaluationRuns: z.array(evaluationRunSchema),
  governance: z.array(governanceRecordSchema).default([]),
  users: z.array(userSchema).default([]),
  aiSessions: z.array(aiSessionSchema).default([]),
  elderCorrections: z.array(elderCorrectionSchema).default([]),
  auditEvents: z.array(auditEventSchema).default([]),
  reviewPolicies: z.array(reviewPolicySchema).default([]),
  reviewApprovals: z.array(reviewApprovalSchema).default([]),
  reviewDispositions: z.array(reviewDispositionSchema).default([])
});

const legacyAppStateV8Schema = z.object({
  schemaVersion: z.literal(8),
  languages: z.array(languageSchema),
  corpus: z.array(corpusPassageSchema),
  corpusAnswerKeys: z.array(corpusAnswerKeySchema).optional(),
  noteAnswerKeys: z.array(noteSchema),
  notes: z.array(noteSchema),
  exercises: z.array(exerciseSchema),
  exerciseSubmissions: z.array(exerciseSubmissionSchema),
  evaluationRuns: z.array(evaluationRunSchema),
  governance: z.array(governanceRecordSchema).default([]),
  users: z.array(userSchema).default([]),
  aiSessions: z.array(aiSessionSchema).default([]),
  elderCorrections: z.array(elderCorrectionSchema).default([]),
  auditEvents: z.array(auditEventSchema).default([]),
  reviewPolicies: z.array(reviewPolicySchema).default([]),
  reviewApprovals: z.array(reviewApprovalSchema).default([]),
  reviewDispositions: z.array(reviewDispositionSchema).default([]),
  lexemes: z.array(lexemeSchema).default([]),
  sourceAssets: z.array(sourceAssetSchema).default([]),
  extractionDrafts: z.array(extractionDraftSchema).default([])
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
    return ensureCorpusAnswerKeys(
      appStateSchema.parse({
        ...legacy.data,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        noteAnswerKeys: legacy.data.notes.map(migrateLegacyNoteToAnswerKey),
        exerciseSubmissions: [],
        auditEvents: [],
        reviewPolicies: [],
        reviewApprovals: [],
        reviewDispositions: []
      })
    );
  }

  const legacyV2 = legacyAppStateV2Schema.safeParse(input);
  if (legacyV2.success) {
    return ensureCorpusAnswerKeys(
      appStateSchema.parse({
        ...legacyV2.data,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        exerciseSubmissions: [],
        auditEvents: [],
        reviewPolicies: [],
        reviewApprovals: [],
        reviewDispositions: []
      })
    );
  }

  const legacyV3 = legacyAppStateV3Schema.safeParse(input);
  if (legacyV3.success) {
    return ensureCorpusAnswerKeys(
      appStateSchema.parse({
        ...legacyV3.data,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        auditEvents: [],
        reviewPolicies: [],
        reviewApprovals: [],
        reviewDispositions: []
      })
    );
  }

  const legacyV4 = legacyAppStateV4Schema.safeParse(input);
  if (legacyV4.success) {
    return ensureCorpusAnswerKeys(
      appStateSchema.parse({
        ...legacyV4.data,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        auditEvents: [],
        reviewPolicies: [],
        reviewApprovals: [],
        reviewDispositions: []
      })
    );
  }

  const legacyV5 = legacyAppStateV5Schema.safeParse(input);
  if (legacyV5.success) {
    return ensureCorpusAnswerKeys(
      appStateSchema.parse({
        ...legacyV5.data,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        reviewPolicies: [],
        reviewApprovals: [],
        reviewDispositions: []
      })
    );
  }

  const legacyV6 = legacyAppStateV6Schema.safeParse(input);
  if (legacyV6.success) {
    return ensureCorpusAnswerKeys(
      appStateSchema.parse({
        ...legacyV6.data,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        reviewDispositions: []
      })
    );
  }

  const legacyV7 = legacyAppStateV7Schema.safeParse(input);
  if (legacyV7.success) {
    return ensureCorpusAnswerKeys(
      appStateSchema.parse({
        ...legacyV7.data,
        schemaVersion: CURRENT_SCHEMA_VERSION
      })
    );
  }

  const legacyV8 = legacyAppStateV8Schema.safeParse(input);
  if (legacyV8.success) {
    return ensureCorpusAnswerKeys(
      appStateSchema.parse({
        ...legacyV8.data,
        schemaVersion: CURRENT_SCHEMA_VERSION
      })
    );
  }

  return ensureCorpusAnswerKeys(appStateSchema.parse(input));
}
