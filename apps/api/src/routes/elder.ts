import type { FastifyInstance } from "fastify";
import { elderCorrectionPayloadSchema } from "@assini/api-contract";
import {
  ELDER_CORRECTION_MUTATION_ROLES,
  type ElderCorrection,
  type Note
} from "@assini/db";
import { toPublicNote, toPublicNotes } from "../publicLanguageViews.js";
import { appendAuditEvent, appendAuditEvents, requireActor } from "../routeHelpers.js";
import type { RouteContext } from "./context.js";
import { parseSchemaBody } from "./requestBody.js";

type ElderCorrectionBody = {
  languageId: string;
  noteId?: string;
  passageId?: string;
  correction: string;
  rationale: string;
  severity: ElderCorrection["severity"];
  contextText?: string;
};

type ElderCorrectionReviewBody = {
  status: Extract<ElderCorrection["status"], "accepted" | "rejected">;
};

type ElderCorrectionApplyBody = {
  explanation: string;
};

function parseElderCorrectionBody(input: unknown): ElderCorrectionBody | undefined {
  return parseSchemaBody(elderCorrectionPayloadSchema, input);
}

function parseElderCorrectionReviewBody(input: unknown): ElderCorrectionReviewBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  if (body.status !== "accepted" && body.status !== "rejected") {
    return undefined;
  }

  return { status: body.status };
}

function parseElderCorrectionApplyBody(input: unknown): ElderCorrectionApplyBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const explanation = typeof body.explanation === "string" ? body.explanation.trim() : "";
  return explanation.length > 0 ? { explanation } : undefined;
}

