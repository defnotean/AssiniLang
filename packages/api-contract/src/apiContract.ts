import { z } from "zod";
import {
  languageSchema,
  sourceAssetSchema,
  extractionDraftSchema,
  exerciseSubmissionSchema,
  elderCorrectionSchema,
  languageTypologySchema,
  aiSessionModeSchema
} from "@assini/db";

const nonEmptyTrimmedStringSchema = z.string().trim().min(1);
const optionalTrimmedStringSchema = z.string()
  .transform((value) => value.trim())
  .transform((value) => value || undefined)
  .optional();
const optionalNullableLanguagePhonologyPayloadSchema = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.object({
    consonants: z.array(nonEmptyTrimmedStringSchema).default([]),
    vowels: z.array(nonEmptyTrimmedStringSchema).default([]),
    syllableTemplate: optionalTrimmedStringSchema,
    stress: optionalTrimmedStringSchema,
    notes: z.array(nonEmptyTrimmedStringSchema).default([])
  }).optional()
);

// Language creation and patching schemas
export const languageCreatePayloadSchema = z.object({
  name: nonEmptyTrimmedStringSchema,
  description: nonEmptyTrimmedStringSchema,
  orthography: nonEmptyTrimmedStringSchema,
  typology: languageTypologySchema.default("unknown"),
  phonology: optionalNullableLanguagePhonologyPayloadSchema
});

export const languagePatchPayloadSchema = z.object({
  name: nonEmptyTrimmedStringSchema,
  description: nonEmptyTrimmedStringSchema,
  orthography: nonEmptyTrimmedStringSchema,
  typology: languageTypologySchema,
  phonology: optionalNullableLanguagePhonologyPayloadSchema
}).partial();

// Text/wordlist/URL registration (JSON body). Uploads use a separate kind set.
export const sourceTextRegistrationKindSchema = z.enum(["text", "wordlist", "url"]);
export const sourceUploadKindSchema = z.enum(["image", "audio", "document"]);

// Source registration schema
export const sourceRegistrationPayloadSchema = z.object({
  kind: sourceTextRegistrationKindSchema,
  title: nonEmptyTrimmedStringSchema,
  rawText: z.string().optional(),
  url: z.string().trim().optional()
}).refine((data) => {
  if (data.kind === "url") {
    if (!data.url) return false;
    try {
      const parsed = new URL(data.url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }
  return data.rawText !== undefined && data.rawText.trim().length > 0;
}, {
  message: "Invalid rawText or URL for the specified source asset kind."
});

export const obsidianVaultImportPayloadSchema = z.object({
  vaultPath: nonEmptyTrimmedStringSchema,
  includeSubfolders: z.boolean().default(true),
  maxFiles: z.number().int().positive().max(500).default(100)
}).strict();

export const obsidianVaultImportResponseSchema = z.object({
  imported: z.array(sourceAssetSchema),
  skipped: z.array(z.object({
    path: z.string(),
    reason: z.string()
  })),
  warnings: z.array(z.string()),
  summary: z.object({
    scanned: z.number(),
    imported: z.number(),
    skipped: z.number()
  })
});

// Source processing schemas
export const processSourceOptionsSchema = z.object({
  async: z.boolean().optional()
}).strict();

export const processSourceResponseSchema = z.object({
  asset: sourceAssetSchema,
  drafts: z.array(extractionDraftSchema),
  warnings: z.array(z.string())
});

// Exercise submission schema
export const exerciseSubmissionPayloadSchema = z.object({
  answer: z.string().trim().min(1)
}).strict();

// AI session creation schema
export const createAiSessionPayloadSchema = z.object({
  languageId: nonEmptyTrimmedStringSchema,
  mode: aiSessionModeSchema,
  seedPrompt: z.string().default(""),
  contextNoteIds: z.array(nonEmptyTrimmedStringSchema).default([]),
  contextPassageIds: z.array(nonEmptyTrimmedStringSchema).default([])
}).strict();

/** Follow-up message body for POST /ai/sessions/:sessionId/messages */
export const aiMessagePayloadSchema = z.object({
  content: nonEmptyTrimmedStringSchema
}).strict();

/** Local prototype sign-in body for POST /auth/prototype-session */
export const prototypeSessionPayloadSchema = z.object({
  userId: nonEmptyTrimmedStringSchema
}).strict();

/** Shared API error envelope (routes may omit i18n metadata). */
export const apiErrorEnvelopeSchema = z.object({
  error: z.string().min(1),
  i18nKey: z.string().min(1).optional(),
  i18nParams: z.record(z.union([z.string(), z.number()])).optional(),
  requestId: z.string().min(1).optional()
}).strict();

export const BULK_REVIEW_MAX_DRAFT_IDS = 50;

/** Bulk accept/reject body for extraction-draft review. */
export const bulkReviewPayloadSchema = z.object({
  action: z.enum(["accept", "reject"]),
  draftIds: z.array(nonEmptyTrimmedStringSchema).min(1).max(BULK_REVIEW_MAX_DRAFT_IDS)
}).strict().transform((data) => ({
  action: data.action,
  draftIds: [...new Set(data.draftIds)]
}));

const parseableDateStringSchema = z.string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "effectiveDate must be a parseable date string"
  });

