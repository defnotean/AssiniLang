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

export const noteStatusSchema = z.enum([
  "draft",
  "under_review",
  "approved",
  "contested",
  "rejected",
  "deferred",
  "escalated"
]);
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
  adversarialAnswers: z.array(z.object({
    answer: z.string().min(1),
    reason: z.string().min(1)
  })).default([]),
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

export const userRoleSchema = z.enum(["admin", "elder", "programmer", "reviewer", "lead", "learner"]);

export const userSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: userRoleSchema,
  avatarUrl: z.string().optional()
});

export const REVIEW_POLICY_ASSIGNABLE_ROLES = ["reviewer", "elder", "lead", "admin"] as const;
const reviewPolicyAssignableRoleSet = new Set<string>(REVIEW_POLICY_ASSIGNABLE_ROLES);

export function isReviewPolicyAssignableRole(role: z.infer<typeof userRoleSchema>): boolean {
  return reviewPolicyAssignableRoleSet.has(role);
}

export const LOCAL_PROTOTYPE_USERS = z.array(userSchema).parse([
  { id: "learner-1", name: "Local Learner", role: "learner" },
  { id: "elder-1", name: "Local Elder", role: "elder" },
  { id: "programmer-1", name: "Local Programmer", role: "programmer" },
  { id: "reviewer-1", name: "Local Reviewer", role: "reviewer" },
  { id: "lead-1", name: "Local Lead", role: "lead" },
  { id: "admin-1", name: "Local Admin", role: "admin" }
]);

export const auditEntityTypeSchema = z.enum([
  "exercise_submission",
  "evaluation_run",
  "governance_record",
  "review_policy",
  "review_approval",
  "review_disposition",
  "exercise",
  "corpus",
  "note",
  "ai_session",
  "ai_message",
  "elder_correction"
]);

export const auditEventSchema = z.object({
  id: z.string().min(1),
  at: z.string().min(1),
  actorId: z.string().min(1),
  actorRole: userRoleSchema,
  action: z.string().min(1),
  entityType: auditEntityTypeSchema,
  entityId: z.string().min(1),
  languageId: z.string().min(1).nullable(),
  summary: z.string().min(1),
  metadata: z.record(z.unknown()).default({})
});

export const aiSessionModeSchema = z.enum(["learner_practice", "elder_review", "programmer_debug"]);
export const aiSessionStatusSchema = z.enum(["active", "completed", "failed"]);
export const aiMessageRoleSchema = z.enum(["system", "user", "assistant", "tool"]);
export const aiTraceStepKindSchema = z.enum(["input", "retrieval", "policy_check", "generation", "correction", "output"]);
export const neuralMapNodeTypeSchema = z.enum([
  "language",
  "corpus",
  "note",
  "exercise",
  "ai_session",
  "elder_correction",
  "output"
]);
export const neuralMapEdgeRelationSchema = z.enum([
  "has_corpus",
  "has_note",
  "has_exercise",
  "uses_context",
  "generated",
  "proposed_correction"
]);

export const aiMessageSchema = z.object({
  id: z.string().min(1),
  role: aiMessageRoleSchema,
  content: z.string().min(1),
  createdAt: z.string().min(1),
  createdBy: z.string().min(1)
});

export const aiTraceStepSchema = z.object({
  id: z.string().min(1),
  kind: aiTraceStepKindSchema,
  label: z.string().min(1),
  summary: z.string().min(1),
  referencedIds: z.array(z.string().min(1)).default([]),
  warnings: z.array(z.string().min(1)).default([])
});

export const neuralMapNodeSchema = z.object({
  id: z.string().min(1),
  type: neuralMapNodeTypeSchema,
  label: z.string().min(1),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).default({})
});

export const neuralMapEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  relation: neuralMapEdgeRelationSchema,
  weight: z.number().min(0).max(1).optional()
});

export const neuralMapSchema = z.object({
  nodes: z.array(neuralMapNodeSchema).default([]),
  edges: z.array(neuralMapEdgeSchema).default([])
});

export const aiSessionSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  mode: aiSessionModeSchema,
  status: aiSessionStatusSchema,
  createdBy: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  contextNoteIds: z.array(z.string().min(1)).default([]),
  contextPassageIds: z.array(z.string().min(1)).default([]),
  messages: z.array(aiMessageSchema).default([]),
  thinkingSummary: z.string().min(1),
  trace: z.array(aiTraceStepSchema).default([]),
  neuralMap: neuralMapSchema.default({ nodes: [], edges: [] }),
  privacy: z.object({
    redactions: z.array(z.string().min(1)).default([]),
    exposesHiddenChainOfThought: z.literal(false)
  })
});

