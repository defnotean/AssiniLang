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

function corpusImportValidationError(state: AppState, languageId: string, body: CorpusImportBody): string | undefined {
  const normalizedTarget = normalizeAuthoredAnswer(body.textTarget).toLowerCase();
  const duplicate = state.corpus.some((passage) => (
    passage.languageId === languageId
    && normalizeAuthoredAnswer(passage.textTarget).toLowerCase() === normalizedTarget
  ));

  if (duplicate) {
    return `Corpus passage already exists for target text: ${body.textTarget}`;
  }

  for (const morpheme of body.morphologicalSegmentation) {
    if (!corpusTargetContainsSurface(body.textTarget, morpheme.surface)) {
      return `Corpus segmentation surface is not present in target text: ${morpheme.surface}`;
    }
  }

  const listError = corpusListValidationError(body);
  if (listError) {
    return listError;
  }

  const phonologyError = corpusPhonologyValidationError(state, languageId, body);
  if (phonologyError) {
    return phonologyError;
  }

  const uncoveredTargetToken = findUncoveredCorpusTargetTokens(body.textTarget, body.morphologicalSegmentation)[0];
  if (uncoveredTargetToken) {
    return `Corpus segmentation does not cover target token: ${uncoveredTargetToken}`;
  }

  const groundingError = corpusMorphemeGroundingError(state, languageId, body);
  if (groundingError) {
    return groundingError;
  }

  return undefined;
}

export function registerCorpusRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, updateState, checkRateLimit, authToken, prototypeSessions } = ctx;

  app.get("/languages/:languageId/corpus", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }
    return state.corpus.filter((passage) => passage.languageId === languageId);
  });

  app.post("/languages/:languageId/corpus", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const body = parseCorpusImportBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid corpus import body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

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
      return { error: `Language not found: ${languageId}` };
    }

    if (validationError) {
      reply.code(400);
      return { error: validationError };
    }

    if (!passage) {
      reply.code(500);
      return { error: "Corpus passage could not be imported" };
    }

    reply.code(201);
    return passage;
  });
}
