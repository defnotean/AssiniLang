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
export type ElderCorrectionPayload = z.infer<typeof elderCorrectionPayloadSchema>;
