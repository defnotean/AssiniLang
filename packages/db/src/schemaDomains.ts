import { z } from "zod";

export const languageTypologySchema = z.enum([
  "agglutinative",
  "isolating",
  "fusional",
  "polysynthetic-lite",
  "polysynthetic",
  "analytic",
  "mixed",
  "unknown"
]);

export const languageStatusSchema = z.enum(["active", "draft", "archived"]);

export const languagePhonologySchema = z.object({
  consonants: z.array(z.string().min(1)).default([]),
  vowels: z.array(z.string().min(1)).default([]),
  syllableTemplate: z.string().optional(),
  stress: z.string().optional(),
  notes: z.array(z.string().min(1)).default([])
});

export const languageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  typology: languageTypologySchema,
  description: z.string().min(1),
  orthography: z.string().min(1),
  status: languageStatusSchema,
  phonology: languagePhonologySchema.optional(),
  createdBy: z.string().min(1).optional(),
  createdAt: z.string().min(1).optional()
});

export const morphemeSchema = z.object({
  surface: z.string().min(1),
  lemma: z.string().min(1),
  gloss: z.string().min(1),
  features: z.array(z.string()).default([])
});

export const CONSENT_USE_VALUES = [
  "testing-only",
  "community-approved",
  "personal-study",
  "research",
  "public-domain",
  "licensed",
  "pending-review"
] as const;

export const consentUseSchema = z.enum(CONSENT_USE_VALUES);

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
    use: consentUseSchema,
    restrictions: z.array(z.string())
  }),
  sourceAssetId: z.string().min(1).optional()
});

export const corpusAnswerKeySchema = z.object({
  passageId: z.string().min(1),
  languageId: z.string().min(1),
  textTarget: z.string().min(1),
  textTranslation: z.string().min(1),
  morphologicalSegmentation: z.array(morphemeSchema)
});

export const lexemeSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  form: z.string().min(1),
  gloss: z.string().min(1),
  partOfSpeech: z.string().min(1),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
  sourceAssetIds: z.array(z.string().min(1)).default([]),
  createdBy: z.string().min(1).optional(),
  createdAt: z.string().min(1).optional()
});

export const sourceAssetKindSchema = z.enum(["text", "wordlist", "url", "image", "audio", "document"]);
export const sourceAssetStatusSchema = z.enum(["pending", "processing", "processed", "failed", "archived"]);

export const sourceAssetSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  kind: sourceAssetKindSchema,
  title: z.string().min(1),
  originalName: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  filePath: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  rawText: z.string().optional(),
  transcript: z.string().optional(),
  status: sourceAssetStatusSchema,
  error: z.string().optional(),
  summary: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  createdBy: z.string().min(1),
  createdAt: z.string().min(1),
  processedAt: z.string().min(1).optional(),
  processingStartedAt: z.string().min(1).optional(),
  processingAttempts: z.number().int().nonnegative().optional(),
  processingHeartbeatAt: z.string().min(1).optional()
});

export const extractionDraftKindSchema = z.enum(["lexeme", "corpus_passage", "grammar_note"]);
export const extractionDraftStatusSchema = z.enum(["proposed", "accepted", "rejected"]);

export const extractionDraftPayloadSchema = z.object({
  form: z.string().optional(),
  gloss: z.string().optional(),
  partOfSpeech: z.string().optional(),
  tags: z.array(z.string()).default([]),
  textTarget: z.string().optional(),
  textTranslation: z.string().optional(),
  morphologicalSegmentation: z.array(morphemeSchema).default([]),
  topicTags: z.array(z.string()).default([]),
  topic: z.string().optional(),
  explanation: z.string().optional()
});

export const extractionDraftSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  sourceAssetId: z.string().min(1),
  kind: extractionDraftKindSchema,
  payload: extractionDraftPayloadSchema,
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  rationale: z.string().optional(),
  status: extractionDraftStatusSchema,
  createdAt: z.string().min(1),
  reviewedBy: z.string().min(1).optional(),
  reviewedAt: z.string().min(1).optional(),
  committedEntityId: z.string().min(1).optional()
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
  examples: z.array(
    z.object({
      passageId: z.string().min(1),
      target: z.string().min(1),
      translation: z.string().min(1)
    })
  ),
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
  editHistory: z.array(
    z.object({
      at: z.string(),
      by: z.string(),
      action: z.string(),
      summary: z.string()
    })
  )
});

