import { z } from "zod";
import { auditMetadataPrivacyIssue } from "./auditMetadataPrivacy.js";
import { sourceAssetFilePathIssue } from "./sourceAssetPathValidation.js";

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
  processingAttempts: z.number().int().nonnegative().optional()
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
const reviewDispositionNoteStatusSet = new Set<string>(["contested", "rejected", "deferred", "escalated"]);

export function isReviewPolicyAssignableRole(role: z.infer<typeof userRoleSchema>): boolean {
  return reviewPolicyAssignableRoleSet.has(role);
}

export const REVIEW_POLICY_UPDATER_ROLES = ["lead", "admin"] as const;
const reviewPolicyUpdaterRoleSet = new Set<string>(REVIEW_POLICY_UPDATER_ROLES);
const reviewPolicySystemUpdaterIds = new Set<string>(["system-seed"]);
const noteSystemActorIds = new Set<string>([
  "deterministic-study-loop",
  "legacy-v1-migration",
  "test-generator"
]);
const noteEditHistoryActionSet = new Set<string>([
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
export const aiTraceStepKindSchema = z.enum(["input", "retrieval", "policy_check", "generation", "correction", "output"]);
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

function normalizePersistedText(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePersistedSurfaceKey(input: string): string {
  return normalizePersistedText(input).replace(/-/g, "");
}

function duplicateNormalizedPersistedValue(items: string[]): string | undefined {
  const seen = new Set<string>();
  for (const item of items) {
    const normalized = normalizePersistedText(item);
    if (seen.has(normalized)) return normalized;
    seen.add(normalized);
  }
  return undefined;
}

function isBlankPersistedValue(item: string): boolean {
  return normalizePersistedText(item).length === 0;
}

function isSafePersistedLanguageId(item: string): boolean {
  return /^[a-z0-9][a-z0-9_-]*$/.test(item);
}

function corpusTargetContainsSurface(textTarget: string, surface: string): boolean {
  const normalizedSurface = normalizePersistedSurfaceKey(surface);
  return normalizePersistedText(textTarget)
    .split(/\s+/)
    .some((token) => {
      const normalizedToken = token.replace(/-/g, "");
      return normalizedToken === normalizedSurface || normalizedToken.includes(normalizedSurface);
    });
}

function hasContiguousMorphemeCoverage(
  targetToken: string,
  morphemes: Array<Pick<z.infer<typeof morphemeSchema>, "surface">>
): boolean {
  const targetKey = normalizePersistedSurfaceKey(targetToken);
  const surfaceKeys = morphemes.map((morpheme) => normalizePersistedSurfaceKey(morpheme.surface));

  for (let start = 0; start < surfaceKeys.length; start += 1) {
    let candidate = "";
    for (let end = start; end < surfaceKeys.length; end += 1) {
      candidate += surfaceKeys[end];
      if (candidate === targetKey) return true;
      if (!targetKey.startsWith(candidate)) break;
    }
  }

  return false;
}

function findUncoveredPersistedCorpusTargetTokens(
  textTarget: string,
  morphemes: Array<Pick<z.infer<typeof morphemeSchema>, "surface">>
): string[] {
  return normalizePersistedText(textTarget)
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .filter((token) => !hasContiguousMorphemeCoverage(token, morphemes));
}

function addCorpusTextIntegrityIssues(
  context: z.RefinementCtx,
  collectionPath: "corpus" | "corpusAnswerKeys",
  passageId: string,
  label: "Corpus" | "Corpus answer key",
  textTarget: string,
  textTranslation: string,
  morphologicalSegmentation: Array<z.infer<typeof morphemeSchema>>
) {
  if (isBlankPersistedValue(textTarget)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${label} target text must not be blank for passage ${passageId}`,
      path: [collectionPath, passageId]
    });
  }

  if (isBlankPersistedValue(textTranslation)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${label} translation must not be blank for passage ${passageId}`,
      path: [collectionPath, passageId]
    });
  }

  for (const morpheme of morphologicalSegmentation) {
    if (isBlankPersistedValue(morpheme.surface)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} morpheme surface must not be blank for passage ${passageId}`,
        path: [collectionPath, passageId]
      });
    }

    if (isBlankPersistedValue(morpheme.lemma)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} morpheme lemma must not be blank for passage ${passageId} surface ${morpheme.surface}`,
        path: [collectionPath, passageId]
      });
    }

    if (isBlankPersistedValue(morpheme.gloss)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} morpheme gloss must not be blank for passage ${passageId} surface ${morpheme.surface}`,
        path: [collectionPath, passageId]
      });
    }

    if (!corpusTargetContainsSurface(textTarget, morpheme.surface)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} segmentation surface is not present in target text for passage ${passageId}: ${morpheme.surface}`,
        path: [collectionPath, passageId]
      });
    }

    for (const feature of morpheme.features) {
      if (isBlankPersistedValue(feature)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} morpheme feature must not be blank for passage ${passageId} surface ${morpheme.surface}`,
          path: [collectionPath, passageId]
        });
      }
    }

    const duplicateFeature = duplicateNormalizedPersistedValue(morpheme.features);
    if (duplicateFeature) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} morpheme feature is duplicated for passage ${passageId} surface ${morpheme.surface}: ${duplicateFeature}`,
        path: [collectionPath, passageId]
      });
    }
  }

  for (const token of findUncoveredPersistedCorpusTargetTokens(textTarget, morphologicalSegmentation)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${label} segmentation does not cover target token for passage ${passageId}: ${token}`,
      path: [collectionPath, passageId]
    });
  }
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

function addBlankPersistedValueIssue<T>(
  context: z.RefinementCtx,
  path: string,
  label: string,
  items: T[],
  valueForItem: (item: T) => string
) {
  for (const item of items) {
    if (isBlankPersistedValue(valueForItem(item))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Persisted ${label} must not be blank in ${path}`,
        path: [path]
      });
    }
  }
}

