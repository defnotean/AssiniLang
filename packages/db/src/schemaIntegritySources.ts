import { z } from "zod";
import {
  languageSchema,
  corpusPassageSchema,
  lexemeSchema,
  sourceAssetSchema,
  extractionDraftSchema,
  noteSchema,
  userSchema
} from "./schemaDomains.js";
import { isBlankPersistedValue, isSafePersistedLanguageId, normalizePersistedText } from "./schemaIntegrityCore.js";
import { sourceAssetFilePathIssue } from "./sourceAssetPathValidation.js";

export function addLanguageIntegrityIssues(
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
        language.phonology.syllableTemplate !== undefined &&
        isBlankPersistedValue(language.phonology.syllableTemplate)
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

export function addLexemeIntegrityIssues(
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

    for (const [field, value] of [
      ["form", lexeme.form],
      ["gloss", lexeme.gloss],
      ["partOfSpeech", lexeme.partOfSpeech]
    ] as const) {
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

export function addSourceAssetIntegrityIssues(
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

    if (
      (asset.kind === "text" || asset.kind === "wordlist") &&
      asset.rawText === undefined &&
      asset.filePath === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Text source asset requires rawText or filePath: ${asset.id}`,
        path: ["sourceAssets", asset.id]
      });
    }

    if (
      (asset.kind === "image" || asset.kind === "audio" || asset.kind === "document") &&
      asset.filePath === undefined
    ) {
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

export function addExtractionDraftIntegrityIssues(
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

    if (
      draft.kind === "corpus_passage" &&
      (!draft.payload.textTarget?.trim() || !draft.payload.textTranslation?.trim())
    ) {
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
        const committedEntity =
          draft.kind === "lexeme"
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

export function addUserIntegrityIssues(
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
