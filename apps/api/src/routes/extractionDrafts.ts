import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  corpusPassageToAnswerKey,
  findUncoveredCorpusTargetTokens,
  type CorpusPassage,
  type ExtractionDraft,
  type Lexeme,
  type Note
} from "@assini/db";
import { toExtractionDraftViews } from "../publicLanguageViews.js";
import {
  appendAuditEvent,
  corpusPhonologyValidationError,
  corpusTargetContainsSurface,
  requireActor
} from "../routeHelpers.js";
import type { RouteContext } from "./context.js";

/**
 * Ensures a corpus passage accepted from an extraction draft always has
 * full segmentation coverage: when the proposed morphemes do not cover
 * the target text, fall back to honest token-level "unanalyzed" pieces.
 */
function ensureCorpusDraftSegmentation(
  textTarget: string,
  proposed: CorpusPassage["morphologicalSegmentation"]
): CorpusPassage["morphologicalSegmentation"] {
  const usable = proposed.filter((morpheme) =>
    morpheme.surface.trim().length > 0
    && morpheme.lemma.trim().length > 0
    && morpheme.gloss.trim().length > 0
  );
  if (usable.length > 0 && findUncoveredCorpusTargetTokens(textTarget, usable).length === 0) {
    const coveredInText = usable.every((morpheme) => corpusTargetContainsSurface(textTarget, morpheme.surface));
    if (coveredInText) {
      return usable;
    }
  }

  return textTarget
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => ({
      surface: token,
      lemma: token,
      gloss: "unanalyzed",
      features: ["unanalyzed"]
    }));
}