function addParseablePersistedDateIssue(
  context: z.RefinementCtx,
  path: string,
  recordId: string,
  label: string,
  value: string | null
) {
  if (value !== null && Number.isNaN(Date.parse(value))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${label} must be parseable: ${value}`,
      path: [path, recordId]
    });
  }
}

function isAllowedPersistedNoteActor(usersById: Map<string, z.infer<typeof userSchema>>, actorId: string): boolean {
  const actor = usersById.get(actorId);
  return noteSystemActorIds.has(actorId) || (actor !== undefined && isReviewPolicyAssignableRole(actor.role));
}

function addLanguageIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
  }
) {
  for (const language of state.languages) {
    const languagePathId = isBlankPersistedValue(language.id) ? "blank-language" : language.id;
    if (isBlankPersistedValue(language.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Language id must not be blank",
        path: ["languages", languagePathId]
      });
    } else if (!isSafePersistedLanguageId(language.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Language id must be a safe slug: ${language.id}`,
        path: ["languages", languagePathId]
      });
    }

    if (isBlankPersistedValue(language.name)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Language name must not be blank: ${languagePathId}`,
        path: ["languages", languagePathId]
      });
    }

    if (isBlankPersistedValue(language.description)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Language description must not be blank: ${languagePathId}`,
        path: ["languages", languagePathId]
      });
    }

    if (isBlankPersistedValue(language.orthography)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Language orthography must not be blank: ${languagePathId}`,
        path: ["languages", languagePathId]
      });
    }

    if (language.createdAt !== undefined && Number.isNaN(Date.parse(language.createdAt))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Language createdAt must be a parseable timestamp: ${languagePathId}`,
        path: ["languages", languagePathId]
      });
    }

    if (language.phonology) {
      for (const [field, values] of [
        ["consonants", language.phonology.consonants],
        ["vowels", language.phonology.vowels],
        ["notes", language.phonology.notes]
      ] as const) {
        for (const value of values) {
          if (isBlankPersistedValue(value)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Language phonology ${field} must not be blank: ${languagePathId}`,
              path: ["languages", languagePathId]
            });
          }
        }
      }

      if (
        language.phonology.syllableTemplate !== undefined
        && isBlankPersistedValue(language.phonology.syllableTemplate)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Language phonology syllableTemplate must not be blank: ${languagePathId}`,
          path: ["languages", languagePathId]
        });
      }

      if (language.phonology.stress !== undefined && isBlankPersistedValue(language.phonology.stress)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Language phonology stress must not be blank: ${languagePathId}`,
          path: ["languages", languagePathId]
        });
      }
    }
  }
}

function addLexemeIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    lexemes: Array<z.infer<typeof lexemeSchema>>;
    sourceAssets: Array<z.infer<typeof sourceAssetSchema>>;
  }
) {
  const languageIds = new Set(state.languages.map((language) => language.id));
  const sourceAssetsById = new Map(state.sourceAssets.map((asset) => [asset.id, asset]));
  const seenForms = new Set<string>();

  for (const lexeme of state.lexemes) {
    if (!languageIds.has(lexeme.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Lexeme references missing language: ${lexeme.languageId}`,
        path: ["lexemes", lexeme.id]
      });
    }

    for (const [field, value] of [["form", lexeme.form], ["gloss", lexeme.gloss], ["partOfSpeech", lexeme.partOfSpeech]] as const) {
      if (isBlankPersistedValue(value)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Lexeme ${field} must not be blank: ${lexeme.id}`,
          path: ["lexemes", lexeme.id]
        });
      }
    }

    const seenSourceAssetIds = new Set<string>();
    for (const sourceAssetId of lexeme.sourceAssetIds) {
      if (isBlankPersistedValue(sourceAssetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Lexeme sourceAssetId must not be blank: ${lexeme.id}`,
          path: ["lexemes", lexeme.id]
        });
        continue;
      }

      if (seenSourceAssetIds.has(sourceAssetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Lexeme sourceAssetId is duplicated: ${sourceAssetId}`,
          path: ["lexemes", lexeme.id]
        });
        continue;
      }
      seenSourceAssetIds.add(sourceAssetId);

      const sourceAsset = sourceAssetsById.get(sourceAssetId);
      if (!sourceAsset) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Lexeme references missing source asset: ${sourceAssetId}`,
          path: ["lexemes", lexeme.id]
        });
        continue;
      }

      if (sourceAsset.languageId !== lexeme.languageId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Lexeme source asset ${sourceAssetId} belongs to language ${sourceAsset.languageId}, not ${lexeme.languageId}`,
          path: ["lexemes", lexeme.id]
        });
      }
    }

    const formKey = `${lexeme.languageId}::${normalizePersistedText(lexeme.form)}::${normalizePersistedText(lexeme.gloss)}`;
    if (seenForms.has(formKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate lexeme form/gloss for language ${lexeme.languageId}: ${lexeme.form}`,
        path: ["lexemes", lexeme.id]
      });
    }
    seenForms.add(formKey);
  }
}

function addSourceAssetIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    sourceAssets: Array<z.infer<typeof sourceAssetSchema>>;
  }
) {
  const languageIds = new Set(state.languages.map((language) => language.id));

  for (const asset of state.sourceAssets) {
    if (!languageIds.has(asset.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Source asset references missing language: ${asset.languageId}`,
        path: ["sourceAssets", asset.id]
      });
    }

    if (isBlankPersistedValue(asset.title)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Source asset title must not be blank: ${asset.id}`,
        path: ["sourceAssets", asset.id]
      });
    }

    if (Number.isNaN(Date.parse(asset.createdAt))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Source asset createdAt must be a parseable timestamp: ${asset.id}`,
        path: ["sourceAssets", asset.id]
      });
    }

    if (asset.kind === "url" && (asset.url === undefined || isBlankPersistedValue(asset.url))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `URL source asset requires a url: ${asset.id}`,
        path: ["sourceAssets", asset.id]
      });
    }

    if ((asset.kind === "text" || asset.kind === "wordlist") && asset.rawText === undefined && asset.filePath === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Text source asset requires rawText or filePath: ${asset.id}`,
        path: ["sourceAssets", asset.id]
      });
    }

    if ((asset.kind === "image" || asset.kind === "audio" || asset.kind === "document") && asset.filePath === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `File-backed source asset requires filePath: ${asset.id}`,
        path: ["sourceAssets", asset.id]
      });
    }

    if (asset.processedAt !== undefined && Number.isNaN(Date.parse(asset.processedAt))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Source asset processedAt must be a parseable timestamp: ${asset.id}`,
        path: ["sourceAssets", asset.id]
      });
    }

    if (asset.status === "failed" && (asset.error === undefined || isBlankPersistedValue(asset.error))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Failed source asset requires an error: ${asset.id}`,
        path: ["sourceAssets", asset.id]
      });
    }

    if (asset.status !== "failed" && asset.error !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Non-failed source asset must not carry an error: ${asset.id}`,
        path: ["sourceAssets", asset.id]
      });
    }

    if (asset.warnings) {
      for (const warning of asset.warnings) {
        if (isBlankPersistedValue(warning)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Source asset warning must not be blank: ${asset.id}`,
            path: ["sourceAssets", asset.id]
          });
        }
      }
    }

    if (asset.filePath !== undefined) {
      const filePathIssue = sourceAssetFilePathIssue(asset.filePath, asset.languageId);
      if (filePathIssue) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${filePathIssue}: ${asset.id}`,
          path: ["sourceAssets", asset.id]
        });
      }
    }
  }
}

function addExtractionDraftIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    corpus: Array<z.infer<typeof corpusPassageSchema>>;
    notes: Array<z.infer<typeof noteSchema>>;
    lexemes: Array<z.infer<typeof lexemeSchema>>;
    sourceAssets: Array<z.infer<typeof sourceAssetSchema>>;
    extractionDrafts: Array<z.infer<typeof extractionDraftSchema>>;
  }
) {
  const languageIds = new Set(state.languages.map((language) => language.id));
  const sourceAssetsById = new Map(state.sourceAssets.map((asset) => [asset.id, asset]));
  const corpusById = new Map(state.corpus.map((passage) => [passage.id, passage]));
  const notesById = new Map(state.notes.map((note) => [note.id, note]));
  const lexemesById = new Map(state.lexemes.map((lexeme) => [lexeme.id, lexeme]));

  for (const draft of state.extractionDrafts) {
    if (!languageIds.has(draft.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Extraction draft references missing language: ${draft.languageId}`,
        path: ["extractionDrafts", draft.id]
      });
    }

    const sourceAsset = sourceAssetsById.get(draft.sourceAssetId);
    if (!sourceAsset) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Extraction draft references missing source asset: ${draft.sourceAssetId}`,
        path: ["extractionDrafts", draft.id]
      });
    } else if (sourceAsset.languageId !== draft.languageId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Extraction draft source asset ${draft.sourceAssetId} belongs to language ${sourceAsset.languageId}, not ${draft.languageId}`,
        path: ["extractionDrafts", draft.id]
      });
    }

    if (Number.isNaN(Date.parse(draft.createdAt))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Extraction draft createdAt must be a parseable timestamp: ${draft.id}`,
        path: ["extractionDrafts", draft.id]
      });
    }

    if (draft.kind === "lexeme" && (!draft.payload.form?.trim() || !draft.payload.gloss?.trim())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Lexeme extraction draft requires form and gloss: ${draft.id}`,
        path: ["extractionDrafts", draft.id]
      });
    }

    if (draft.kind === "corpus_passage" && (!draft.payload.textTarget?.trim() || !draft.payload.textTranslation?.trim())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus extraction draft requires textTarget and textTranslation: ${draft.id}`,
        path: ["extractionDrafts", draft.id]
      });
    }

    if (draft.kind === "grammar_note" && (!draft.payload.topic?.trim() || !draft.payload.explanation?.trim())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Grammar note extraction draft requires topic and explanation: ${draft.id}`,
        path: ["extractionDrafts", draft.id]
      });
    }

    if (draft.status === "proposed" && (draft.reviewedBy !== undefined || draft.reviewedAt !== undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Proposed extraction draft must not carry review attribution: ${draft.id}`,
        path: ["extractionDrafts", draft.id]
      });
    }

    if (draft.status !== "proposed" && (draft.reviewedBy === undefined || draft.reviewedAt === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Reviewed extraction draft requires reviewedBy and reviewedAt: ${draft.id}`,
        path: ["extractionDrafts", draft.id]
      });
    }

    if (draft.status !== "accepted" && draft.committedEntityId !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Non-accepted extraction draft must not carry committedEntityId: ${draft.id}`,
        path: ["extractionDrafts", draft.id]
      });
    }

    if (draft.status === "accepted") {
      if (draft.committedEntityId === undefined || isBlankPersistedValue(draft.committedEntityId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Accepted extraction draft requires committedEntityId: ${draft.id}`,
          path: ["extractionDrafts", draft.id]
        });
      } else {
        const committedEntity = draft.kind === "lexeme"
          ? lexemesById.get(draft.committedEntityId)
          : draft.kind === "corpus_passage"
            ? corpusById.get(draft.committedEntityId)
            : notesById.get(draft.committedEntityId);
        if (!committedEntity) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Extraction draft committedEntityId references missing ${draft.kind} entity: ${draft.committedEntityId}`,
            path: ["extractionDrafts", draft.id]
          });
        } else if (committedEntity.languageId !== draft.languageId) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Extraction draft committedEntityId ${draft.committedEntityId} belongs to language ${committedEntity.languageId}, not ${draft.languageId}`,
            path: ["extractionDrafts", draft.id]
          });
        }
      }
    }

    if (draft.reviewedAt !== undefined && Number.isNaN(Date.parse(draft.reviewedAt))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Extraction draft reviewedAt must be a parseable timestamp: ${draft.id}`,
        path: ["extractionDrafts", draft.id]
      });
    }
  }
}

function addUserIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    users: Array<z.infer<typeof userSchema>>;
  }
) {
  for (const user of state.users) {
    const userPathId = isBlankPersistedValue(user.id) ? "blank-user" : user.id;
    if (isBlankPersistedValue(user.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "User id must not be blank",
        path: ["users", userPathId]
      });
    }

    if (isBlankPersistedValue(user.name)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `User name must not be blank: ${userPathId}`,
        path: ["users", userPathId]
      });
    }

    if (user.avatarUrl !== undefined && isBlankPersistedValue(user.avatarUrl)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `User avatarUrl must not be blank: ${userPathId}`,
        path: ["users", userPathId]
      });
    }
  }
}

function addCorpusIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    corpus: Array<z.infer<typeof corpusPassageSchema>>;
    sourceAssets: Array<z.infer<typeof sourceAssetSchema>>;
  }
) {
  const languageIds = new Set(state.languages.map((language) => language.id));
  const sourceAssetsById = new Map(state.sourceAssets.map((asset) => [asset.id, asset]));

  for (const passage of state.corpus) {
    if (isBlankPersistedValue(passage.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus passage languageId must not be blank: ${passage.id}`,
        path: ["corpus", passage.id]
      });
    } else if (!languageIds.has(passage.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus passage references missing language: ${passage.languageId}`,
        path: ["corpus", passage.id]
      });
    }

    if (passage.sourceAssetId !== undefined) {
      if (isBlankPersistedValue(passage.sourceAssetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Corpus passage sourceAssetId must not be blank: ${passage.id}`,
          path: ["corpus", passage.id]
        });
      } else {
        const sourceAsset = sourceAssetsById.get(passage.sourceAssetId);
        if (!sourceAsset) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Corpus passage references missing source asset: ${passage.sourceAssetId}`,
            path: ["corpus", passage.id]
          });
        } else if (
          !isBlankPersistedValue(passage.languageId)
          && sourceAsset.languageId !== passage.languageId
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Corpus passage source asset ${passage.sourceAssetId} belongs to language ${sourceAsset.languageId}, not ${passage.languageId}`,
            path: ["corpus", passage.id]
          });
        }
      }
    }

    if (isBlankPersistedValue(passage.source)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus source must not be blank for passage ${passage.id}`,
        path: ["corpus", passage.id]
      });
    }

    if (isBlankPersistedValue(passage.sourceMetadata.author)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus source author must not be blank for passage ${passage.id}`,
        path: ["corpus", passage.id]
      });
    }

    if (isBlankPersistedValue(passage.sourceMetadata.license)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus source license must not be blank for passage ${passage.id}`,
        path: ["corpus", passage.id]
      });
    }

    if (isBlankPersistedValue(passage.sourceMetadata.consentRecord)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus source consent record must not be blank for passage ${passage.id}`,
        path: ["corpus", passage.id]
      });
    }

    addCorpusTextIntegrityIssues(
      context,
      "corpus",
      passage.id,
      "Corpus",
      passage.textTarget,
      passage.textTranslation,
      passage.morphologicalSegmentation
    );

    if (passage.topicTags.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus passage requires at least one topic tag: ${passage.id}`,
        path: ["corpus", passage.id]
      });
    }

    for (const tag of passage.topicTags) {
      if (isBlankPersistedValue(tag)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Corpus topic tag must not be blank for passage ${passage.id}`,
          path: ["corpus", passage.id]
        });
      }
    }

    for (const restriction of passage.consentStatus.restrictions) {
      if (isBlankPersistedValue(restriction)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Corpus consent restriction must not be blank for passage ${passage.id}`,
          path: ["corpus", passage.id]
        });
      }
    }

    const duplicateTopicTag = duplicateNormalizedPersistedValue(passage.topicTags);
    if (duplicateTopicTag) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus topic tag is duplicated for passage ${passage.id}: ${duplicateTopicTag}`,
        path: ["corpus", passage.id]
      });
    }

  }
}

function addNoteCollectionIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    corpus: Array<z.infer<typeof corpusPassageSchema>>;
    users: Array<z.infer<typeof userSchema>>;
  },
  notes: Array<z.infer<typeof noteSchema>>,
  collectionPath: "notes" | "noteAnswerKeys",
  label: "Note" | "Note answer key"
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const usersById = new Map(users.map((user) => [user.id, user]));
  const languageIds = new Set(state.languages.map((language) => language.id));
  const passagesById = new Map(state.corpus.map((passage) => [passage.id, passage]));

  for (const note of notes) {
    if (isBlankPersistedValue(note.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} languageId must not be blank: ${note.id}`,
        path: [collectionPath, note.id]
      });
    } else if (!languageIds.has(note.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} references missing language: ${note.languageId}`,
        path: [collectionPath, note.id]
      });
    }

    if (isBlankPersistedValue(note.topic)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} topic must not be blank: ${note.id}`,
        path: [collectionPath, note.id]
      });
    }

    if (isBlankPersistedValue(note.explanation)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} explanation must not be blank: ${note.id}`,
        path: [collectionPath, note.id]
      });
    }

    if (isBlankPersistedValue(note.dialectScope)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} dialect scope must not be blank: ${note.id}`,
        path: [collectionPath, note.id]
      });
    }

    if (note.evidenceCount !== note.evidencePassageIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} evidenceCount ${note.evidenceCount} does not match evidencePassageIds length ${note.evidencePassageIds.length}: ${note.id}`,
        path: [collectionPath, note.id]
      });
    }

    addParseablePersistedDateIssue(context, collectionPath, note.id, `${label} reviewer lastReviewedAt`, note.reviewer.lastReviewedAt);
    if (note.reviewer.lastReviewedBy !== null && isBlankPersistedValue(note.reviewer.lastReviewedBy)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} reviewer lastReviewedBy must not be blank`,
        path: [collectionPath, note.id]
      });
    } else if (note.reviewer.lastReviewedBy !== null && !isAllowedPersistedNoteActor(usersById, note.reviewer.lastReviewedBy)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} reviewer lastReviewedBy is not allowed: ${note.reviewer.lastReviewedBy}`,
        path: [collectionPath, note.id]
      });
    }

    for (const comment of note.reviewer.comments) {
      if (comment.trim().length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} reviewer comment must not be blank`,
          path: [collectionPath, note.id]
        });
      }
    }

    for (const entry of note.editHistory) {
      addParseablePersistedDateIssue(context, collectionPath, note.id, `${label} editHistory at`, entry.at);
      if (isBlankPersistedValue(entry.by)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} editHistory by must not be blank`,
          path: [collectionPath, note.id]
        });
      } else if (!isAllowedPersistedNoteActor(usersById, entry.by)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} editHistory by is not allowed: ${entry.by}`,
          path: [collectionPath, note.id]
        });
      }

      if (entry.summary.trim().length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} editHistory summary must not be blank`,
          path: [collectionPath, note.id]
        });
      }

      if (!noteEditHistoryActionSet.has(entry.action)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} editHistory action is not allowed: ${entry.action}`,
          path: [collectionPath, note.id]
        });
      }
    }

    for (const passageId of note.evidencePassageIds) {
      if (isBlankPersistedValue(passageId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} evidencePassageId must not be blank`,
          path: [collectionPath, note.id]
        });
        continue;
      }

      const passage = passagesById.get(passageId);
      if (!passage) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} references missing evidence passage: ${passageId}`,
          path: [collectionPath, note.id]
        });
        continue;
      }

      if (passage.languageId !== note.languageId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} evidence passage ${passageId} language ${passage.languageId} does not match note ${note.id} language ${note.languageId}`,
          path: [collectionPath, note.id]
        });
      }
    }

    for (const example of note.examples) {
      if (isBlankPersistedValue(example.passageId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} example passageId must not be blank`,
          path: [collectionPath, note.id]
        });
        continue;
      }

      const passage = passagesById.get(example.passageId);
      if (!passage) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} references missing example passage: ${example.passageId}`,
          path: [collectionPath, note.id]
        });
        continue;
      }

      if (passage.languageId !== note.languageId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} example passage ${example.passageId} language ${passage.languageId} does not match note ${note.id} language ${note.languageId}`,
          path: [collectionPath, note.id]
        });
      }

      if (example.target !== passage.textTarget) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} example ${example.passageId} target does not match cited corpus textTarget`,
          path: [collectionPath, note.id]
        });
      }

      if (example.translation !== passage.textTranslation) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} example ${example.passageId} translation does not match cited corpus textTranslation`,
          path: [collectionPath, note.id]
        });
      }
    }
  }
}

function addExerciseIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    corpus: Array<z.infer<typeof corpusPassageSchema>>;
    exercises: Array<z.infer<typeof exerciseSchema>>;
  }
) {
  const languageIds = new Set(state.languages.map((language) => language.id));
  const corpusTargetsByLanguage = new Map<string, Set<string>>();

  for (const passage of state.corpus) {
    const targets = corpusTargetsByLanguage.get(passage.languageId) ?? new Set<string>();
    targets.add(normalizePersistedText(passage.textTarget));
    corpusTargetsByLanguage.set(passage.languageId, targets);
  }

  for (const exercise of state.exercises) {
    const exerciseLanguageIdIsBlank = isBlankPersistedValue(exercise.languageId);
    if (exerciseLanguageIdIsBlank) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise languageId must not be blank: ${exercise.id}`,
        path: ["exercises", exercise.id]
      });
    } else if (!languageIds.has(exercise.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise references missing language: ${exercise.languageId}`,
        path: ["exercises", exercise.id]
      });
    }

    if (isBlankPersistedValue(exercise.prompt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise prompt must not be blank: ${exercise.id}`,
        path: ["exercises", exercise.id]
      });
    }

    if (isBlankPersistedValue(exercise.gradingExplanation)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise grading explanation must not be blank: ${exercise.id}`,
        path: ["exercises", exercise.id]
      });
    }

    for (const ruleId of exercise.allowedRuleIds) {
      if (isBlankPersistedValue(ruleId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Exercise allowed rule must not be blank",
          path: ["exercises", exercise.id]
        });
      }
    }

    for (const vocabulary of exercise.allowedVocabulary) {
      if (isBlankPersistedValue(vocabulary)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Exercise allowed vocabulary must not be blank",
          path: ["exercises", exercise.id]
        });
      }
    }

    for (const answer of exercise.expectedAnswers) {
      if (isBlankPersistedValue(answer)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Exercise expected answer must not be blank",
          path: ["exercises", exercise.id]
        });
      }
    }

    const duplicateAllowedRule = duplicateNormalizedPersistedValue(exercise.allowedRuleIds);
    if (duplicateAllowedRule) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise allowed rule is duplicated: ${duplicateAllowedRule}`,
        path: ["exercises", exercise.id]
      });
    }

    const duplicateAllowedVocabulary = duplicateNormalizedPersistedValue(exercise.allowedVocabulary);
    if (duplicateAllowedVocabulary) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise allowed vocabulary is duplicated: ${duplicateAllowedVocabulary}`,
        path: ["exercises", exercise.id]
      });
    }

    const duplicateExpectedAnswer = duplicateNormalizedPersistedValue(exercise.expectedAnswers);
    if (duplicateExpectedAnswer) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise expected answer is duplicated: ${duplicateExpectedAnswer}`,
        path: ["exercises", exercise.id]
      });
    }

    if (exercise.adversarialAnswers.length < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise requires at least two adversarial probes: ${exercise.id}`,
        path: ["exercises", exercise.id]
      });
    }

    if (exercise.type === "translate_to_target" && !exerciseLanguageIdIsBlank) {
      const corpusTargets = corpusTargetsByLanguage.get(exercise.languageId) ?? new Set<string>();
      for (const answer of exercise.expectedAnswers) {
        if (!corpusTargets.has(normalizePersistedText(answer))) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Translate-to-target expected answer is not present in corpus: ${answer}`,
            path: ["exercises", exercise.id]
          });
        }
      }
    }

    if (exercise.type === "choose_particle") {
      const allowedVocabulary = new Set(exercise.allowedVocabulary.map(normalizePersistedText));
      for (const answer of exercise.expectedAnswers) {
        if (!allowedVocabulary.has(normalizePersistedText(answer))) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Choose-particle expected answer is not allowed vocabulary: ${answer}`,
            path: ["exercises", exercise.id]
          });
        }
      }
    }

    const normalizedExpected = new Set(exercise.expectedAnswers.map(normalizePersistedText));
    const normalizedAdversarial = new Set<string>();
    for (const adversarial of exercise.adversarialAnswers) {
      if (isBlankPersistedValue(adversarial.answer)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Exercise adversarial answer must not be blank",
          path: ["exercises", exercise.id]
        });
      }

      if (isBlankPersistedValue(adversarial.reason)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Exercise adversarial reason must not be blank",
          path: ["exercises", exercise.id]
        });
      }

      const normalizedAnswer = normalizePersistedText(adversarial.answer);
      if (normalizedExpected.has(normalizedAnswer)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Exercise adversarial answer duplicates an expected answer: ${adversarial.answer}`,
          path: ["exercises", exercise.id]
        });
      }

      if (normalizedAdversarial.has(normalizedAnswer)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Exercise adversarial answer is duplicated: ${normalizedAnswer}`,
          path: ["exercises", exercise.id]
        });
      }
      normalizedAdversarial.add(normalizedAnswer);
    }
  }
}

function addCorpusAnswerKeyIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    corpus: Array<z.infer<typeof corpusPassageSchema>>;
    corpusAnswerKeys?: Array<z.infer<typeof corpusAnswerKeySchema>>;
  }
) {
  const passagesById = new Map(state.corpus.map((passage) => [passage.id, passage]));

  for (const answerKey of state.corpusAnswerKeys ?? []) {
    if (isBlankPersistedValue(answerKey.passageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Corpus answer key passageId must not be blank",
        path: ["corpusAnswerKeys", answerKey.passageId]
      });
      continue;
    }

    const passage = passagesById.get(answerKey.passageId);
    if (!passage) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus answer key references missing passage: ${answerKey.passageId}`,
        path: ["corpusAnswerKeys", answerKey.passageId]
      });
      continue;
    }

    if (isBlankPersistedValue(answerKey.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Corpus answer key languageId must not be blank",
        path: ["corpusAnswerKeys", answerKey.passageId]
      });
    } else if (answerKey.languageId !== passage.languageId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus answer key language ${answerKey.languageId} does not match passage ${answerKey.passageId} language ${passage.languageId}`,
        path: ["corpusAnswerKeys", answerKey.passageId]
      });
    }

    addCorpusTextIntegrityIssues(
      context,
      "corpusAnswerKeys",
      answerKey.passageId,
      "Corpus answer key",
      answerKey.textTarget,
      answerKey.textTranslation,
      answerKey.morphologicalSegmentation
    );
  }
}

function addReviewPolicyIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    users: Array<z.infer<typeof userSchema>>;
    reviewPolicies: Array<z.infer<typeof reviewPolicySchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const languageIds = new Set(state.languages.map((language) => language.id));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const assignableReviewerCount = users.filter((user) => isReviewPolicyAssignableRole(user.role)).length;
  const duplicatePolicyLanguageId = duplicatePersistedValue(state.reviewPolicies, (policy) => policy.languageId);
  if (duplicatePolicyLanguageId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate review policy for language: ${duplicatePolicyLanguageId}`,
      path: ["reviewPolicies"]
    });
  }

  for (const policy of state.reviewPolicies) {
    addParseablePersistedDateIssue(context, "reviewPolicies", policy.id, "Review policy updatedAt", policy.updatedAt);

    if (isBlankPersistedValue(policy.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review policy languageId must not be blank",
        path: ["reviewPolicies", policy.id]
      });
    } else if (!languageIds.has(policy.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review policy references missing language: ${policy.languageId}`,
        path: ["reviewPolicies", policy.id]
      });
    }

    if (isBlankPersistedValue(policy.updatedBy)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review policy updatedBy must not be blank",
        path: ["reviewPolicies", policy.id]
      });
    }

    const updater = usersById.get(policy.updatedBy);
    if (!reviewPolicySystemUpdaterIds.has(policy.updatedBy) && (!updater || !isReviewPolicyUpdaterRole(updater.role))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review policy updater is not allowed: ${policy.updatedBy}`,
        path: ["reviewPolicies", policy.id]
      });
    }

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
      if (isBlankPersistedValue(reviewerId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Review policy assigned reviewer must not be blank",
          path: ["reviewPolicies", policy.id]
        });
        continue;
      }

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

function addExerciseSubmissionIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    exercises: Array<z.infer<typeof exerciseSchema>>;
    users: Array<z.infer<typeof userSchema>>;
    exerciseSubmissions: Array<z.infer<typeof exerciseSubmissionSchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const usersById = new Map(users.map((user) => [user.id, user]));
  const exercisesById = new Map(state.exercises.map((exercise) => [exercise.id, exercise]));

  for (const submission of state.exerciseSubmissions) {
    if (isBlankPersistedValue(submission.answer)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exercise submission answer must not be blank",
        path: ["exerciseSubmissions", submission.id]
      });
    }

    if (isBlankPersistedValue(submission.explanation)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exercise submission explanation must not be blank",
        path: ["exerciseSubmissions", submission.id]
      });
    }

    addParseablePersistedDateIssue(context, "exerciseSubmissions", submission.id, "Exercise submission submittedAt", submission.submittedAt);

    const submissionExerciseIdIsBlank = isBlankPersistedValue(submission.exerciseId);
    const submissionLanguageIdIsBlank = isBlankPersistedValue(submission.languageId);
    if (submissionExerciseIdIsBlank) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exercise submission exerciseId must not be blank",
        path: ["exerciseSubmissions", submission.id]
      });
    }

    if (submissionLanguageIdIsBlank) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exercise submission languageId must not be blank",
        path: ["exerciseSubmissions", submission.id]
      });
    }

    const exercise = submissionExerciseIdIsBlank ? undefined : exercisesById.get(submission.exerciseId);
    if (!submissionExerciseIdIsBlank && !exercise) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise submission references missing exercise: ${submission.exerciseId}`,
        path: ["exerciseSubmissions", submission.id]
      });
    } else if (exercise && !submissionLanguageIdIsBlank && submission.languageId !== exercise.languageId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise submission language ${submission.languageId} does not match exercise ${submission.exerciseId} language ${exercise.languageId}`,
        path: ["exerciseSubmissions", submission.id]
      });
    }

    const learner = isBlankPersistedValue(submission.learnerId) ? undefined : usersById.get(submission.learnerId);
    if (isBlankPersistedValue(submission.learnerId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exercise submission learnerId must not be blank",
        path: ["exerciseSubmissions", submission.id]
      });
    } else if (!learner || !isExerciseSubmissionActorRole(learner.role)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise submission learner is not allowed: ${submission.learnerId}`,
        path: ["exerciseSubmissions", submission.id]
      });
    }
  }
}

function addGovernanceIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    users: Array<z.infer<typeof userSchema>>;
    governance: Array<z.infer<typeof governanceRecordSchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const languageIds = new Set(state.languages.map((language) => language.id));
  const usersById = new Map(users.map((user) => [user.id, user]));

  for (const record of state.governance) {
    if (isBlankPersistedValue(record.content)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Governance record content must not be blank",
        path: ["governance", record.id]
      });
    }

    addParseablePersistedDateIssue(context, "governance", record.id, "Governance record effectiveDate", record.effectiveDate);

    if (isBlankPersistedValue(record.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Governance record languageId must not be blank",
        path: ["governance", record.id]
      });
    }

    if (!languageIds.has(record.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Governance record references missing language: ${record.languageId}`,
        path: ["governance", record.id]
      });
    }

    const approver = isBlankPersistedValue(record.approvedBy) ? undefined : usersById.get(record.approvedBy);
    if (isBlankPersistedValue(record.approvedBy)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Governance record approver must not be blank",
        path: ["governance", record.id]
      });
    } else if (!approver || !isGovernanceApproverRole(approver.role)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Governance record approver is not allowed: ${record.approvedBy}`,
        path: ["governance", record.id]
      });
    }
  }
}

function addAuditEventIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    users: Array<z.infer<typeof userSchema>>;
    auditEvents: Array<z.infer<typeof auditEventSchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const languageIds = new Set(state.languages.map((language) => language.id));
  const usersById = new Map(users.map((user) => [user.id, user]));

  for (const event of state.auditEvents) {
    if (isBlankPersistedValue(event.action)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Audit event action must not be blank",
        path: ["auditEvents", event.id]
      });
    }

    if (isBlankPersistedValue(event.entityId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Audit event entityId must not be blank",
        path: ["auditEvents", event.id]
      });
    }

    if (isBlankPersistedValue(event.summary)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Audit event summary must not be blank",
        path: ["auditEvents", event.id]
      });
    }

    addParseablePersistedDateIssue(context, "auditEvents", event.id, "Audit event at", event.at);

    const privacyIssue = auditMetadataPrivacyIssue(event.metadata);
    if (privacyIssue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Audit event metadata contains ${privacyIssue}`,
        path: ["auditEvents", event.id]
      });
    }

    if (event.languageId !== null && isBlankPersistedValue(event.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Audit event languageId must not be blank",
        path: ["auditEvents", event.id]
      });
    }

    if (event.languageId !== null && !languageIds.has(event.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Audit event references missing language: ${event.languageId}`,
        path: ["auditEvents", event.id]
      });
    }

    const actor = isBlankPersistedValue(event.actorId) ? undefined : usersById.get(event.actorId);
    if (isBlankPersistedValue(event.actorId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Audit event actorId must not be blank",
        path: ["auditEvents", event.id]
      });
      continue;
    }

    if (!actor) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Audit event references unknown actor: ${event.actorId}`,
        path: ["auditEvents", event.id]
      });
      continue;
    }

    if (event.actorRole !== actor.role) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Audit event actorRole ${event.actorRole} does not match actor ${event.actorId} role ${actor.role}`,
        path: ["auditEvents", event.id]
      });
    }
  }
}

function addAiSessionIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    notes: Array<z.infer<typeof noteSchema>>;
    corpus: Array<z.infer<typeof corpusPassageSchema>>;
    users: Array<z.infer<typeof userSchema>>;
    aiSessions: Array<z.infer<typeof aiSessionSchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const languageIds = new Set(state.languages.map((language) => language.id));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const notesById = new Map(state.notes.map((note) => [note.id, note]));
  const passagesById = new Map(state.corpus.map((passage) => [passage.id, passage]));

  for (const session of state.aiSessions) {
    if (isBlankPersistedValue(session.thinkingSummary)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AI session thinkingSummary must not be blank",
        path: ["aiSessions", session.id]
      });
    }

    for (const redaction of session.privacy.redactions) {
      if (isBlankPersistedValue(redaction)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AI session privacy redaction must not be blank",
          path: ["aiSessions", session.id]
        });
      }
    }

    if (isBlankPersistedValue(session.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AI session languageId must not be blank",
        path: ["aiSessions", session.id]
      });
    }

    if (!languageIds.has(session.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `AI session references missing language: ${session.languageId}`,
        path: ["aiSessions", session.id]
      });
    }

    const creator = isBlankPersistedValue(session.createdBy) ? undefined : usersById.get(session.createdBy);
    if (isBlankPersistedValue(session.createdBy)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AI session creator must not be blank",
        path: ["aiSessions", session.id]
      });
    } else if (!creator || !isAiSessionCreatorRole(session.mode, creator.role)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `AI session creator is not allowed for mode ${session.mode}: ${session.createdBy}`,
        path: ["aiSessions", session.id]
      });
    }

    addParseablePersistedDateIssue(context, "aiSessions", session.id, "AI session createdAt", session.createdAt);
    addParseablePersistedDateIssue(context, "aiSessions", session.id, "AI session updatedAt", session.updatedAt);
    const createdAtTime = Date.parse(session.createdAt);
    const updatedAtTime = Date.parse(session.updatedAt);
    const sessionTimelineIsParseable = !Number.isNaN(createdAtTime) && !Number.isNaN(updatedAtTime);

    if (sessionTimelineIsParseable && updatedAtTime < createdAtTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AI session updatedAt cannot be before createdAt",
        path: ["aiSessions", session.id]
      });
    }

    for (const message of session.messages) {
      if (isBlankPersistedValue(message.content)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session message content must not be blank: ${message.id}`,
          path: ["aiSessions", session.id]
        });
      }

      addParseablePersistedDateIssue(context, "aiSessions", session.id, "AI session message createdAt", message.createdAt);
      const messageCreatedAtTime = Date.parse(message.createdAt);
      if (!sessionTimelineIsParseable || Number.isNaN(messageCreatedAtTime)) continue;

      if (messageCreatedAtTime < createdAtTime) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session message ${message.id} cannot be before session createdAt`,
          path: ["aiSessions", session.id]
        });
      }

      if (messageCreatedAtTime > updatedAtTime) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session message ${message.id} cannot be after session updatedAt`,
          path: ["aiSessions", session.id]
        });
      }
    }

    for (const traceStep of session.trace) {
      if (isBlankPersistedValue(traceStep.label)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session trace label must not be blank: ${traceStep.id}`,
          path: ["aiSessions", session.id]
        });
      }

      if (isBlankPersistedValue(traceStep.summary)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session trace summary must not be blank: ${traceStep.id}`,
          path: ["aiSessions", session.id]
        });
      }

      for (const warning of traceStep.warnings) {
        if (isBlankPersistedValue(warning)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `AI session trace warning must not be blank: ${traceStep.id}`,
            path: ["aiSessions", session.id]
          });
        }
      }
    }

    for (const noteId of session.contextNoteIds) {
      if (isBlankPersistedValue(noteId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AI session contextNoteId must not be blank",
          path: ["aiSessions", session.id]
        });
        continue;
      }

      const note = notesById.get(noteId);
      if (!note) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session references missing context note: ${noteId}`,
          path: ["aiSessions", session.id]
        });
      } else if (note.languageId !== session.languageId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session context note ${noteId} language ${note.languageId} does not match session language ${session.languageId}`,
          path: ["aiSessions", session.id]
        });
      }
    }

    for (const passageId of session.contextPassageIds) {
      if (isBlankPersistedValue(passageId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AI session contextPassageId must not be blank",
          path: ["aiSessions", session.id]
        });
        continue;
      }

      const passage = passagesById.get(passageId);
      if (!passage) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session references missing context passage: ${passageId}`,
          path: ["aiSessions", session.id]
        });
      } else if (passage.languageId !== session.languageId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session context passage ${passageId} language ${passage.languageId} does not match session language ${session.languageId}`,
          path: ["aiSessions", session.id]
        });
      }
    }
  }
}

function addEvaluationRunIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    evaluationRuns: Array<z.infer<typeof evaluationRunSchema>>;
  }
) {
  const languageIds = new Set(state.languages.map((language) => language.id));

  for (const run of state.evaluationRuns) {
    if (isBlankPersistedValue(run.summary)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Evaluation run summary must not be blank",
        path: ["evaluationRuns", run.id]
      });
    }

    if (isBlankPersistedValue(run.systemVersion)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Evaluation run systemVersion must not be blank",
        path: ["evaluationRuns", run.id]
      });
    }

    if (isBlankPersistedValue(run.fixtureVersion)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Evaluation run fixtureVersion must not be blank",
        path: ["evaluationRuns", run.id]
      });
    }

    addParseablePersistedDateIssue(context, "evaluationRuns", run.id, "Evaluation run createdAt", run.createdAt);

    if (isBlankPersistedValue(run.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Evaluation run languageId must not be blank",
        path: ["evaluationRuns", run.id]
      });
    } else if (!languageIds.has(run.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Evaluation run references missing language: ${run.languageId}`,
        path: ["evaluationRuns", run.id]
      });
    }

    for (const category of Object.keys(run.scores)) {
      if (isBlankPersistedValue(category)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Evaluation score category must not be blank",
          path: ["evaluationRuns", run.id]
        });
      }
    }

    for (const failure of run.failures) {
      if (isBlankPersistedValue(failure.category)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Evaluation failure category must not be blank",
          path: ["evaluationRuns", run.id]
        });
      }

      if (isBlankPersistedValue(failure.itemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Evaluation failure itemId must not be blank",
          path: ["evaluationRuns", run.id]
        });
      }

      if (isBlankPersistedValue(failure.message)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Evaluation failure message must not be blank",
          path: ["evaluationRuns", run.id]
        });
      }

      if (isBlankPersistedValue(failure.languageId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Evaluation failure languageId must not be blank",
          path: ["evaluationRuns", run.id]
        });
      } else if (failure.languageId !== run.languageId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Evaluation failure language ${failure.languageId} does not match run language ${run.languageId}`,
          path: ["evaluationRuns", run.id]
        });
      }
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
    addParseablePersistedDateIssue(context, "reviewApprovals", approval.id, "Review approval approvedAt", approval.approvedAt);

    if (isBlankPersistedValue(approval.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review approval languageId must not be blank",
        path: ["reviewApprovals", approval.id]
      });
    }

    if (isBlankPersistedValue(approval.noteId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review approval noteId must not be blank",
        path: ["reviewApprovals", approval.id]
      });
    }

    if (isBlankPersistedValue(approval.reviewerId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review approval reviewerId must not be blank",
        path: ["reviewApprovals", approval.id]
      });
    }

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
    } else if (note.status !== "under_review" && note.status !== "approved") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review approval note ${approval.noteId} must be under_review or approved, found ${note.status}`,
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

function addReviewDispositionIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    notes: Array<z.infer<typeof noteSchema>>;
    users: Array<z.infer<typeof userSchema>>;
    reviewDispositions: Array<z.infer<typeof reviewDispositionSchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const usersById = new Map(users.map((user) => [user.id, user]));
  const notesById = new Map(state.notes.map((note) => [note.id, note]));
  const openDispositionKeys = new Set<string>();

  const addAssignableUserIssue = (
    userId: string,
    label: "assignee" | "opener" | "resolver",
    dispositionId: string
  ) => {
    if (isBlankPersistedValue(userId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review disposition ${label} must not be blank`,
        path: ["reviewDispositions", dispositionId]
      });
      return;
    }

    const user = usersById.get(userId);
    if (!user || !isReviewPolicyAssignableRole(user.role)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review disposition ${label} is not assignable: ${userId}`,
        path: ["reviewDispositions", dispositionId]
      });
    }
  };

  for (const disposition of state.reviewDispositions) {
    if (isBlankPersistedValue(disposition.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review disposition languageId must not be blank",
        path: ["reviewDispositions", disposition.id]
      });
    }

    if (isBlankPersistedValue(disposition.noteId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review disposition noteId must not be blank",
        path: ["reviewDispositions", disposition.id]
      });
    }

    const note = notesById.get(disposition.noteId);
    if (!note) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review disposition references missing note: ${disposition.noteId}`,
        path: ["reviewDispositions", disposition.id]
      });
    } else if (disposition.languageId !== note.languageId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review disposition language ${disposition.languageId} does not match note ${disposition.noteId} language ${note.languageId}`,
        path: ["reviewDispositions", disposition.id]
      });
    } else if (disposition.status === "open" && !reviewDispositionNoteStatusSet.has(note.status)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Open review disposition note ${disposition.noteId} must have a disposition status, found ${note.status}`,
        path: ["reviewDispositions", disposition.id]
      });
    }

    addParseablePersistedDateIssue(context, "reviewDispositions", disposition.id, "Review disposition dueAt", disposition.dueAt);
    addParseablePersistedDateIssue(context, "reviewDispositions", disposition.id, "Review disposition openedAt", disposition.openedAt);
    addParseablePersistedDateIssue(context, "reviewDispositions", disposition.id, "Review disposition resolvedAt", disposition.resolvedAt);

    if (disposition.reason.trim().length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review disposition reason must not be blank",
        path: ["reviewDispositions", disposition.id]
      });
    }

    addAssignableUserIssue(disposition.assignedTo, "assignee", disposition.id);
    addAssignableUserIssue(disposition.openedBy, "opener", disposition.id);

    if (disposition.status === "open") {
      const openKey = `${disposition.languageId}/${disposition.noteId}/${disposition.disposition}`;
      if (openDispositionKeys.has(openKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate open review disposition for language/note/disposition: ${openKey}`,
          path: ["reviewDispositions", disposition.id]
        });
      }
      openDispositionKeys.add(openKey);

      if (disposition.resolvedAt !== null || disposition.resolvedBy !== null || disposition.resolutionSummary !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Open review disposition cannot have resolution fields",
          path: ["reviewDispositions", disposition.id]
        });
      }
    }

    if (disposition.status === "resolved") {
      if (disposition.resolvedAt === null || disposition.resolvedBy === null || disposition.resolutionSummary === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Resolved review disposition requires resolvedAt, resolvedBy, and resolutionSummary",
          path: ["reviewDispositions", disposition.id]
        });
      }

      if (disposition.resolutionSummary !== null && disposition.resolutionSummary.trim().length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Review disposition resolutionSummary must not be blank",
          path: ["reviewDispositions", disposition.id]
        });
      }

      const openedAtTime = Date.parse(disposition.openedAt);
      const resolvedAtTime = disposition.resolvedAt === null ? NaN : Date.parse(disposition.resolvedAt);
      if (!Number.isNaN(openedAtTime) && !Number.isNaN(resolvedAtTime) && resolvedAtTime < openedAtTime) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Review disposition resolvedAt cannot be before openedAt",
          path: ["reviewDispositions", disposition.id]
        });
      }

      if (disposition.resolvedBy !== null) {
        addAssignableUserIssue(disposition.resolvedBy, "resolver", disposition.id);
      }
    }
  }
}

function addElderCorrectionIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    notes: Array<z.infer<typeof noteSchema>>;
    corpus: Array<z.infer<typeof corpusPassageSchema>>;
    users: Array<z.infer<typeof userSchema>>;
    elderCorrections: Array<z.infer<typeof elderCorrectionSchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const languageIds = new Set(state.languages.map((language) => language.id));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const notesById = new Map(state.notes.map((note) => [note.id, note]));
  const passagesById = new Map(state.corpus.map((passage) => [passage.id, passage]));

  const addAllowedActorIssue = (
    userId: string,
    label: "proposer" | "reviewer",
    correctionId: string
  ) => {
    if (isBlankPersistedValue(userId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Elder correction ${label} must not be blank`,
        path: ["elderCorrections", correctionId]
      });
      return;
    }

    const user = usersById.get(userId);
    if (!user || !isElderCorrectionMutationRole(user.role)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Elder correction ${label} is not allowed: ${userId}`,
        path: ["elderCorrections", correctionId]
      });
    }
  };

  for (const correction of state.elderCorrections) {
    if (isBlankPersistedValue(correction.correction)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Elder correction text must not be blank",
        path: ["elderCorrections", correction.id]
      });
    }

    if (isBlankPersistedValue(correction.rationale)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Elder correction rationale must not be blank",
        path: ["elderCorrections", correction.id]
      });
    }

    if (correction.contextText !== undefined && isBlankPersistedValue(correction.contextText)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Elder correction contextText must not be blank",
        path: ["elderCorrections", correction.id]
      });
    }

    if (isBlankPersistedValue(correction.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Elder correction languageId must not be blank",
        path: ["elderCorrections", correction.id]
      });
    }

    if (!languageIds.has(correction.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Elder correction references missing language: ${correction.languageId}`,
        path: ["elderCorrections", correction.id]
      });
    }

    if (correction.noteId !== undefined) {
      if (isBlankPersistedValue(correction.noteId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Elder correction noteId must not be blank",
          path: ["elderCorrections", correction.id]
        });
      }

      const note = notesById.get(correction.noteId);
      if (!note) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Elder correction references missing note: ${correction.noteId}`,
          path: ["elderCorrections", correction.id]
        });
      } else if (correction.languageId !== note.languageId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Elder correction language ${correction.languageId} does not match note ${correction.noteId} language ${note.languageId}`,
          path: ["elderCorrections", correction.id]
        });
      }
    }

    if (correction.passageId !== undefined) {
      if (isBlankPersistedValue(correction.passageId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Elder correction passageId must not be blank",
          path: ["elderCorrections", correction.id]
        });
      }

      const passage = passagesById.get(correction.passageId);
      if (!passage) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Elder correction references missing passage: ${correction.passageId}`,
          path: ["elderCorrections", correction.id]
        });
      } else if (correction.languageId !== passage.languageId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Elder correction language ${correction.languageId} does not match passage ${correction.passageId} language ${passage.languageId}`,
          path: ["elderCorrections", correction.id]
        });
      }
    }

    addAllowedActorIssue(correction.proposedBy, "proposer", correction.id);
    addParseablePersistedDateIssue(context, "elderCorrections", correction.id, "Elder correction proposedAt", correction.proposedAt);

    if (correction.status === "pending_review") {
      if (correction.reviewedBy !== null || correction.reviewedAt !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pending elder correction cannot have review attribution",
          path: ["elderCorrections", correction.id]
        });
      }
      continue;
    }

    if (correction.reviewedBy === null || correction.reviewedAt === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reviewed elder correction requires reviewedBy and reviewedAt",
        path: ["elderCorrections", correction.id]
      });
    }

    if (correction.reviewedBy !== null) {
      addAllowedActorIssue(correction.reviewedBy, "reviewer", correction.id);
    }

    addParseablePersistedDateIssue(context, "elderCorrections", correction.id, "Elder correction reviewedAt", correction.reviewedAt);

    if (
      correction.reviewedAt !== null
      && !Number.isNaN(Date.parse(correction.proposedAt))
      && !Number.isNaN(Date.parse(correction.reviewedAt))
      && Date.parse(correction.reviewedAt) < Date.parse(correction.proposedAt)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Elder correction reviewedAt cannot be before proposedAt",
        path: ["elderCorrections", correction.id]
      });
    }

    if (correction.status === "applied" && correction.noteId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Applied elder correction must reference a note",
        path: ["elderCorrections", correction.id]
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

/** Current AppState schema version written and accepted by this package. */
export const CURRENT_SCHEMA_VERSION = 8 as const;

export const appStateSchema = z.object({
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
}).superRefine((state, context) => {
  addDuplicatePersistedValueIssue(context, "languages", "id", state.languages, (item) => item.id);
  addLanguageIntegrityIssues(context, state);
  addBlankPersistedValueIssue(context, "corpus", "id", state.corpus, (item) => item.id);
  addDuplicatePersistedValueIssue(context, "corpus", "id", state.corpus, (item) => item.id);
  addCorpusIntegrityIssues(context, state);
  addDuplicatePersistedValueIssue(context, "corpusAnswerKeys", "passageId", state.corpusAnswerKeys ?? [], (item) => item.passageId);
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
      schemaVersion: CURRENT_SCHEMA_VERSION,
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
      schemaVersion: CURRENT_SCHEMA_VERSION,
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
      schemaVersion: CURRENT_SCHEMA_VERSION,
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
      schemaVersion: CURRENT_SCHEMA_VERSION,
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
      schemaVersion: CURRENT_SCHEMA_VERSION,
      reviewPolicies: [],
      reviewApprovals: [],
      reviewDispositions: []
    }));
  }

  const legacyV6 = legacyAppStateV6Schema.safeParse(input);
  if (legacyV6.success) {
    return ensureCorpusAnswerKeys(appStateSchema.parse({
      ...legacyV6.data,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      reviewDispositions: []
    }));
  }

  const legacyV7 = legacyAppStateV7Schema.safeParse(input);
  if (legacyV7.success) {
    return ensureCorpusAnswerKeys(appStateSchema.parse({
      ...legacyV7.data,
      schemaVersion: CURRENT_SCHEMA_VERSION
    }));
  }

  return ensureCorpusAnswerKeys(appStateSchema.parse(input));
}