export const governancePayloadSchema = z.object({
  languageId: nonEmptyTrimmedStringSchema,
  policyType: z.enum(["consent", "access", "generation"]),
  content: nonEmptyTrimmedStringSchema,
  effectiveDate: parseableDateStringSchema
}).strict();

export const reviewPolicyPayloadSchema = z.object({
  assignedReviewerIds: z.array(nonEmptyTrimmedStringSchema).min(1),
  approvalThreshold: z.number().int().min(1),
  requiresAssignedReviewer: z.boolean().default(true)
}).strict();

export const reviewDispositionResolvePayloadSchema = z.object({
  resolutionSummary: nonEmptyTrimmedStringSchema
}).strict();

export const reviewDispositionResolveByIdPayloadSchema = reviewDispositionResolvePayloadSchema.extend({
  dispositionId: nonEmptyTrimmedStringSchema
}).strict();

// Elder correction schema
export const elderCorrectionPayloadSchema = z.object({
  languageId: nonEmptyTrimmedStringSchema,
  noteId: optionalTrimmedStringSchema,
  passageId: optionalTrimmedStringSchema,
  correction: nonEmptyTrimmedStringSchema,
  rationale: nonEmptyTrimmedStringSchema,
  severity: z.enum(["minor", "major", "safety"]),
  contextText: optionalTrimmedStringSchema
}).strict().refine((data) => data.noteId !== undefined || data.passageId !== undefined || data.contextText !== undefined, {
  message: "At least one correction target or contextText is required"
});

export type LanguageCreatePayload = z.infer<typeof languageCreatePayloadSchema>;
export type LanguagePatchPayload = z.infer<typeof languagePatchPayloadSchema>;
export type SourceTextRegistrationKind = z.infer<typeof sourceTextRegistrationKindSchema>;
export type SourceUploadKind = z.infer<typeof sourceUploadKindSchema>;
export type SourceRegistrationPayload = z.infer<typeof sourceRegistrationPayloadSchema>;
export type ObsidianVaultImportPayload = z.infer<typeof obsidianVaultImportPayloadSchema>;
export type ObsidianVaultImportResponse = z.infer<typeof obsidianVaultImportResponseSchema>;
export type ProcessSourceOptions = z.infer<typeof processSourceOptionsSchema>;
export type ProcessSourceResponse = z.infer<typeof processSourceResponseSchema>;
export type ExerciseSubmissionPayload = z.infer<typeof exerciseSubmissionPayloadSchema>;
export type CreateAiSessionPayload = z.infer<typeof createAiSessionPayloadSchema>;
export type AiMessagePayload = z.infer<typeof aiMessagePayloadSchema>;
export type PrototypeSessionPayload = z.infer<typeof prototypeSessionPayloadSchema>;
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;
export type BulkReviewPayload = z.infer<typeof bulkReviewPayloadSchema>;
export type GovernancePayload = z.infer<typeof governancePayloadSchema>;
export type ReviewPolicyPayload = z.infer<typeof reviewPolicyPayloadSchema>;
export type ReviewDispositionResolvePayload = z.infer<typeof reviewDispositionResolvePayloadSchema>;
export type ReviewDispositionResolveByIdPayload = z.infer<typeof reviewDispositionResolveByIdPayloadSchema>;
export type ElderCorrectionPayload = z.infer<typeof elderCorrectionPayloadSchema>;
