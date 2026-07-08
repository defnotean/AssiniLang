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

// Source registration schema
export const sourceRegistrationPayloadSchema = z.object({
  kind: z.enum(["text", "wordlist", "url"]),
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

// Source processing schemas
export const processSourceOptionsSchema = z.object({
  async: z.boolean().optional()
});

export const processSourceResponseSchema = z.object({
  asset: sourceAssetSchema,
  drafts: z.array(extractionDraftSchema),
  warnings: z.array(z.string())
});

// Exercise submission schema
export const exerciseSubmissionPayloadSchema = z.object({
  answer: z.string().trim().min(1)
});

// AI session creation schema
export const createAiSessionPayloadSchema = z.object({
  languageId: z.string().min(1),
  mode: aiSessionModeSchema,
  seedPrompt: z.string().default(""),
  contextNoteIds: z.array(z.string()).default([]),
  contextPassageIds: z.array(z.string()).default([])
});

// Elder correction schema
export const elderCorrectionPayloadSchema = z.object({
  languageId: z.string().min(1),
  noteId: z.string().optional(),
  passageId: z.string().optional(),
  correction: z.string().min(1),
  rationale: z.string().min(1),
  severity: z.enum(["minor", "major", "safety"]),
  contextText: z.string().optional()
}).refine((data) => data.noteId !== undefined || data.passageId !== undefined || data.contextText !== undefined, {
  message: "At least one correction target or contextText is required"
});

export type LanguageCreatePayload = z.infer<typeof languageCreatePayloadSchema>;
export type LanguagePatchPayload = z.infer<typeof languagePatchPayloadSchema>;
export type SourceRegistrationPayload = z.infer<typeof sourceRegistrationPayloadSchema>;
export type ProcessSourceOptions = z.infer<typeof processSourceOptionsSchema>;
export type ProcessSourceResponse = z.infer<typeof processSourceResponseSchema>;
export type ExerciseSubmissionPayload = z.infer<typeof exerciseSubmissionPayloadSchema>;
export type CreateAiSessionPayload = z.infer<typeof createAiSessionPayloadSchema>;
export type ElderCorrectionPayload = z.infer<typeof elderCorrectionPayloadSchema>;