export const exerciseSchema = z.object({
  id: z.string().min(1),
  languageId: z.string().min(1),
  type: z.enum(["translate_to_target", "translate_to_english", "segment", "choose_particle"]),
  prompt: z.string().min(1),
  allowedVocabulary: z.array(z.string()),
  allowedRuleIds: z.array(z.string()),
  expectedAnswers: z.array(z.string().min(1)),
  adversarialAnswers: z
    .array(
      z.object({
        answer: z.string().min(1),
        reason: z.string().min(1)
      })
    )
    .default([]),
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
export const reviewDispositionNoteStatusSet = new Set<string>(["contested", "rejected", "deferred", "escalated"]);

export function isReviewPolicyAssignableRole(role: z.infer<typeof userRoleSchema>): boolean {
  return reviewPolicyAssignableRoleSet.has(role);
}

export const REVIEW_POLICY_UPDATER_ROLES = ["lead", "admin"] as const;
export const reviewPolicyUpdaterRoleSet = new Set<string>(REVIEW_POLICY_UPDATER_ROLES);
export const reviewPolicySystemUpdaterIds = new Set<string>(["system-seed"]);
export const noteSystemActorIds = new Set<string>([
  "deterministic-study-loop",
  "legacy-v1-migration",
  "test-generator"
]);
export const noteEditHistoryActionSet = new Set<string>([
  "applied_correction",
  "created",
  "disposition_resolved",
  "drafted",
  "migrated",
  "reviewed"
]);

export function isReviewPolicyUpdaterRole(role: z.infer<typeof userRoleSchema>): boolean {
  return reviewPolicyUpdaterRoleSet.has(role);
}

export const ELDER_CORRECTION_MUTATION_ROLES = ["elder", "lead", "admin"] as const;
const elderCorrectionMutationRoleSet = new Set<string>(ELDER_CORRECTION_MUTATION_ROLES);

export function isElderCorrectionMutationRole(role: z.infer<typeof userRoleSchema>): boolean {
  return elderCorrectionMutationRoleSet.has(role);
}

export const EXERCISE_SUBMISSION_ACTOR_ROLES = ["learner", "reviewer", "lead", "admin"] as const;
const exerciseSubmissionActorRoleSet = new Set<string>(EXERCISE_SUBMISSION_ACTOR_ROLES);

export function isExerciseSubmissionActorRole(role: z.infer<typeof userRoleSchema>): boolean {
  return exerciseSubmissionActorRoleSet.has(role);
}

export const GOVERNANCE_APPROVER_ROLES = ["elder", "lead", "admin"] as const;
const governanceApproverRoleSet = new Set<string>(GOVERNANCE_APPROVER_ROLES);

export function isGovernanceApproverRole(role: z.infer<typeof userRoleSchema>): boolean {
  return governanceApproverRoleSet.has(role);
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
  "elder_correction",
  "language",
  "source_asset",
  "extraction_draft",
  "lexeme"
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
export const AI_SESSION_MODE_ROLES = {
  learner_practice: ["learner", "elder", "reviewer", "lead", "admin"],
  elder_review: ["elder", "lead", "admin"],
  programmer_debug: ["programmer", "admin"]
} satisfies Record<z.infer<typeof aiSessionModeSchema>, readonly z.infer<typeof userRoleSchema>[]>;

export function isAiSessionCreatorRole(
  mode: z.infer<typeof aiSessionModeSchema>,
  role: z.infer<typeof userRoleSchema>
): boolean {
  const allowedRoles: readonly z.infer<typeof userRoleSchema>[] = AI_SESSION_MODE_ROLES[mode];
  return allowedRoles.includes(role);
}

export const aiMessageRoleSchema = z.enum(["system", "user", "assistant", "tool"]);
export const aiTraceStepKindSchema = z.enum([
  "input",
  "retrieval",
  "policy_check",
  "generation",
  "correction",
  "output"
]);
export const neuralMapNodeTypeSchema = z.enum([
  "language",
  "source_asset",
  "corpus",
  "morpheme",
  "topic_tag",
  "note",
  "exercise",
  "ai_session",
  "elder_correction",
  "output"
]);
export const neuralMapEdgeRelationSchema = z.enum([
  "has_corpus",
  "from_source",
  "contains_morpheme",
  "tagged",
  "co_occurs",
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

export const elderCorrectionSchema = z
  .object({
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
  })
  .refine(
    (correction) =>
      correction.noteId !== undefined || correction.passageId !== undefined || correction.contextText !== undefined,
    {
      message: "At least one correction target or contextText is required"
    }
  );

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