export function registerExtractionDraftRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, updateState, checkRateLimit, authToken, prototypeSessions } = ctx;

  app.get("/languages/:languageId/extraction-drafts", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const { status } = request.query as { status?: string };
    const state = await readState();
    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    const drafts = state.extractionDrafts.filter((draft) => draft.languageId === languageId);
    if (status === "proposed" || status === "accepted" || status === "rejected") {
      return toExtractionDraftViews(state, drafts.filter((draft) => draft.status === status));
    }
    return toExtractionDraftViews(state, drafts);
  });

  app.post("/extraction-drafts/:draftId/accept", async (request, reply) => {
    const { draftId } = request.params as { draftId: string };

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    let draftMissing = false;
    let validationError: string | undefined;
    let committed: { draft: ExtractionDraft; entity: Lexeme | CorpusPassage | Note } | undefined;

    await updateState((state) => {
      const draft = state.extractionDrafts.find((item) => item.id === draftId);
      if (!draft) {
        draftMissing = true;
        return state;
      }

      if (draft.status !== "proposed") {
        validationError = `Extraction draft is already ${draft.status}.`;
        return state;
      }

      const reviewedAt = new Date().toISOString();

      if (draft.kind === "lexeme") {
        const form = draft.payload.form?.trim() ?? "";
        const gloss = draft.payload.gloss?.trim() ?? "";
        if (!form || !gloss) {
          validationError = "Lexeme draft is missing form or gloss.";
          return state;
        }

        const duplicate = state.lexemes.some((lexeme) =>
          lexeme.languageId === draft.languageId
          && lexeme.form.trim().toLowerCase() === form.toLowerCase()
          && lexeme.gloss.trim().toLowerCase() === gloss.toLowerCase()
        );
        if (duplicate) {
          validationError = `Lexeme already exists: ${form} (${gloss})`;
          return state;
        }

        const lexeme: Lexeme = {
          id: `lex-${randomUUID()}`,
          languageId: draft.languageId,
          form,
          gloss,
          partOfSpeech: draft.payload.partOfSpeech?.trim() || "unknown",
          tags: draft.payload.tags,
          sourceAssetIds: [draft.sourceAssetId],
          createdBy: actor.id,
          createdAt: reviewedAt
        };

        const updatedDraft: ExtractionDraft = {
          ...draft,
          status: "accepted",
          reviewedBy: actor.id,
          reviewedAt,
          committedEntityId: lexeme.id
        };
        committed = { draft: updatedDraft, entity: lexeme };

        return appendAuditEvent({
          ...state,
          lexemes: [...state.lexemes, lexeme],
          extractionDrafts: state.extractionDrafts.map((item) => (item.id === draftId ? updatedDraft : item))
        }, {
          actor,
          at: reviewedAt,
          action: "extraction_draft.accepted",
          entityType: "lexeme",
          entityId: lexeme.id,
          languageId: draft.languageId,
          summary: `Accepted lexeme draft ${form}.`,
          metadata: { draftId, kind: draft.kind }
        });
      }

      if (draft.kind === "corpus_passage") {
        const textTarget = draft.payload.textTarget?.trim().replace(/\s+/g, " ") ?? "";
        const textTranslation = draft.payload.textTranslation?.trim().replace(/\s+/g, " ") ?? "";
        if (!textTarget || !textTranslation) {
          validationError = "Corpus draft is missing target text or translation.";
          return state;
        }

        const normalizedTarget = textTarget.toLowerCase();
        const duplicate = state.corpus.some((passage) =>
          passage.languageId === draft.languageId
          && passage.textTarget.trim().replace(/\s+/g, " ").toLowerCase() === normalizedTarget
        );
        if (duplicate) {
          validationError = `Corpus passage already exists for target text: ${textTarget}`;
          return state;
        }

        const sourceAsset = state.sourceAssets.find((item) => item.id === draft.sourceAssetId);
        const segmentation = ensureCorpusDraftSegmentation(textTarget, draft.payload.morphologicalSegmentation);
        const passage: CorpusPassage = {
          id: `ingested-corpus-${draft.languageId}-${randomUUID()}`,
          languageId: draft.languageId,
          source: sourceAsset ? `source-asset:${sourceAsset.title}` : "ingested-source",
          sourceMetadata: {
            author: sourceAsset?.createdBy ?? actor.id,
            year: new Date(reviewedAt).getUTCFullYear(),
            license: "user-provided-source",
            consentRecord: `source-asset:${draft.sourceAssetId}`
          },
          textTarget,
          textTranslation,
          morphologicalSegmentation: segmentation,
          topicTags: draft.payload.topicTags.length > 0 ? draft.payload.topicTags : ["imported"],
          consentStatus: {
            use: "pending-review",
            restrictions: ["ingested-from-raw-source"]
          },
          sourceAssetId: draft.sourceAssetId
        };

        const phonologyError = corpusPhonologyValidationError(state, draft.languageId, passage);
        if (phonologyError) {
          validationError = phonologyError;
          return state;
        }

        const updatedDraft: ExtractionDraft = {
          ...draft,
          status: "accepted",
          reviewedBy: actor.id,
          reviewedAt,
          committedEntityId: passage.id
        };
        committed = { draft: updatedDraft, entity: passage };

        return appendAuditEvent({
          ...state,
          corpus: [...state.corpus, passage],
          corpusAnswerKeys: [...(state.corpusAnswerKeys ?? []), corpusPassageToAnswerKey(passage)],
          extractionDrafts: state.extractionDrafts.map((item) => (item.id === draftId ? updatedDraft : item))
        }, {
          actor,
          at: reviewedAt,
          action: "extraction_draft.accepted",
          entityType: "corpus",
          entityId: passage.id,
          languageId: draft.languageId,
          summary: `Accepted corpus draft into passage ${passage.id}.`,
          metadata: { draftId, kind: draft.kind, morphemeCount: passage.morphologicalSegmentation.length }
        });
      }

      const topic = draft.payload.topic?.trim() ?? "";
      const explanation = draft.payload.explanation?.trim() ?? "";
      if (!topic || !explanation) {
        validationError = "Grammar note draft is missing topic or explanation.";
        return state;
      }

      const note: Note = {
        id: `note-${draft.languageId}-${randomUUID()}`,
        languageId: draft.languageId,
        topic,
        explanation,
        examples: [],
        evidencePassageIds: [],
        evidenceCount: 0,
        confidence: draft.confidence,
        status: "draft",
        reviewer: {
          lastReviewedBy: null,
          lastReviewedAt: null,
          comments: []
        },
        dialectScope: "general",
        editHistory: [
          {
            at: reviewedAt,
            by: actor.id,
            action: "created",
            summary: `Accepted grammar-note extraction draft ${draftId}.`
          }
        ]
      };

      const updatedDraft: ExtractionDraft = {
        ...draft,
        status: "accepted",
        reviewedBy: actor.id,
        reviewedAt,
        committedEntityId: note.id
      };
      committed = { draft: updatedDraft, entity: note };

      return appendAuditEvent({
        ...state,
        notes: [...state.notes, note],
        extractionDrafts: state.extractionDrafts.map((item) => (item.id === draftId ? updatedDraft : item))
      }, {
        actor,
        at: reviewedAt,
        action: "extraction_draft.accepted",
        entityType: "note",
        entityId: note.id,
        languageId: draft.languageId,
        summary: `Accepted grammar-note draft into note ${note.id}.`,
        metadata: { draftId, kind: draft.kind }
      });
    });

    if (draftMissing) {
      reply.code(404);
      return { error: `Extraction draft not found: ${draftId}` };
    }

    if (validationError) {
      reply.code(400);
      return { error: validationError };
    }

    if (!committed) {
      reply.code(500);
      return { error: "Extraction draft could not be accepted" };
    }

    return committed;
  });

  app.post("/extraction-drafts/:draftId/reject", async (request, reply) => {
    const { draftId } = request.params as { draftId: string };

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    let draftMissing = false;
    let validationError: string | undefined;
    let rejected: ExtractionDraft | undefined;

    await updateState((state) => {
      const draft = state.extractionDrafts.find((item) => item.id === draftId);
      if (!draft) {
        draftMissing = true;
        return state;
      }

      if (draft.status !== "proposed") {
        validationError = `Extraction draft is already ${draft.status}.`;
        return state;
      }

      const reviewedAt = new Date().toISOString();
      rejected = {
        ...draft,
        status: "rejected",
        reviewedBy: actor.id,
        reviewedAt
      };

      return appendAuditEvent({
        ...state,
        extractionDrafts: state.extractionDrafts.map((item) => (item.id === draftId ? rejected as ExtractionDraft : item))
      }, {
        actor,
        at: reviewedAt,
        action: "extraction_draft.rejected",
        entityType: "extraction_draft",
        entityId: draftId,
        languageId: draft.languageId,
        summary: `Rejected extraction draft ${draftId}.`,
        metadata: { kind: draft.kind }
      });
    });

    if (draftMissing) {
      reply.code(404);
      return { error: `Extraction draft not found: ${draftId}` };
    }

    if (validationError) {
      reply.code(400);
      return { error: validationError };
    }

    if (!rejected) {
      reply.code(500);
      return { error: "Extraction draft could not be rejected" };
    }

    return rejected;
  });
}
