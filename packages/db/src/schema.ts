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
const reviewDispositionNoteStatusSet = new Set<string>(["contested", "rejected", "deferred", "escalated"]);

export function isReviewPolicyAssignableRole(role: z.infer<typeof userRoleSchema>): boolean {
  return reviewPolicyAssignableRoleSet.has(role);
}

export const REVIEW_POLICY_UPDATER_ROLES = ["lead", "admin"] as const;
const reviewPolicyUpdaterRoleSet = new Set<string>(REVIEW_POLICY_UPDATER_ROLES);
const reviewPolicySystemUpdaterIds = new Set<string>(["system-seed"]);

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

function addCorpusIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    corpus: Array<z.infer<typeof corpusPassageSchema>>;
  }
) {
  const languageIds = new Set(state.languages.map((language) => language.id));

  for (const passage of state.corpus) {
    if (!languageIds.has(passage.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus passage references missing language: ${passage.languageId}`,
        path: ["corpus", passage.id]
      });
    }

    const duplicateTopicTag = duplicateNormalizedPersistedValue(passage.topicTags);
    if (duplicateTopicTag) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus topic tag is duplicated for passage ${passage.id}: ${duplicateTopicTag}`,
        path: ["corpus", passage.id]
      });
    }

    for (const morpheme of passage.morphologicalSegmentation) {
      if (!corpusTargetContainsSurface(passage.textTarget, morpheme.surface)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Corpus segmentation surface is not present in target text for passage ${passage.id}: ${morpheme.surface}`,
          path: ["corpus", passage.id]
        });
      }

      const duplicateFeature = duplicateNormalizedPersistedValue(morpheme.features);
      if (duplicateFeature) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Corpus morpheme feature is duplicated for passage ${passage.id} surface ${morpheme.surface}: ${duplicateFeature}`,
          path: ["corpus", passage.id]
        });
      }
    }

    for (const token of findUncoveredPersistedCorpusTargetTokens(passage.textTarget, passage.morphologicalSegmentation)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus segmentation does not cover target token for passage ${passage.id}: ${token}`,
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
  },
  notes: Array<z.infer<typeof noteSchema>>,
  collectionPath: "notes" | "noteAnswerKeys",
  label: "Note" | "Note answer key"
) {
  const languageIds = new Set(state.languages.map((language) => language.id));
  const passagesById = new Map(state.corpus.map((passage) => [passage.id, passage]));

  for (const note of notes) {
    if (!languageIds.has(note.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} references missing language: ${note.languageId}`,
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

    for (const passageId of note.evidencePassageIds) {
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
    if (!languageIds.has(exercise.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise references missing language: ${exercise.languageId}`,
        path: ["exercises", exercise.id]
      });
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

    if (exercise.type === "translate_to_target") {
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
    const passage = passagesById.get(answerKey.passageId);
    if (!passage) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus answer key references missing passage: ${answerKey.passageId}`,
        path: ["corpusAnswerKeys", answerKey.passageId]
      });
      continue;
    }

    if (answerKey.languageId !== passage.languageId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Corpus answer key language ${answerKey.languageId} does not match passage ${answerKey.passageId} language ${passage.languageId}`,
        path: ["corpusAnswerKeys", answerKey.passageId]
      });
    }
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
    if (!languageIds.has(policy.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review policy references missing language: ${policy.languageId}`,
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
    const exercise = exercisesById.get(submission.exerciseId);
    if (!exercise) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise submission references missing exercise: ${submission.exerciseId}`,
        path: ["exerciseSubmissions", submission.id]
      });
    } else if (submission.languageId !== exercise.languageId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exercise submission language ${submission.languageId} does not match exercise ${submission.exerciseId} language ${exercise.languageId}`,
        path: ["exerciseSubmissions", submission.id]
      });
    }

    const learner = usersById.get(submission.learnerId);
    if (!learner || !isExerciseSubmissionActorRole(learner.role)) {
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
    addParseablePersistedDateIssue(context, "governance", record.id, "Governance record effectiveDate", record.effectiveDate);

    if (!languageIds.has(record.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Governance record references missing language: ${record.languageId}`,
        path: ["governance", record.id]
      });
    }

    const approver = usersById.get(record.approvedBy);
    if (!approver || !isGovernanceApproverRole(approver.role)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Governance record approver is not allowed: ${record.approvedBy}`,
        path: ["governance", record.id]
      });
    }
  }
}

