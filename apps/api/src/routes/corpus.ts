import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  corpusPassageToAnswerKey,
  findUncoveredCorpusTargetTokens,
  type AppState,
  type CorpusPassage
} from "@assini/db";
import {
  appendAuditEvent,
  corpusPhonologyValidationError,
  corpusTargetContainsSurface,
  firstDuplicateNormalizedValue,
  normalizeAuthoredAnswer,
  requireActor
} from "../routeHelpers.js";
import type { RouteContext } from "./context.js";
import { parseCorpusImportBody, type CorpusImportBody } from "./corpusParsing.js";

export type CorpusImportDryRunResponse = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  preview: CorpusImportBody | null;
};

function isCorpusDryRunRequest(request: { query: unknown }, rawBody: unknown): boolean {
  const query = request.query as Record<string, string | undefined>;
  if (query.dryRun === "1" || query.dryRun === "true") {
    return true;
  }
  if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
    return (rawBody as Record<string, unknown>).dryRun === true;
  }
  return false;
}

function corpusImportPayloadFromRequest(rawBody: unknown): unknown {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return rawBody;
  }
  const { dryRun: _dryRun, ...rest } = rawBody as Record<string, unknown>;
  return rest;
}

function corpusImportValidationWarnings(state: AppState, languageId: string): string[] {
  const warnings: string[] = [];
  const language = state.languages.find((item) => item.id === languageId);
  if (!language) {
    return warnings;
  }

  const lexemes = state.lexemes.filter((lexeme) => lexeme.languageId === languageId);
  if (lexemes.length === 0) {
    warnings.push(`Morpheme lexicon grounding is skipped because ${language.name} has no lexicon entries yet.`);
  }

  const phonology = language.phonology;
  if (!phonology || (phonology.consonants.length === 0 && phonology.vowels.length === 0)) {
    warnings.push(`Orthography validation is skipped because ${language.name} has no phonology inventory declared.`);
  }

  return warnings;
}

function corpusMorphemeGroundingError(state: AppState, languageId: string, body: CorpusImportBody): string | undefined {
  const language = state.languages.find((item) => item.id === languageId);
  if (!language) {
    return `Corpus import language not found: ${languageId}`;
  }

  const lexemes = state.lexemes.filter((lexeme) => lexeme.languageId === languageId);
  if (lexemes.length === 0) {
    // No lexicon exists yet for this language, so morpheme grounding
    // cannot be enforced. Imports still pass segmentation/coverage checks.
    return undefined;
  }

  const knownGlossedForms = new Set(["unanalyzed"]);
  const vocabularyForms = new Set(lexemes.map((item) => item.form.toLowerCase()));
  for (const morpheme of body.morphologicalSegmentation) {
    const surface = morpheme.surface.toLowerCase();
    const lemma = morpheme.lemma.toLowerCase();
    if (knownGlossedForms.has(morpheme.gloss.toLowerCase())) continue;
    if (!vocabularyForms.has(surface) && !vocabularyForms.has(lemma)) {
      return `Corpus morpheme is not grounded in the ${language.name} lexicon: ${morpheme.surface}`;
    }
  }

  return undefined;
}

function corpusListValidationError(body: CorpusImportBody): string | undefined {
  const duplicateTopicTag = firstDuplicateNormalizedValue(body.topicTags);
  if (duplicateTopicTag) {
    return `Corpus topic tag is duplicated: ${duplicateTopicTag}`;
  }

  for (const morpheme of body.morphologicalSegmentation) {
    const duplicateFeature = firstDuplicateNormalizedValue(morpheme.features);
    if (duplicateFeature) {
      return `Corpus morpheme feature is duplicated for ${morpheme.surface}: ${duplicateFeature}`;
    }
  }

  return undefined;
}

