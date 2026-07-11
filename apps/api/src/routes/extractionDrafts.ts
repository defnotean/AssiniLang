import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  corpusPassageToAnswerKey,
  findUncoveredCorpusTargetTokens,
  type AppState,
  type CorpusPassage,
  type ExtractionDraft,
  type Lexeme,
  type Note,
  type User
} from "@assini/db";
import { toExtractionDraftViews } from "../publicLanguageViews.js";
import {
  appendAuditEvent,
  corpusPhonologyValidationError,
  corpusTargetContainsSurface,
  parseStringArray,
  requireActor
} from "../routeHelpers.js";
import { enrichSegmentationFromLexicon, proposeLexiconSegmentation } from "../segmentationProposals.js";
import type { RouteContext } from "./context.js";

const BULK_REVIEW_MAX_IDS = 50;

export type AcceptDraftOptions = {
  /**
   * When true, commit lexicon longest-match segmentation instead of the
   * draft's proposed morphemes (Build "Prefer lexicon" resolution).
   */
  preferLexiconSegmentation?: boolean;
  /**
   * Optional reviewer-edited segmentation applied before accept. Mutually
   * exclusive with {@link preferLexiconSegmentation}.
   */
  morphologicalSegmentation?: CorpusPassage["morphologicalSegmentation"];
};

function parseAcceptDraftMorphemes(value: unknown): CorpusPassage["morphologicalSegmentation"] | undefined {
  if (!Array.isArray(value)) return undefined;
  const morphemes: CorpusPassage["morphologicalSegmentation"] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
    const record = item as Record<string, unknown>;
    const surface = typeof record.surface === "string" ? record.surface.trim() : "";
    const lemma = typeof record.lemma === "string" ? record.lemma.trim() : "";
    const gloss = typeof record.gloss === "string" ? record.gloss.trim() : "";
    const features = parseStringArray(record.features);
    if (!surface || !lemma || !gloss || !features) return undefined;
    morphemes.push({ surface, lemma, gloss, features });
  }

  return morphemes.length > 0 ? morphemes : undefined;
}

/**
 * Parses the optional accept-body override used by Build segmentation
 * conflict resolution. Empty / missing body is fine (keep draft).
 */
export function parseAcceptDraftBody(
  input: unknown
): { ok: true; options: AcceptDraftOptions } | { ok: false; error: string; i18nKey: string } {
  if (input === undefined || input === null || input === "") {
    return { ok: true, options: {} };
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      error: "Accept body must be an object when provided.",
      i18nKey: "errors.invalidExtractionDraftAcceptBody"
    };
  }

  const body = input as Record<string, unknown>;
  const knownKeys = new Set(["preferLexiconSegmentation", "morphologicalSegmentation"]);
  for (const key of Object.keys(body)) {
    if (!knownKeys.has(key)) {
      return {
        ok: false,
        error: `Unknown accept body field: ${key}`,
        i18nKey: "errors.invalidExtractionDraftAcceptBody"
      };
    }
  }

  const preferRaw = body.preferLexiconSegmentation;
  if (preferRaw !== undefined && typeof preferRaw !== "boolean") {
    return {
      ok: false,
      error: "preferLexiconSegmentation must be a boolean when provided.",
      i18nKey: "errors.invalidExtractionDraftAcceptBody"
    };
  }
  const preferLexiconSegmentation = preferRaw === true;

  let morphologicalSegmentation: CorpusPassage["morphologicalSegmentation"] | undefined;
  if (body.morphologicalSegmentation !== undefined) {
    morphologicalSegmentation = parseAcceptDraftMorphemes(body.morphologicalSegmentation);
    if (!morphologicalSegmentation) {
      return {
        ok: false,
        error:
          "morphologicalSegmentation must be a non-empty array of morphemes with surface, lemma, gloss, and features.",
        i18nKey: "errors.invalidExtractionDraftAcceptBody"
      };
    }
  }

  if (preferLexiconSegmentation && morphologicalSegmentation) {
    return {
      ok: false,
      error: "Provide either preferLexiconSegmentation or morphologicalSegmentation, not both.",
      i18nKey: "errors.invalidExtractionDraftAcceptBody"
    };
  }

  return {
    ok: true,
    options: {
      ...(preferLexiconSegmentation ? { preferLexiconSegmentation: true } : {}),
      ...(morphologicalSegmentation ? { morphologicalSegmentation } : {})
    }
  };
}

