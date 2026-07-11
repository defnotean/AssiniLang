import { z } from "zod";
import {
  languageSchema,
  corpusPassageSchema,
  sourceAssetSchema,
  noteSchema,
  userSchema,
  noteEditHistoryActionSet,
  LOCAL_PROTOTYPE_USERS
} from "./schemaDomains.js";
import {
  duplicateNormalizedPersistedValue,
  isBlankPersistedValue,
  addCorpusTextIntegrityIssues,
  addParseablePersistedDateIssue,
  isAllowedPersistedNoteActor
} from "./schemaIntegrityCore.js";

export function addCorpusIntegrityIssues(
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
        } else if (!isBlankPersistedValue(passage.languageId) && sourceAsset.languageId !== passage.languageId) {
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

export function addNoteCollectionIntegrityIssues(
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

    addParseablePersistedDateIssue(
      context,
      collectionPath,
      note.id,
      `${label} reviewer lastReviewedAt`,
      note.reviewer.lastReviewedAt
    );
    if (note.reviewer.lastReviewedBy !== null && isBlankPersistedValue(note.reviewer.lastReviewedBy)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} reviewer lastReviewedBy must not be blank`,
        path: [collectionPath, note.id]
      });
    } else if (
      note.reviewer.lastReviewedBy !== null &&
      !isAllowedPersistedNoteActor(usersById, note.reviewer.lastReviewedBy)
    ) {
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