export const elderCorrectionSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  noteId: z.string().min(1).optional(),
  passageId: z.string().min(1).optional(),
  correction: z.string().min(1),
  rationale: z.string().min(1),
  severity: z.enum(["minor", "major", "safety"]).default("minor"),
  contextText: z.string().min(1).optional(),
  status: z.enum(["pending_review", "accepted", "rejected", "applied"]).default("pending_review"),
  proposedBy: z.string().min(1),
  proposedAt: z.string().min(1),
  reviewedBy: z.string().nullable().default(null),
  reviewedAt: z.string().nullable().default(null)
}).refine((correction) => correction.noteId !== undefined || correction.passageId !== undefined || correction.contextText !== undefined, {
  message: "At least one correction target or contextText is required"
});

export const governanceRecordSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  policyType: z.enum(["consent", "access", "generation"]),
  content: z.string().min(1),
  effectiveDate: z.string(),
  approvedBy: z.string()
});

export const reviewPolicySchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  assignedReviewerIds: z.array(z.string().min(1)),
  approvalThreshold: z.number().int().min(1),
  requiresAssignedReviewer: z.boolean().default(true),
  updatedAt: z.string().min(1),
  updatedBy: z.string().min(1)
});

export const reviewApprovalSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  noteId: z.string().min(1),
  reviewerId: z.string().min(1),
  approvedAt: z.string().min(1)
});

export const reviewDispositionSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  noteId: z.string().min(1),
  disposition: z.enum(["contested", "rejected", "deferred", "escalated"]),
  status: z.enum(["open", "resolved"]),
  reason: z.string().min(1),
  assignedTo: z.string().min(1),
  dueAt: z.string().min(1).nullable(),
  openedAt: z.string().min(1),
  openedBy: z.string().min(1),
  resolvedAt: z.string().min(1).nullable(),
  resolvedBy: z.string().min(1).nullable(),
  resolutionSummary: z.string().min(1).nullable()
});