export function registerElderRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, updateState, checkRateLimit, authToken, prototypeSessions } = ctx;

  app.get("/languages/:languageId/elder-context", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["elder", "reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    const language = state.languages.find((item) => item.id === languageId);
    if (!language) {
      reply.code(404);
      return {
        error: `Language not found: ${languageId}`,
        i18nKey: "errors.languageNotFound"
      };
    }

    return {
      language,
      corpus: state.corpus.filter((passage) => passage.languageId === languageId),
      notes: toPublicNotes(state.notes.filter((note) => note.languageId === languageId)),
      corrections: state.elderCorrections.filter((correction) => correction.languageId === languageId),
      governance: state.governance.filter((record) => record.languageId === languageId)
    };
  });

  app.get("/elder/corrections", async (request, reply) => {
    const query = request.query as { languageId?: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["elder", "reviewer", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    if (query.languageId && !state.languages.some((language) => language.id === query.languageId)) {
      reply.code(404);
      return {
        error: `Language not found: ${query.languageId}`,
        i18nKey: "errors.languageNotFound"
      };
    }

    return query.languageId
      ? state.elderCorrections.filter((correction) => correction.languageId === query.languageId)
      : state.elderCorrections;
  });

  app.post("/elder/corrections", async (request, reply) => {
    const body = parseElderCorrectionBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return {
        error: "Invalid elder correction body",
        i18nKey: "elderWs.errInvalidCorrectionBody"
      };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ELDER_CORRECTION_MUTATION_ROLES);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    if (!current.languages.some((language) => language.id === body.languageId)) {
      reply.code(404);
      return {
        error: `Language not found: ${body.languageId}`,
        i18nKey: "errors.languageNotFound"
      };
    }

    if (body.noteId && !current.notes.some((note) => note.id === body.noteId && note.languageId === body.languageId)) {
      reply.code(400);
      return {
        error: `Note not found for language: ${body.noteId}`,
        i18nKey: "elderWs.errNoteNotFoundForLanguage"
      };
    }

    if (body.passageId && !current.corpus.some((passage) => passage.id === body.passageId && passage.languageId === body.languageId)) {
      reply.code(400);
      return {
        error: `Passage not found for language: ${body.passageId}`,
        i18nKey: "elderWs.errPassageNotFoundForLanguage"
      };
    }

    let correction: ElderCorrection | undefined;
    await updateState((state) => {
      const proposedAt = new Date().toISOString();
      correction = {
        id: `elder-correction-${body.languageId}-${state.elderCorrections.length + 1}-${proposedAt}`,
        languageId: body.languageId,
        noteId: body.noteId,
        passageId: body.passageId,
        correction: body.correction,
        rationale: body.rationale,
        severity: body.severity,
        contextText: body.contextText,
        status: "pending_review",
        proposedBy: actor.id,
        proposedAt,
        reviewedBy: null,
        reviewedAt: null
      };

      return appendAuditEvent({
        ...state,
        elderCorrections: [...state.elderCorrections, correction as ElderCorrection]
      }, {
        actor,
        at: proposedAt,
        action: "elder_correction.created",
        entityType: "elder_correction",
        entityId: correction.id,
        languageId: correction.languageId,
        summary: "Submitted elder correction for review.",
        metadata: {
          severity: correction.severity,
          hasNoteTarget: correction.noteId !== undefined,
          hasPassageTarget: correction.passageId !== undefined
        }
      });
    });

    reply.code(201);
    return correction;
  });

  app.patch("/elder/corrections/:correctionId/review", async (request, reply) => {
    const body = parseElderCorrectionReviewBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return {
        error: "Invalid elder correction review body",
        i18nKey: "elderWs.errInvalidReviewBody"
      };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ELDER_CORRECTION_MUTATION_ROLES);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    const { correctionId } = request.params as { correctionId: string };
    const existingCorrection = current.elderCorrections.find((correction) => correction.id === correctionId);
    if (!existingCorrection) {
      reply.code(404);
      return {
        error: `Elder correction not found: ${correctionId}`,
        i18nKey: "elderWs.errCorrectionNotFound"
      };
    }

    if (existingCorrection.status !== "pending_review") {
      reply.code(409);
      return {
        error: `Elder correction is no longer pending review: ${correctionId}`,
        i18nKey: "elderWs.errCorrectionNotPending"
      };
    }

    let reviewedCorrection: ElderCorrection | undefined;
    await updateState((state) => {
      const reviewedAt = new Date().toISOString();
      const elderCorrections = state.elderCorrections.map((correction) => {
        if (correction.id !== correctionId) return correction;
        reviewedCorrection = {
          ...correction,
          status: body.status,
          reviewedBy: actor.id,
          reviewedAt
        };
        return reviewedCorrection;
      });

      return appendAuditEvent({
        ...state,
        elderCorrections
      }, {
        actor,
        at: reviewedAt,
        action: "elder_correction.reviewed",
        entityType: "elder_correction",
        entityId: correctionId,
        languageId: reviewedCorrection?.languageId ?? null,
        summary: `Marked elder correction ${body.status}.`,
        metadata: {
          status: body.status,
          severity: reviewedCorrection?.severity ?? "unknown"
        }
      });
    });

    return reviewedCorrection;
  });

  app.patch("/elder/corrections/:correctionId/apply", async (request, reply) => {
    const body = parseElderCorrectionApplyBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return {
        error: "Invalid elder correction apply body",
        i18nKey: "elderWs.errInvalidApplyBody"
      };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ELDER_CORRECTION_MUTATION_ROLES);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    const { correctionId } = request.params as { correctionId: string };
    const existingCorrection = current.elderCorrections.find((correction) => correction.id === correctionId);
    if (!existingCorrection) {
      reply.code(404);
      return {
        error: `Elder correction not found: ${correctionId}`,
        i18nKey: "elderWs.errCorrectionNotFound"
      };
    }

    if (existingCorrection.status !== "accepted") {
      reply.code(409);
      return {
        error: `Elder correction must be accepted before apply: ${correctionId}`,
        i18nKey: "elderWs.errCorrectionMustBeAccepted"
      };
    }

    if (!existingCorrection.noteId) {
      reply.code(400);
      return {
        error: `Elder correction is not linked to a note: ${correctionId}`,
        i18nKey: "elderWs.errCorrectionNotLinkedToNote"
      };
    }

    const linkedNoteId = existingCorrection.noteId;
    const existingNote = current.notes.find(
      (note) => note.id === linkedNoteId && note.languageId === existingCorrection.languageId
    );
    if (!existingNote) {
      reply.code(400);
      return {
        error: `Note not found for correction: ${existingCorrection.noteId}`,
        i18nKey: "elderWs.errNoteNotFoundForCorrection"
      };
    }

    let appliedCorrection: ElderCorrection | undefined;
    let appliedNote: Note | undefined;
    await updateState((state) => {
      const appliedAt = new Date().toISOString();
      const summary = `Applied elder correction ${correctionId}.`;
      const elderCorrections = state.elderCorrections.map((correction) => {
        if (correction.id !== correctionId) return correction;
        appliedCorrection = {
          ...correction,
          status: "applied"
        };
        return appliedCorrection;
      });
      const notes = state.notes.map((note) => {
        if (note.id !== linkedNoteId) return note;
        appliedNote = {
          ...note,
          explanation: body.explanation,
          status: "under_review",
          reviewer: {
            lastReviewedBy: actor.id,
            lastReviewedAt: appliedAt,
            comments: [...note.reviewer.comments, summary]
          },
          editHistory: [
            ...note.editHistory,
            {
              at: appliedAt,
              by: actor.id,
              action: "applied_correction",
              summary
            }
          ]
        };
        return appliedNote;
      });

      return appendAuditEvents({
        ...state,
        elderCorrections,
        notes
      }, [
        {
          actor,
          at: appliedAt,
          action: "elder_correction.applied",
          entityType: "elder_correction",
          entityId: correctionId,
          languageId: existingCorrection.languageId,
          summary: `Applied elder correction ${correctionId}.`,
          metadata: {
            noteId: linkedNoteId,
            severity: existingCorrection.severity
          }
        },
        {
          actor,
          at: appliedAt,
          action: "note.elder_correction_applied",
          entityType: "note",
          entityId: linkedNoteId,
          languageId: existingCorrection.languageId,
          summary,
          metadata: {
            correctionId,
            status: "under_review"
          }
        }
      ]);
    });

    return {
      correction: appliedCorrection,
      note: toPublicNote(appliedNote as Note)
    };
  });
}
