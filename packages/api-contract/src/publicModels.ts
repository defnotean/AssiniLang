import { z } from "zod";

/**
 * Browser-safe wire models.
 *
 * These types describe HTTP payloads, not persisted records. Keep this module
 * independent of `@assini/db`: persistence may add fields that must never
 * cross the API boundary (for example source file paths and answer keys).
 */

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
export const consentUseSchema = z.enum([
  "testing-only",
  "community-approved",
  "personal-study",
  "research",
  "public-domain",
  "licensed",
  "pending-review"
]);
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
  consentStatus: z.object({ use: consentUseSchema, restrictions: z.array(z.string()) }),
  sourceAssetId: z.string().min(1).optional()
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
export const processingQueuePhaseSchema = z.enum(["queued", "active"]);

/** Omits persisted paths, raw source content, URLs, and transcript content. */
export const sourceAssetSchema = z
  .object({
    id: z.string().min(1),
    languageId: z.string().min(1),
    kind: sourceAssetKindSchema,
    title: z.string().min(1),
    originalName: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    status: sourceAssetStatusSchema,
    error: z.string().optional(),
    summary: z.string().optional(),
    warnings: z.array(z.string()).optional(),
    createdBy: z.string().min(1),
    createdAt: z.string().min(1),
    processedAt: z.string().min(1).optional(),
    processingStartedAt: z.string().min(1).optional(),
    processingAttempts: z.number().int().nonnegative().optional(),
    processingHeartbeatAt: z.string().min(1).optional(),
    transcriptAvailable: z.boolean(),
    processingQueuePhase: processingQueuePhaseSchema.optional()
  })
  .strict();

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

export type LanguageTypology = z.infer<typeof languageTypologySchema>;
export type LanguagePhonology = z.infer<typeof languagePhonologySchema>;
export type Language = z.infer<typeof languageSchema>;
export type Morpheme = z.infer<typeof morphemeSchema>;
export type ConsentUse = z.infer<typeof consentUseSchema>;
export type CorpusPassage = z.infer<typeof corpusPassageSchema>;
export type Lexeme = z.infer<typeof lexemeSchema>;
export type SourceAssetKind = z.infer<typeof sourceAssetKindSchema>;
export type SourceAssetStatus = z.infer<typeof sourceAssetStatusSchema>;
export type ProcessingQueuePhase = z.infer<typeof processingQueuePhaseSchema>;
export type SourceAsset = z.infer<typeof sourceAssetSchema>;
export type ExtractionDraftKind = z.infer<typeof extractionDraftKindSchema>;
export type ExtractionDraftPayload = z.infer<typeof extractionDraftPayloadSchema>;
export type ExtractionDraft = z.infer<typeof extractionDraftSchema>;

export type UserRole = "admin" | "elder" | "programmer" | "reviewer" | "lead" | "learner";
export type User = { id: string; name: string; role: UserRole; avatarUrl?: string };
export type NoteStatus = "draft" | "under_review" | "approved" | "contested" | "rejected" | "deferred" | "escalated";
export type Confidence = "low" | "medium" | "high";
export type Note = {
  id: string;
  languageId: string;
  topic: string;
  explanation: string;
  examples: Array<{ passageId: string; target: string; translation: string }>;
  evidencePassageIds: string[];
  evidenceCount: number;
  confidence: Confidence;
  status: NoteStatus;
  reviewer: { lastReviewedBy: string | null; lastReviewedAt: string | null; comments: string[] };
  dialectScope: string;
  editHistory: Array<{ at: string; by: string; action: string; summary: string }>;
};
export type ExerciseType = "translate_to_target" | "translate_to_english" | "segment" | "choose_particle";
export type PublicExercise = {
  id: string;
  languageId: string;
  type: ExerciseType;
  prompt: string;
  allowedVocabulary: string[];
  allowedRuleIds: string[];
};
export type ExerciseAuthoringPayload = {
  type: ExerciseType;
  prompt: string;
  allowedVocabulary: string[];
  allowedRuleIds: string[];
  expectedAnswers: string[];
  adversarialAnswers: Array<{ answer: string; reason: string }>;
  gradingExplanation: string;
};
export type PublicExerciseSubmission = {
  id: string;
  exerciseId: string;
  languageId: string;
  accepted: boolean;
  explanation: string;
  submittedAt: string;
};
export type EvaluationFailure = { category: string; languageId: string; itemId: string; message: string };
export type EvaluationRun = {
  id: string;
  languageId: string;
  createdAt: string;
  systemVersion: string;
  fixtureVersion: string;
  scores: Record<string, number>;
  failures: EvaluationFailure[];
  summary: string;
};
export type AuditEvent = {
  id: string;
  at: string;
  actorId: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  languageId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
};
export type AiSessionMode = "learner_practice" | "elder_review" | "programmer_debug";
export type AiMessage = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  createdBy: string;
};
export type AiTraceStep = {
  id: string;
  kind: "input" | "retrieval" | "policy_check" | "generation" | "correction" | "output";
  label: string;
  summary: string;
  referencedIds: string[];
  warnings: string[];
};
export type NeuralMap = {
  nodes: Array<{ id: string; type: string; label: string; metadata: Record<string, string | number | boolean> }>;
  edges: Array<{ source: string; target: string; relation: string; weight?: number }>;
};
export type AiSession = {
  id: string;
  languageId: string;
  mode: AiSessionMode;
  status: "active" | "completed" | "failed";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contextNoteIds: string[];
  contextPassageIds: string[];
  messages: AiMessage[];
  thinkingSummary: string;
  trace: AiTraceStep[];
  neuralMap: NeuralMap;
  privacy: { redactions: string[]; exposesHiddenChainOfThought: false };
};
export type ElderCorrection = {
  id: string;
  languageId: string;
  noteId?: string;
  passageId?: string;
  correction: string;
  rationale: string;
  severity: "minor" | "major" | "safety";
  contextText?: string;
  status: "pending_review" | "accepted" | "rejected" | "applied";
  proposedBy: string;
  proposedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
};
export type GovernanceRecord = {
  id: string;
  languageId: string;
  policyType: "consent" | "access" | "generation";
  content: string;
  effectiveDate: string;
  approvedBy: string;
};
export type ReviewPolicy = {
  id: string;
  languageId: string;
  assignedReviewerIds: string[];
  approvalThreshold: number;
  requiresAssignedReviewer: boolean;
  updatedAt: string;
  updatedBy: string;
};
export type ReviewDisposition = {
  id: string;
  languageId: string;
  noteId: string;
  disposition: "contested" | "rejected" | "deferred" | "escalated";
  status: "open" | "resolved";
  reason: string;
  assignedTo: string;
  dueAt: string | null;
  openedAt: string;
  openedBy: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionSummary: string | null;
};