export function validateCorpusImport(
  state: AppState,
  languageId: string,
  body: CorpusImportBody
): { errors: string[]; warnings: string[] } {
  const warnings = corpusImportValidationWarnings(state, languageId);
  const normalizedTarget = normalizeAuthoredAnswer(body.textTarget).toLowerCase();
  const duplicate = state.corpus.some((passage) => (
    passage.languageId === languageId
    && normalizeAuthoredAnswer(passage.textTarget).toLowerCase() === normalizedTarget
  ));

  if (duplicate) {
    return {
      errors: [`Corpus passage already exists for target text: ${body.textTarget}`],
      warnings
    };
  }

  for (const morpheme of body.morphologicalSegmentation) {
    if (!corpusTargetContainsSurface(body.textTarget, morpheme.surface)) {
      return {
        errors: [`Corpus segmentation surface is not present in target text: ${morpheme.surface}`],
        warnings
      };
    }
  }

  const listError = corpusListValidationError(body);
  if (listError) {
    return { errors: [listError], warnings };
  }

  const phonologyError = corpusPhonologyValidationError(state, languageId, body);
  if (phonologyError) {
    return { errors: [phonologyError], warnings };
  }

  const uncoveredTargetToken = findUncoveredCorpusTargetTokens(body.textTarget, body.morphologicalSegmentation)[0];
  if (uncoveredTargetToken) {
    return {
      errors: [`Corpus segmentation does not cover target token: ${uncoveredTargetToken}`],
      warnings
    };
  }

  const groundingError = corpusMorphemeGroundingError(state, languageId, body);
  if (groundingError) {
    return { errors: [groundingError], warnings };
  }

  return { errors: [], warnings };
}

function corpusImportValidationError(state: AppState, languageId: string, body: CorpusImportBody): string | undefined {
  return validateCorpusImport(state, languageId, body).errors[0];
}

export function registerCorpusRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, updateState, checkRateLimit, authToken, prototypeSessions } = ctx;

  app.get("/languages/:languageId/corpus", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return {
        error: `Language not found: ${languageId}`,
        i18nKey: "errors.languageNotFound"
      };
    }
    return state.corpus.filter((passage) => passage.languageId === languageId);
  });

  app.post("/languages/:languageId/corpus", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const dryRun = isCorpusDryRunRequest(request, request.body ?? {});
    const body = parseCorpusImportBody(corpusImportPayloadFromRequest(request.body ?? {}));
    if (!body) {
      if (dryRun) {
        return {
          ok: false,
          errors: ["Invalid corpus import body"],
          warnings: [],
          preview: null
        } satisfies CorpusImportDryRunResponse;
      }
      reply.code(400);
      return {
        error: "Invalid corpus import body",
        i18nKey: "errors.invalidCorpusImportBody"
      };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    if (!current.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return {
        error: `Language not found: ${languageId}`,
        i18nKey: "errors.languageNotFound"
      };
    }

    if (dryRun) {
      const validation = validateCorpusImport(current, languageId, body);
      return {
        ok: validation.errors.length === 0,
        errors: validation.errors,
        warnings: validation.warnings,
        preview: validation.errors.length === 0 ? body : null
      } satisfies CorpusImportDryRunResponse;
    }

    let languageMissing = false;
    let validationError: string | undefined;
    let passage: CorpusPassage | undefined;

    await updateState((state) => {
      if (!state.languages.some((language) => language.id === languageId)) {
        languageMissing = true;
        return state;
      }

      validationError = corpusImportValidationError(state, languageId, body);
      if (validationError) {
        return state;
      }

      const importedAt = new Date().toISOString();
      passage = {
        id: `imported-corpus-${languageId}-${state.corpus.filter((item) => item.languageId === languageId).length + 1}-${randomUUID()}`,
        languageId,
        ...body
      };

      return appendAuditEvent({
        ...state,
        corpus: [...state.corpus, passage],
        corpusAnswerKeys: [...(state.corpusAnswerKeys ?? []), corpusPassageToAnswerKey(passage)]
      }, {
        actor,
        at: importedAt,
        action: "corpus.imported",
        entityType: "corpus",
        entityId: passage.id,
        languageId,
        summary: `Imported corpus passage ${passage.id}.`,
        metadata: {
          source: passage.source,
          morphemeCount: passage.morphologicalSegmentation.length,
          tagCount: passage.topicTags.length,
          consentUse: passage.consentStatus.use,
          restrictionCount: passage.consentStatus.restrictions.length
        }
      });
    });

    if (languageMissing) {
      reply.code(404);
      return {
        error: `Language not found: ${languageId}`,
        i18nKey: "errors.languageNotFound"
      };
    }

    if (validationError) {
      reply.code(400);
      return { error: validationError };
    }

    if (!passage) {
      reply.code(500);
      return {
        error: "Corpus passage could not be imported",
        i18nKey: "errors.corpusImportFailed"
      };
    }

    reply.code(201);
    return passage;
  });
}
