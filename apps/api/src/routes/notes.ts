import type { FastifyInstance } from "fastify";
import {
  isReviewPolicyAssignableRole,
  noteStatusSchema,
  type AppState,
  type Note,
  type ReviewApproval,
  type ReviewDisposition,
  type ReviewPolicy,
  type User
} from "@assini/db";
import { toPublicNote, toPublicNotes } from "../publicLanguageViews.js";
import {
  appendAuditEvents,
  requireActor,
  usersForState,
  type AuditEventDraft
} from "../routeHelpers.js";
import type { RouteContext } from "./context.js";

type ReviewBody = Partial<Pick<Note, "status" | "explanation">> & {
  reviewerComment?: string;
  dispositionAssigneeId?: string;
  dispositionDueAt?: string;
};
type ReviewDispositionStatus = Extract<Note["status"], "contested" | "rejected" | "deferred" | "escalated">;

const REVIEW_DISPOSITION_STATUSES: readonly ReviewDispositionStatus[] = ["contested", "rejected", "deferred", "escalated"];

function noteExplanationValidationError(explanation: string | undefined): string | undefined {
  if (explanation === undefined) return undefined;

  const wordCount = explanation.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0;
  if (explanation.length < 24 || wordCount < 4) {
    return "Note explanation edits require a substantive explanation.";
  }

  return undefined;
}

function reviewPolicyEligibleReviewerIds(state: AppState, policy: ReviewPolicy): Set<string> {
  if (policy.requiresAssignedReviewer) {
    return new Set(policy.assignedReviewerIds);
  }

  return new Set(
    usersForState(state)
      .filter((user) => isReviewPolicyAssignableRole(user.role))
      .map((user) => user.id)
  );
}

function parseReviewBody(input: unknown): ReviewBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const review: ReviewBody = {};
  let hasReviewField = false;

  if ("status" in body) {
    hasReviewField = true;
    const status = noteStatusSchema.safeParse(body.status);
    if (!status.success) return undefined;
    review.status = status.data;
  }

  if ("explanation" in body) {
    hasReviewField = true;
    if (typeof body.explanation !== "string") return undefined;
    const explanation = body.explanation.trim().replace(/\s+/g, " ");
    if (explanation.length === 0) return undefined;
    review.explanation = explanation;
  }

  if ("reviewerComment" in body) {
    hasReviewField = true;
    if (typeof body.reviewerComment !== "string") return undefined;
    const reviewerComment = body.reviewerComment.trim();
    if (reviewerComment.length > 0) {
      review.reviewerComment = reviewerComment;
    }
  }

  if ("dispositionAssigneeId" in body) {
    if (typeof body.dispositionAssigneeId !== "string") return undefined;
    const dispositionAssigneeId = body.dispositionAssigneeId.trim();
    if (dispositionAssigneeId.length === 0) return undefined;
    review.dispositionAssigneeId = dispositionAssigneeId;
  }

  if ("dispositionDueAt" in body) {
    if (typeof body.dispositionDueAt !== "string") return undefined;
    const dispositionDueAt = body.dispositionDueAt.trim();
    if (dispositionDueAt.length === 0) return undefined;
    review.dispositionDueAt = dispositionDueAt;
  }

  return hasReviewField && Object.keys(review).length > 0 ? review : undefined;
}

function isReviewDispositionStatus(status: Note["status"] | undefined): status is ReviewDispositionStatus {
  return status !== undefined && REVIEW_DISPOSITION_STATUSES.includes(status as ReviewDispositionStatus);
}

function reviewDispositionValidationError(state: AppState, body: ReviewBody, actor: User): string | undefined {
  const assignedTo = body.dispositionAssigneeId ?? actor.id;
  const assignee = usersForState(state).find((user) => user.id === assignedTo);
  if (!assignee || !isReviewPolicyAssignableRole(assignee.role)) {
    return `Review disposition assignee is not assignable: ${assignedTo}`;
  }

  if (body.dispositionDueAt && Number.isNaN(Date.parse(body.dispositionDueAt))) {
    return "Review disposition due date must be parseable";
  }

  return undefined;
}