function duplicatePersistedValue<T>(items: T[], valueForItem: (item: T) => string): string | undefined {
  const seen = new Set<string>();
  for (const item of items) {
    const value = valueForItem(item);
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

function addDuplicatePersistedValueIssue<T>(
  context: z.RefinementCtx,
  path: string,
  label: string,
  items: T[],
  valueForItem: (item: T) => string
) {
  const duplicate = duplicatePersistedValue(items, valueForItem);
  if (duplicate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate persisted ${label} in ${path}: ${duplicate}`,
      path: [path]
    });
  }
}

function addReviewPolicyIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    users: Array<z.infer<typeof userSchema>>;
    reviewPolicies: Array<z.infer<typeof reviewPolicySchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const usersById = new Map(users.map((user) => [user.id, user]));
  const assignableReviewerCount = users.filter((user) => isReviewPolicyAssignableRole(user.role)).length;

  for (const policy of state.reviewPolicies) {
    const duplicateReviewerId = duplicatePersistedValue(policy.assignedReviewerIds, (reviewerId) => reviewerId);
    if (duplicateReviewerId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review policy assignedReviewerIds must be unique",
        path: ["reviewPolicies", policy.id]
      });
      continue;
    }

    for (const reviewerId of policy.assignedReviewerIds) {
      const reviewer = usersById.get(reviewerId);
      if (!reviewer) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Review policy references unknown reviewer: ${reviewerId}`,
          path: ["reviewPolicies", policy.id]
        });
        continue;
      }

      if (!isReviewPolicyAssignableRole(reviewer.role)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Review policy reviewer is not assignable: ${reviewerId}`,
          path: ["reviewPolicies", policy.id]
        });
      }
    }

    if (policy.requiresAssignedReviewer && policy.approvalThreshold > policy.assignedReviewerIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review policy approvalThreshold cannot exceed assigned reviewers",
        path: ["reviewPolicies", policy.id]
      });
    }

    if (!policy.requiresAssignedReviewer && policy.approvalThreshold > assignableReviewerCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review policy approvalThreshold cannot exceed assignable reviewers",
        path: ["reviewPolicies", policy.id]
      });
    }
  }
}

function addReviewApprovalIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    notes: Array<z.infer<typeof noteSchema>>;
    users: Array<z.infer<typeof userSchema>>;
    reviewApprovals: Array<z.infer<typeof reviewApprovalSchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const usersById = new Map(users.map((user) => [user.id, user]));
  const notesById = new Map(state.notes.map((note) => [note.id, note]));

  for (const approval of state.reviewApprovals) {
    const note = notesById.get(approval.noteId);
    if (!note) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review approval references missing note: ${approval.noteId}`,
        path: ["reviewApprovals", approval.id]
      });
    } else if (approval.languageId !== note.languageId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review approval language ${approval.languageId} does not match note ${approval.noteId} language ${note.languageId}`,
        path: ["reviewApprovals", approval.id]
      });
    }

    const reviewer = usersById.get(approval.reviewerId);
    if (!reviewer) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review approval references unknown reviewer: ${approval.reviewerId}`,
        path: ["reviewApprovals", approval.id]
      });
      continue;
    }

    if (!isReviewPolicyAssignableRole(reviewer.role)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review approval reviewer is not assignable: ${approval.reviewerId}`,
        path: ["reviewApprovals", approval.id]
      });
    }
  }
}

function duplicateReviewApprovalKey(
  approvals: Array<Pick<ReviewApproval, "languageId" | "noteId" | "reviewerId">>
): string | undefined {
  const seen = new Set<string>();
  for (const approval of approvals) {
    const key = `${approval.languageId}/${approval.noteId}/${approval.reviewerId}`;
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return undefined;
}

export const appStateSchema = z.object({
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
}).superRefine((state, context) => {
  addDuplicatePersistedValueIssue(context, "languages", "id", state.languages, (item) => item.id);
  addDuplicatePersistedValueIssue(context, "corpus", "id", state.corpus, (item) => item.id);
  addDuplicatePersistedValueIssue(context, "corpusAnswerKeys", "passageId", state.corpusAnswerKeys ?? [], (item) => item.passageId);
  addDuplicatePersistedValueIssue(context, "noteAnswerKeys", "id", state.noteAnswerKeys, (item) => item.id);
  addDuplicatePersistedValueIssue(context, "notes", "id", state.notes, (item) => item.id);
  addDuplicatePersistedValueIssue(context, "exercises", "id", state.exercises, (item) => item.id);
  addDuplicatePersistedValueIssue(context, "exerciseSubmissions", "id", state.exerciseSubmissions, (item) => item.id);
  addDuplicatePersistedValueIssue(context, "evaluationRuns", "id", state.evaluationRuns, (item) => item.id);
  addDuplicatePersistedValueIssue(context, "governance", "id", state.governance, (item) => item.id);
  addDuplicatePersistedValueIssue(context, "users", "id", state.users, (item) => item.id);
  addDuplicatePersistedValueIssue(context, "aiSessions", "id", state.aiSessions, (item) => item.id);
  addDuplicatePersistedValueIssue(context, "elderCorrections", "id", state.elderCorrections, (item) => item.id);
  addDuplicatePersistedValueIssue(context, "auditEvents", "id", state.auditEvents, (item) => item.id);
  addDuplicatePersistedValueIssue(context, "reviewPolicies", "id", state.reviewPolicies, (item) => item.id);
  addDuplicatePersistedValueIssue(context, "reviewApprovals", "id", state.reviewApprovals, (item) => item.id);
  addDuplicatePersistedValueIssue(context, "reviewDispositions", "id", state.reviewDispositions, (item) => item.id);
  addReviewPolicyIntegrityIssues(context, state);
  addReviewApprovalIntegrityIssues(context, state);

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
      schemaVersion: 7,
      noteAnswerKeys: legacy.data.notes.map(migrateLegacyNoteToAnswerKey),
      exerciseSubmissions: [],
      auditEvents: [],
      reviewPolicies: [],
      reviewApprovals: [],
      reviewDispositions: []
    }));
  }

  const legacyV2 = legacyAppStateV2Schema.safeParse(input);
  if (legacyV2.success) {
    return ensureCorpusAnswerKeys(appStateSchema.parse({
      ...legacyV2.data,
      schemaVersion: 7,
      exerciseSubmissions: [],
      auditEvents: [],
      reviewPolicies: [],
      reviewApprovals: [],
      reviewDispositions: []
    }));
  }

  const legacyV3 = legacyAppStateV3Schema.safeParse(input);
  if (legacyV3.success) {
    return ensureCorpusAnswerKeys(appStateSchema.parse({
      ...legacyV3.data,
      schemaVersion: 7,
      auditEvents: [],
      reviewPolicies: [],
      reviewApprovals: [],
      reviewDispositions: []
    }));
  }

  const legacyV4 = legacyAppStateV4Schema.safeParse(input);
  if (legacyV4.success) {
    return ensureCorpusAnswerKeys(appStateSchema.parse({
      ...legacyV4.data,
      schemaVersion: 7,
      auditEvents: [],
      reviewPolicies: [],
      reviewApprovals: [],
      reviewDispositions: []
    }));
  }

  const legacyV5 = legacyAppStateV5Schema.safeParse(input);
  if (legacyV5.success) {
    return ensureCorpusAnswerKeys(appStateSchema.parse({
      ...legacyV5.data,
      schemaVersion: 7,
      reviewPolicies: [],
      reviewApprovals: [],
      reviewDispositions: []
    }));
  }

  const legacyV6 = legacyAppStateV6Schema.safeParse(input);
  if (legacyV6.success) {
    return ensureCorpusAnswerKeys(appStateSchema.parse({
      ...legacyV6.data,
      schemaVersion: 7,
      reviewDispositions: []
    }));
  }

  return ensureCorpusAnswerKeys(appStateSchema.parse(input));
}