const privateAuditMetadataKeys = new Set([
  "answer",
  "answers",
  "learneranswer",
  "learneranswers",
  "expectedanswer",
  "expectedanswers",
  "adversarialanswer",
  "adversarialanswers",
  "answerkey",
  "answerkeys",
  "gradingexplanation",
  "providerprompt",
  "hiddenchainofthought",
  "chainofthought",
  "apikey",
  "authorization",
  "bearer",
  "secret",
  "token"
]);
const secretLikeAuditMetadataValuePattern = /\b(?:bearer\s+\S+|sk-[A-Za-z0-9._-]+|(?:ASSINI_LLM_API_KEY|OPENAI_API_KEY)\s*=|api[_-]?key\s*[:=]|secret\s*[:=])/i;

function normalizeAuditMetadataKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function auditMetadataPath(path: string[]): string {
  return path.length > 0 ? path.join(".") : "metadata";
}

function auditMetadataPrivacyIssue(value: unknown, path: string[] = []): string | undefined {
  if (typeof value === "string" && secretLikeAuditMetadataValuePattern.test(value)) {
    return `secret-like value at ${auditMetadataPath(path)}`;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const issue = auditMetadataPrivacyIssue(value[index], [...path, String(index)]);
      if (issue) return issue;
    }
    return undefined;
  }

  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (privateAuditMetadataKeys.has(normalizeAuditMetadataKey(key))) {
        return `private field: ${key}`;
      }

      const issue = auditMetadataPrivacyIssue(nestedValue, [...path, key]);
      if (issue) return issue;
    }
  }

  return undefined;
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
    const privacyIssue = auditMetadataPrivacyIssue(event.metadata);
    if (privacyIssue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Audit event metadata contains ${privacyIssue}`,
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

    const actor = usersById.get(event.actorId);
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
    if (!languageIds.has(session.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `AI session references missing language: ${session.languageId}`,
        path: ["aiSessions", session.id]
      });
    }

    const creator = usersById.get(session.createdBy);
    if (!creator || !isAiSessionCreatorRole(session.mode, creator.role)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `AI session creator is not allowed for mode ${session.mode}: ${session.createdBy}`,
        path: ["aiSessions", session.id]
      });
    }

    for (const noteId of session.contextNoteIds) {
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
    if (!languageIds.has(run.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Evaluation run references missing language: ${run.languageId}`,
        path: ["evaluationRuns", run.id]
      });
    }

    for (const failure of run.failures) {
      if (failure.languageId !== run.languageId) {
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
    if (!languageIds.has(correction.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Elder correction references missing language: ${correction.languageId}`,
        path: ["elderCorrections", correction.id]
      });
    }

    if (correction.noteId !== undefined) {
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
  addCorpusIntegrityIssues(context, state);
  addDuplicatePersistedValueIssue(context, "corpusAnswerKeys", "passageId", state.corpusAnswerKeys ?? [], (item) => item.passageId);
  addCorpusAnswerKeyIntegrityIssues(context, state);
  addDuplicatePersistedValueIssue(context, "noteAnswerKeys", "id", state.noteAnswerKeys, (item) => item.id);
  addNoteCollectionIntegrityIssues(context, state, state.noteAnswerKeys, "noteAnswerKeys", "Note answer key");
  addDuplicatePersistedValueIssue(context, "notes", "id", state.notes, (item) => item.id);
  addNoteCollectionIntegrityIssues(context, state, state.notes, "notes", "Note");
  addDuplicatePersistedValueIssue(context, "exercises", "id", state.exercises, (item) => item.id);
  addExerciseIntegrityIssues(context, state);
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
  addExerciseSubmissionIntegrityIssues(context, state);
  addGovernanceIntegrityIssues(context, state);
  addAuditEventIntegrityIssues(context, state);
  addAiSessionIntegrityIssues(context, state);
  addEvaluationRunIntegrityIssues(context, state);
  addReviewPolicyIntegrityIssues(context, state);
  addReviewApprovalIntegrityIssues(context, state);
  addReviewDispositionIntegrityIssues(context, state);
  addElderCorrectionIntegrityIssues(context, state);

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