export function registerNoteRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, updateState, checkRateLimit, authToken, prototypeSessions } = ctx;

  app.get("/languages/:languageId/notes", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }
    return toPublicNotes(state.notes.filter((note) => note.languageId === languageId));
  });

  app.patch("/notes/:noteId/review", async (request, reply) => {
    const { noteId } = request.params as { noteId: string };
    const body = parseReviewBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return {
        error: "Invalid review body",
        i18nKey: "errors.invalidReviewBody"
      };
    }

    if (isReviewDispositionStatus(body.status) && !body.reviewerComment) {
      reply.code(400);
      return {
        error: "Review dispositions require reviewerComment",
        i18nKey: "errors.reviewDispositionRequiresComment"
      };
    }

    const explanationValidationError = noteExplanationValidationError(body.explanation);
    if (explanationValidationError) {
      reply.code(400);
      return { error: explanationValidationError };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "lead", "admin", "elder"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    const rateLimited = checkRateLimit(request, reply, actor);
    if (rateLimited) return rateLimited;

    if (isReviewDispositionStatus(body.status)) {
      const validationError = reviewDispositionValidationError(current, body, actor);
      if (validationError) {
        reply.code(400);
        return { error: validationError };
      }
    }

    let noteMissing = false;
    let nextNote: Note | undefined;
    let policyForbiddenMessage: string | undefined;

    await updateState((state) => {
      const existing = state.notes.find((note) => note.id === noteId);

      if (!existing) {
        noteMissing = true;
        return state;
      }

      const reviewedAt = new Date().toISOString();
      const requestedStatus = body.status ?? existing.status;
      const policy = state.reviewPolicies.find((item) => item.languageId === existing.languageId);
      let nextStatus = requestedStatus;
      let reviewApprovals = state.reviewApprovals;
      let approvalCount: number | undefined;
      let approvalThreshold: number | undefined;
      const disposition = isReviewDispositionStatus(requestedStatus) ? requestedStatus : undefined;
      let reviewDisposition: ReviewDisposition | undefined;
      let reviewDispositionCreated = false;

      if (requestedStatus === "approved" && policy) {
        if (policy.requiresAssignedReviewer && !policy.assignedReviewerIds.includes(actor.id)) {
          policyForbiddenMessage = `Reviewer is not assigned to approve notes for language: ${existing.languageId}`;
          return state;
        }

        const alreadyApproved = reviewApprovals.some((approval) => (
          approval.languageId === existing.languageId
          && approval.noteId === noteId
          && approval.reviewerId === actor.id
        ));
        if (!alreadyApproved) {
          const approval: ReviewApproval = {
            id: `review-approval-${existing.languageId}-${noteId}-${actor.id}-${reviewedAt}`,
            languageId: existing.languageId,
            noteId,
            reviewerId: actor.id,
            approvedAt: reviewedAt
          };
          reviewApprovals = [...reviewApprovals, approval];
        }

        const eligibleReviewerIds = reviewPolicyEligibleReviewerIds(state, policy);
        approvalCount = new Set(
          reviewApprovals
            .filter((approval) => approval.languageId === existing.languageId && approval.noteId === noteId)
            .filter((approval) => eligibleReviewerIds.has(approval.reviewerId))
            .map((approval) => approval.reviewerId)
        ).size;
        approvalThreshold = policy.approvalThreshold;
        nextStatus = approvalCount >= approvalThreshold ? "approved" : "under_review";
      } else if (disposition) {
        reviewApprovals = reviewApprovals.filter((approval) => (
          approval.languageId !== existing.languageId || approval.noteId !== noteId
        ));

        const existingOpenDisposition = state.reviewDispositions.find((item) => (
          item.languageId === existing.languageId
          && item.noteId === noteId
          && item.disposition === disposition
          && item.status === "open"
        ));

        reviewDisposition = existingOpenDisposition
          ? {
              ...existingOpenDisposition,
              reason: body.reviewerComment as string,
              assignedTo: body.dispositionAssigneeId ?? actor.id,
              dueAt: body.dispositionDueAt ?? null
            }
          : {
              id: `review-disposition-${existing.languageId}-${noteId}-${state.reviewDispositions.length + 1}-${reviewedAt}`,
              languageId: existing.languageId,
              noteId,
              disposition,
              status: "open",
              reason: body.reviewerComment as string,
              assignedTo: body.dispositionAssigneeId ?? actor.id,
              dueAt: body.dispositionDueAt ?? null,
              openedAt: reviewedAt,
              openedBy: actor.id,
              resolvedAt: null,
              resolvedBy: null,
              resolutionSummary: null
            };
        reviewDispositionCreated = !existingOpenDisposition;
      }

      nextNote = {
        ...existing,
        status: nextStatus,
        explanation: body.explanation ?? existing.explanation,
        reviewer: {
          lastReviewedBy: actor.id,
          lastReviewedAt: reviewedAt,
          comments: body.reviewerComment ? [...existing.reviewer.comments, body.reviewerComment] : existing.reviewer.comments
        },
        editHistory: [
          ...existing.editHistory,
          {
            at: reviewedAt,
            by: actor.id,
            action: "reviewed",
            summary: body.reviewerComment ?? `Status set to ${nextStatus}`
          }
        ]
      };

      const nextState = {
        ...state,
        notes: state.notes.map((note) => (note.id === noteId ? nextNote as Note : note)),
        reviewApprovals,
        reviewDispositions: reviewDisposition && reviewDispositionCreated
          ? [...state.reviewDispositions, reviewDisposition]
          : reviewDisposition
            ? state.reviewDispositions.map((item) => (item.id === reviewDisposition?.id ? reviewDisposition : item))
          : state.reviewDispositions
      };

      const noteReviewedDraft: AuditEventDraft = {
        actor,
        at: reviewedAt,
        action: "note.reviewed",
        entityType: "note",
        entityId: noteId,
        languageId: existing.languageId,
        summary: `Reviewed note ${noteId}.`,
        metadata: {
          requestedStatus,
          status: nextStatus,
          explanationChanged: body.explanation !== undefined,
          ...(disposition ? { disposition } : {}),
          ...(reviewDisposition ? { reviewDispositionId: reviewDisposition.id } : {}),
          ...(approvalCount !== undefined && approvalThreshold !== undefined
            ? { approvalCount, approvalThreshold }
            : {})
        }
      };
      const dispositionAuditDraft: AuditEventDraft[] = reviewDisposition
        ? [{
            actor,
            at: reviewedAt,
            action: reviewDispositionCreated ? "review_disposition.created" : "review_disposition.updated",
            entityType: "review_disposition",
            entityId: reviewDisposition.id,
            languageId: existing.languageId,
            summary: `${reviewDispositionCreated ? "Opened" : "Updated"} ${reviewDisposition.disposition} review disposition for ${noteId}.`,
            metadata: {
              noteId,
              disposition: reviewDisposition.disposition,
              assignedTo: reviewDisposition.assignedTo,
              dueAt: reviewDisposition.dueAt
            }
          }]
        : [];

      return appendAuditEvents(nextState, [noteReviewedDraft, ...dispositionAuditDraft]);
    });

    if (noteMissing) {
      reply.code(404);
      return { error: `Note not found: ${noteId}` };
    }

    if (policyForbiddenMessage) {
      reply.code(403);
      return { error: policyForbiddenMessage };
    }

    return toPublicNote(nextNote as Note);
  });
}