/**
 * Ensures a corpus passage accepted from an extraction draft always has
 * full segmentation coverage: when the proposed morphemes do not cover
 * the target text, try lexicon-based longest-match segmentation, then
 * fall back to honest token-level "unanalyzed" pieces.
 */
function ensureCorpusDraftSegmentation(
  textTarget: string,
  proposed: CorpusPassage["morphologicalSegmentation"],
  lexemes: Lexeme[]
): CorpusPassage["morphologicalSegmentation"] {
  const candidate = enrichSegmentationFromLexicon(textTarget, proposed, lexemes);
  const usable = candidate.filter(
    (morpheme) =>
      morpheme.surface.trim().length > 0 && morpheme.lemma.trim().length > 0 && morpheme.gloss.trim().length > 0
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

type DraftReviewI18n = {
  i18nKey: string;
  i18nParams?: Record<string, string | number>;
};

type AcceptDraftOutcome = {
  state: AppState;
  committed?: { draft: ExtractionDraft; entity: Lexeme | CorpusPassage | Note };
  draftMissing?: boolean;
  validationError?: string;
} & Partial<DraftReviewI18n>;

type RejectDraftOutcome = {
  state: AppState;
  rejected?: ExtractionDraft;
  draftMissing?: boolean;
  validationError?: string;
} & Partial<DraftReviewI18n>;

function alreadyReviewedI18n(status: string): DraftReviewI18n {
  if (status === "accepted") {
    return { i18nKey: "errors.extractionDraftAlreadyAccepted" };
  }
  if (status === "rejected") {
    return { i18nKey: "errors.extractionDraftAlreadyRejected" };
  }
  if (status === "proposed") {
    return { i18nKey: "errors.extractionDraftAlreadyProposed" };
  }
  return {
    i18nKey: "errors.extractionDraftAlreadyStatus",
    i18nParams: { status }
  };
}

/**
 * Pure state transition that accepts a single proposed extraction draft:
 * validates the payload, commits the entity (lexeme / corpus passage /
 * grammar note), marks the draft accepted, and appends one audit event.
 * Shared by the single-draft accept route and the bulk-review route.
 *
 * Optional {@link AcceptDraftOptions} let Build reviewers resolve
 * segmentation conflicts without a separate PATCH: prefer lexicon
 * longest-match, or supply an edited morpheme list.
 */
function applyAcceptDraft(
  state: AppState,
  draftId: string,
  actor: User,
  options: AcceptDraftOptions = {}
): AcceptDraftOutcome {
  const draft = state.extractionDrafts.find((item) => item.id === draftId);
  if (!draft) {
    return { state, draftMissing: true };
  }

  if (draft.status !== "proposed") {
    return {
      state,
      validationError: `Extraction draft is already ${draft.status}.`,
      ...alreadyReviewedI18n(draft.status)
    };
  }

  if ((options.preferLexiconSegmentation || options.morphologicalSegmentation) && draft.kind !== "corpus_passage") {
    return {
      state,
      validationError: "Segmentation accept overrides are only valid for corpus_passage drafts.",
      i18nKey: "errors.invalidExtractionDraftAcceptBody"
    };
  }

  const reviewedAt = new Date().toISOString();

  if (draft.kind === "lexeme") {
    const form = draft.payload.form?.trim() ?? "";
    const gloss = draft.payload.gloss?.trim() ?? "";
    if (!form || !gloss) {
      return {
        state,
        validationError: "Lexeme draft is missing form or gloss.",
        i18nKey: "errors.lexemeDraftMissingFormOrGloss"
      };
    }

    const duplicate = state.lexemes.some(
      (lexeme) =>
        lexeme.languageId === draft.languageId &&
        lexeme.form.trim().toLowerCase() === form.toLowerCase() &&
        lexeme.gloss.trim().toLowerCase() === gloss.toLowerCase()
    );
    if (duplicate) {
      return {
        state,
        validationError: `Lexeme already exists: ${form} (${gloss})`,
        i18nKey: "errors.lexemeAlreadyExists",
        i18nParams: { form, gloss }
      };
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

    return {
      committed: { draft: updatedDraft, entity: lexeme },
      state: appendAuditEvent(
        {
          ...state,
          lexemes: [...state.lexemes, lexeme],
          extractionDrafts: state.extractionDrafts.map((item) => (item.id === draftId ? updatedDraft : item))
        },
        {
          actor,
          at: reviewedAt,
          action: "extraction_draft.accepted",
          entityType: "lexeme",
          entityId: lexeme.id,
          languageId: draft.languageId,
          summary: `Accepted lexeme draft ${form}.`,
          metadata: { draftId, kind: draft.kind }
        }
      )
    };
  }

  if (draft.kind === "corpus_passage") {
    const textTarget = draft.payload.textTarget?.trim().replace(/\s+/g, " ") ?? "";
    const textTranslation = draft.payload.textTranslation?.trim().replace(/\s+/g, " ") ?? "";
    if (!textTarget || !textTranslation) {
      return {
        state,
        validationError: "Corpus draft is missing target text or translation.",
        i18nKey: "errors.corpusDraftMissingTextOrTranslation"
      };
    }

    const normalizedTarget = textTarget.toLowerCase();
    const duplicate = state.corpus.some(
      (passage) =>
        passage.languageId === draft.languageId &&
        passage.textTarget.trim().replace(/\s+/g, " ").toLowerCase() === normalizedTarget
    );
    if (duplicate) {
      return {
        state,
        validationError: `Corpus passage already exists for target text: ${textTarget}`,
        i18nKey: "errors.corpusPassageAlreadyExists",
        i18nParams: { textTarget }
      };
    }

    const sourceAsset = state.sourceAssets.find((item) => item.id === draft.sourceAssetId);
    const languageLexemes = state.lexemes.filter((lexeme) => lexeme.languageId === draft.languageId);
    const proposedSegmentation = options.preferLexiconSegmentation
      ? proposeLexiconSegmentation(textTarget, languageLexemes)
      : (options.morphologicalSegmentation ?? draft.payload.morphologicalSegmentation);
    const segmentation = ensureCorpusDraftSegmentation(textTarget, proposedSegmentation, languageLexemes);
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
      return {
        state,
        validationError: phonologyError,
        i18nKey: "errors.corpusDraftPhonologyInvalid"
      };
    }

    const updatedDraft: ExtractionDraft = {
      ...draft,
      status: "accepted",
      reviewedBy: actor.id,
      reviewedAt,
      committedEntityId: passage.id
    };

    return {
      committed: { draft: updatedDraft, entity: passage },
      state: appendAuditEvent(
        {
          ...state,
          corpus: [...state.corpus, passage],
          corpusAnswerKeys: [...(state.corpusAnswerKeys ?? []), corpusPassageToAnswerKey(passage)],
          extractionDrafts: state.extractionDrafts.map((item) => (item.id === draftId ? updatedDraft : item))
        },
        {
          actor,
          at: reviewedAt,
          action: "extraction_draft.accepted",
          entityType: "corpus",
          entityId: passage.id,
          languageId: draft.languageId,
          summary: `Accepted corpus draft into passage ${passage.id}.`,
          metadata: {
            draftId,
            kind: draft.kind,
            morphemeCount: passage.morphologicalSegmentation.length,
            ...(options.preferLexiconSegmentation ? { preferLexiconSegmentation: true } : {}),
            ...(options.morphologicalSegmentation ? { segmentationOverride: true } : {})
          }
        }
      )
    };
  }

  const topic = draft.payload.topic?.trim() ?? "";
  const explanation = draft.payload.explanation?.trim() ?? "";
  if (!topic || !explanation) {
    return {
      state,
      validationError: "Grammar note draft is missing topic or explanation.",
      i18nKey: "errors.grammarNoteDraftMissingTopicOrExplanation"
    };
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

  return {
    committed: { draft: updatedDraft, entity: note },
    state: appendAuditEvent(
      {
        ...state,
        notes: [...state.notes, note],
        extractionDrafts: state.extractionDrafts.map((item) => (item.id === draftId ? updatedDraft : item))
      },
      {
        actor,
        at: reviewedAt,
        action: "extraction_draft.accepted",
        entityType: "note",
        entityId: note.id,
        languageId: draft.languageId,
        summary: `Accepted grammar-note draft into note ${note.id}.`,
        metadata: { draftId, kind: draft.kind }
      }
    )
  };
}

/**
 * Pure state transition that rejects a single proposed extraction draft
 * and appends one audit event. Shared by the single-draft reject route
 * and the bulk-review route.
 */
function applyRejectDraft(state: AppState, draftId: string, actor: User): RejectDraftOutcome {
  const draft = state.extractionDrafts.find((item) => item.id === draftId);
  if (!draft) {
    return { state, draftMissing: true };
  }

  if (draft.status !== "proposed") {
    return {
      state,
      validationError: `Extraction draft is already ${draft.status}.`,
      ...alreadyReviewedI18n(draft.status)
    };
  }

  const reviewedAt = new Date().toISOString();
  const rejected: ExtractionDraft = {
    ...draft,
    status: "rejected",
    reviewedBy: actor.id,
    reviewedAt
  };

  return {
    rejected,
    state: appendAuditEvent(
      {
        ...state,
        extractionDrafts: state.extractionDrafts.map((item) => (item.id === draftId ? rejected : item))
      },
      {
        actor,
        at: reviewedAt,
        action: "extraction_draft.rejected",
        entityType: "extraction_draft",
        entityId: draftId,
        languageId: draft.languageId,
        summary: `Rejected extraction draft ${draftId}.`,
        metadata: { kind: draft.kind }
      }
    )
  };
}

type BulkReviewItemResult = {
  draftId: string;
  ok: boolean;
  error?: string;
  i18nKey?: string;
  i18nParams?: Record<string, string | number>;
  committedEntityId?: string;
};

function bulkItemFailure(draftId: string, error: string, i18n?: DraftReviewI18n): BulkReviewItemResult {
  return {
    draftId,
    ok: false,
    error,
    ...(i18n?.i18nKey ? { i18nKey: i18n.i18nKey, ...(i18n.i18nParams ? { i18nParams: i18n.i18nParams } : {}) } : {})
  };
}

export function registerExtractionDraftRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, updateState, checkRateLimit, authToken, prototypeSessions } = ctx;

  app.get("/languages/:languageId/extraction-drafts", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const { status } = request.query as { status?: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return {
        error: `Language not found: ${languageId}`,
        i18nKey: "errors.languageNotFound"
      };
    }

    const drafts = state.extractionDrafts.filter((draft) => draft.languageId === languageId);
    if (status === "proposed" || status === "accepted" || status === "rejected") {
      return toExtractionDraftViews(
        state,
        drafts.filter((draft) => draft.status === status)
      );
    }
    return toExtractionDraftViews(state, drafts);
  });

  app.post("/extraction-drafts/:draftId/accept", async (request, reply) => {
    const { draftId } = request.params as { draftId: string };
    const parsedBody = parseAcceptDraftBody(request.body);
    if (!parsedBody.ok) {
      reply.code(400);
      return { error: parsedBody.error, i18nKey: parsedBody.i18nKey };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    let outcome: AcceptDraftOutcome | undefined;

    await updateState((state) => {
      outcome = applyAcceptDraft(state, draftId, actor, parsedBody.options);
      return outcome.state;
    });

    if (outcome?.draftMissing) {
      reply.code(404);
      return {
        error: `Extraction draft not found: ${draftId}`,
        i18nKey: "errors.extractionDraftNotFound"
      };
    }

    if (outcome?.validationError) {
      reply.code(400);
      return {
        error: outcome.validationError,
        ...(outcome.i18nKey
          ? { i18nKey: outcome.i18nKey, ...(outcome.i18nParams ? { i18nParams: outcome.i18nParams } : {}) }
          : {})
      };
    }

    if (!outcome?.committed) {
      reply.code(500);
      return {
        error: "Extraction draft could not be accepted",
        i18nKey: "errors.extractionDraftAcceptFailed"
      };
    }

    return outcome.committed;
  });

  app.post("/extraction-drafts/:draftId/reject", async (request, reply) => {
    const { draftId } = request.params as { draftId: string };

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    let outcome: RejectDraftOutcome | undefined;

    await updateState((state) => {
      outcome = applyRejectDraft(state, draftId, actor);
      return outcome.state;
    });

    if (outcome?.draftMissing) {
      reply.code(404);
      return {
        error: `Extraction draft not found: ${draftId}`,
        i18nKey: "errors.extractionDraftNotFound"
      };
    }

    if (outcome?.validationError) {
      reply.code(400);
      return {
        error: outcome.validationError,
        ...(outcome.i18nKey
          ? { i18nKey: outcome.i18nKey, ...(outcome.i18nParams ? { i18nParams: outcome.i18nParams } : {}) }
          : {})
      };
    }

    if (!outcome?.rejected) {
      reply.code(500);
      return {
        error: "Extraction draft could not be rejected",
        i18nKey: "errors.extractionDraftRejectFailed"
      };
    }

    return outcome.rejected;
  });

  app.post("/languages/:languageId/extraction-drafts/bulk-review", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const body = request.body as { action?: unknown; draftIds?: unknown } | null | undefined;

    const action = body?.action;
    if (action !== "accept" && action !== "reject") {
      reply.code(400);
      return {
        error: 'Body must include action: "accept" or "reject".',
        i18nKey: "errors.bulkReviewInvalidAction"
      };
    }

    const rawDraftIds = body?.draftIds;
    if (
      !Array.isArray(rawDraftIds) ||
      rawDraftIds.length === 0 ||
      rawDraftIds.some((id) => typeof id !== "string" || id.trim().length === 0)
    ) {
      reply.code(400);
      return {
        error: "Body must include draftIds: a non-empty array of draft id strings.",
        i18nKey: "errors.bulkReviewInvalidDraftIds"
      };
    }
    if (rawDraftIds.length > BULK_REVIEW_MAX_IDS) {
      reply.code(400);
      return {
        error: `Too many draftIds: at most ${BULK_REVIEW_MAX_IDS} per request.`,
        i18nKey: "errors.bulkReviewTooManyDraftIds",
        i18nParams: { max: BULK_REVIEW_MAX_IDS }
      };
    }
    const draftIds = [...new Set((rawDraftIds as string[]).map((id) => id.trim()))];

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

    let results: BulkReviewItemResult[] = [];

    await updateState((state) => {
      // Reset on every updater invocation so a retried transaction does
      // not duplicate per-item results.
      results = [];
      let working = state;

      for (const draftId of draftIds) {
        const draft = working.extractionDrafts.find((item) => item.id === draftId);
        if (!draft) {
          results.push(
            bulkItemFailure(draftId, `Extraction draft not found: ${draftId}`, {
              i18nKey: "errors.extractionDraftNotFound"
            })
          );
          continue;
        }
        if (draft.languageId !== languageId) {
          results.push(
            bulkItemFailure(draftId, `Extraction draft does not belong to language ${languageId}.`, {
              i18nKey: "errors.extractionDraftWrongLanguage",
              i18nParams: { languageId }
            })
          );
          continue;
        }

        if (action === "accept") {
          const outcome = applyAcceptDraft(working, draftId, actor);
          working = outcome.state;
          if (outcome.committed) {
            results.push({ draftId, ok: true, committedEntityId: outcome.committed.draft.committedEntityId });
          } else {
            results.push(
              bulkItemFailure(
                draftId,
                outcome.validationError ?? `Extraction draft not found: ${draftId}`,
                outcome.i18nKey
                  ? { i18nKey: outcome.i18nKey, i18nParams: outcome.i18nParams }
                  : { i18nKey: "errors.extractionDraftNotFound" }
              )
            );
          }
        } else {
          const outcome = applyRejectDraft(working, draftId, actor);
          working = outcome.state;
          if (outcome.rejected) {
            results.push({ draftId, ok: true });
          } else {
            results.push(
              bulkItemFailure(
                draftId,
                outcome.validationError ?? `Extraction draft not found: ${draftId}`,
                outcome.i18nKey
                  ? { i18nKey: outcome.i18nKey, i18nParams: outcome.i18nParams }
                  : { i18nKey: "errors.extractionDraftNotFound" }
              )
            );
          }
        }
      }

      return working;
    });

    const succeeded = results.filter((item) => item.ok).length;
    return {
      results,
      accepted: action === "accept" ? succeeded : 0,
      rejected: action === "reject" ? succeeded : 0,
      failed: results.length - succeeded
    };
  });
}
