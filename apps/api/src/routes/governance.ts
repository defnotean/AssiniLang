import type { FastifyInstance } from "fastify";
import {
  GOVERNANCE_APPROVER_ROLES,
  isReviewPolicyAssignableRole,
  isReviewPolicyUpdaterRole,
  REVIEW_POLICY_UPDATER_ROLES,
  type AppState,
  type GovernanceRecord,
  type ReviewDisposition,
  type ReviewPolicy,
  type User
} from "@assini/db";
import { appendAuditEvent, parseStringArray, requireActor, usersForState } from "../routeHelpers.js";
import type { RouteContext } from "./context.js";

type GovernanceBody = Pick<GovernanceRecord, "languageId" | "policyType" | "content" | "effectiveDate">;

type ReviewPolicyBody = Pick<ReviewPolicy, "assignedReviewerIds" | "approvalThreshold" | "requiresAssignedReviewer">;

type ReviewDispositionResolveBody = {
  resolutionSummary: string;
};

function parseGovernanceBody(input: unknown): GovernanceBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const languageId = typeof body.languageId === "string" ? body.languageId.trim() : "";
  const policyType = body.policyType === "consent" || body.policyType === "access" || body.policyType === "generation"
    ? body.policyType
    : undefined;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const effectiveDate = typeof body.effectiveDate === "string" ? body.effectiveDate.trim() : "";

  if (!languageId || !policyType || !content || !effectiveDate || Number.isNaN(Date.parse(effectiveDate))) {
    return undefined;
  }

  return { languageId, policyType, content, effectiveDate };
}

function parseReviewPolicyBody(input: unknown): ReviewPolicyBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const assignedReviewerIds = parseStringArray(body.assignedReviewerIds);
  const approvalThreshold = typeof body.approvalThreshold === "number" && Number.isInteger(body.approvalThreshold)
    ? body.approvalThreshold
    : undefined;
  const requiresAssignedReviewer = body.requiresAssignedReviewer === undefined
    ? true
    : typeof body.requiresAssignedReviewer === "boolean"
      ? body.requiresAssignedReviewer
      : undefined;

  if (!assignedReviewerIds || assignedReviewerIds.length === 0 || !approvalThreshold || approvalThreshold < 1 || requiresAssignedReviewer === undefined) {
    return undefined;
  }

  return { assignedReviewerIds, approvalThreshold, requiresAssignedReviewer };
}

function reviewPolicyValidationError(state: AppState, body: ReviewPolicyBody): string | undefined {
  const assignableUsers = new Map(usersForState(state).map((user) => [user.id, user]));
  const uniqueReviewerIds = new Set(body.assignedReviewerIds);

  if (uniqueReviewerIds.size !== body.assignedReviewerIds.length) {
    return "Review policy assignedReviewerIds must be unique";
  }

  for (const reviewerId of body.assignedReviewerIds) {
    const reviewer = assignableUsers.get(reviewerId);
    if (!reviewer) {
      return `Review policy references unknown reviewer: ${reviewerId}`;
    }

    if (!isReviewPolicyAssignableRole(reviewer.role)) {
      return `Review policy reviewer is not assignable: ${reviewerId}`;
    }
  }

  if (body.requiresAssignedReviewer && body.approvalThreshold > body.assignedReviewerIds.length) {
    return "Review policy approvalThreshold cannot exceed assigned reviewers";
  }

  if (!body.requiresAssignedReviewer) {
    const assignableReviewerCount = [...assignableUsers.values()]
      .filter((user) => isReviewPolicyAssignableRole(user.role))
      .length;
    if (body.approvalThreshold > assignableReviewerCount) {
      return "Review policy approvalThreshold cannot exceed assignable reviewers";
    }
  }

  return undefined;
}

function reviewPolicyAuthorityActor(state: AppState, actor: User): User | undefined {
  if (isReviewPolicyUpdaterRole(actor.role)) return actor;
  return usersForState(state).find((user) => isReviewPolicyUpdaterRole(user.role));
}

function parseReviewDispositionResolveBody(input: unknown): ReviewDispositionResolveBody | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const body = input as Record<string, unknown>;
  const resolutionSummary = typeof body.resolutionSummary === "string" ? body.resolutionSummary.trim() : "";
  return resolutionSummary.length > 0 ? { resolutionSummary } : undefined;
}

export function registerGovernanceRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { readState, updateState, checkRateLimit, authToken, prototypeSessions } = ctx;

  app.get("/governance", async () => {
    const state = await readState();
    return state.governance;
  });

  app.get("/audit/events", async (request, reply) => {
    const query = request.query as { languageId?: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["lead", "admin", "programmer"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    if (query.languageId && !state.languages.some((language) => language.id === query.languageId)) {
      reply.code(404);
      return { error: `Language not found: ${query.languageId}` };
    }

    return query.languageId
      ? state.auditEvents.filter((event) => event.languageId === query.languageId)
      : state.auditEvents;
  });

  app.post("/governance", async (request, reply) => {
    const body = parseGovernanceBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid governance body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, GOVERNANCE_APPROVER_ROLES);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    if (!current.languages.some((language) => language.id === body.languageId)) {
      reply.code(404);
      return { error: `Language not found: ${body.languageId}` };
    }

    let record: GovernanceRecord | undefined;
    await updateState((state) => {
      const approvedAt = new Date().toISOString();
      record = {
        id: `governance-${body.languageId}-${body.policyType}-${state.governance.length + 1}-${approvedAt}`,
        languageId: body.languageId,
        policyType: body.policyType,
        content: body.content,
        effectiveDate: body.effectiveDate,
        approvedBy: actor.id
      };

      return appendAuditEvent({
        ...state,
        governance: [...state.governance, record as GovernanceRecord]
      }, {
        actor,
        at: approvedAt,
        action: "governance_record.created",
        entityType: "governance_record",
        entityId: record.id,
        languageId: body.languageId,
        summary: `Created ${body.policyType} governance policy record.`,
        metadata: {
          policyType: body.policyType,
          effectiveDate: body.effectiveDate
        }
      });
    });

    reply.code(201);
    return record;
  });

  app.get("/languages/:languageId/review-policy", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["reviewer", "elder", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    const policy = state.reviewPolicies.find((item) => item.languageId === languageId);
    if (!policy) {
      reply.code(404);
      return { error: `Review policy not found for language: ${languageId}` };
    }

    return policy;
  });

  app.put("/languages/:languageId/review-policy", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const body = parseReviewPolicyBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid review policy body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, REVIEW_POLICY_UPDATER_ROLES, ["reviewer"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };
    const policyAuthority = reviewPolicyAuthorityActor(current, actor);
    if (!policyAuthority) {
      reply.code(403);
      return { error: "Forbidden" };
    }

    if (!current.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    const validationError = reviewPolicyValidationError(current, body);
    if (validationError) {
      reply.code(400);
      return { error: validationError };
    }

    let policy: ReviewPolicy | undefined;
    await updateState((state) => {
      const updatedAt = new Date().toISOString();
      policy = {
        id: `review-policy-${languageId}`,
        languageId,
        assignedReviewerIds: body.assignedReviewerIds,
        approvalThreshold: body.approvalThreshold,
        requiresAssignedReviewer: body.requiresAssignedReviewer,
        updatedAt,
        updatedBy: policyAuthority.id
      };
      const existingPolicy = state.reviewPolicies.some((item) => item.languageId === languageId);
      const reviewPolicies = existingPolicy
        ? state.reviewPolicies.map((item) => (item.languageId === languageId ? policy as ReviewPolicy : item))
        : [...state.reviewPolicies, policy as ReviewPolicy];

      return appendAuditEvent({
        ...state,
        reviewPolicies
      }, {
        actor,
        at: updatedAt,
        action: "review_policy.upserted",
        entityType: "review_policy",
        entityId: policy.id,
        languageId,
        summary: `Updated review policy for ${languageId}.`,
        metadata: {
          assignedReviewerCount: policy.assignedReviewerIds.length,
          approvalThreshold: policy.approvalThreshold,
          requiresAssignedReviewer: policy.requiresAssignedReviewer
        }
      });
    });

    return policy;
  });

  app.get("/languages/:languageId/review-dispositions", async (request, reply) => {
    const { languageId } = request.params as { languageId: string };
    const state = await readState();
    const actor = requireActor(state, request, reply, authToken, prototypeSessions, ["reviewer", "elder", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };

    if (!state.languages.some((language) => language.id === languageId)) {
      reply.code(404);
      return { error: `Language not found: ${languageId}` };
    }

    return state.reviewDispositions.filter((disposition) => disposition.languageId === languageId);
  });

  app.patch("/review-dispositions/:dispositionId/resolve", async (request, reply) => {
    const { dispositionId } = request.params as { dispositionId: string };
    const body = parseReviewDispositionResolveBody(request.body ?? {});
    if (!body) {
      reply.code(400);
      return { error: "Invalid review disposition resolution body" };
    }

    const current = await readState();
    const actor = requireActor(current, request, reply, authToken, prototypeSessions, ["reviewer", "elder", "lead", "admin"]);
    if (!actor) return { error: reply.statusCode === 403 ? "Forbidden" : "Unauthorized" };
    if (!checkRateLimit(request, reply, actor)) return { error: "Rate limit exceeded" };

    let dispositionMissing = false;
    let dispositionAlreadyResolved = false;
    let dispositionForbidden = false;
    let nextDisposition: ReviewDisposition | undefined;

    await updateState((state) => {
      const existingDisposition = state.reviewDispositions.find((disposition) => disposition.id === dispositionId);
      if (!existingDisposition) {
        dispositionMissing = true;
        return state;
      }

      if (existingDisposition.status === "resolved") {
        dispositionAlreadyResolved = true;
        return state;
      }

      const canResolve = actor.role === "lead" || actor.role === "admin" || actor.id === existingDisposition.assignedTo;
      if (!canResolve) {
        dispositionForbidden = true;
        return state;
      }

      const resolvedAt = new Date().toISOString();
      nextDisposition = {
        ...existingDisposition,
        status: "resolved",
        resolvedAt,
        resolvedBy: actor.id,
        resolutionSummary: body.resolutionSummary
      };

      const linkedNote = state.notes.find((note) => note.id === existingDisposition.noteId);
      const nextNote = linkedNote
        ? {
            ...linkedNote,
            status: "under_review" as const,
            editHistory: [
              ...linkedNote.editHistory,
              {
                at: resolvedAt,
                by: actor.id,
                action: "disposition_resolved",
                summary: body.resolutionSummary
              }
            ]
          }
        : undefined;

      return appendAuditEvent({
        ...state,
        reviewDispositions: state.reviewDispositions.map((disposition) => (
          disposition.id === dispositionId ? nextDisposition as ReviewDisposition : disposition
        )),
        notes: nextNote
          ? state.notes.map((note) => (note.id === nextNote.id ? nextNote : note))
          : state.notes
      }, {
        actor,
        at: resolvedAt,
        action: "review_disposition.resolved",
        entityType: "review_disposition",
        entityId: dispositionId,
        languageId: existingDisposition.languageId,
        summary: `Resolved ${existingDisposition.disposition} review disposition for ${existingDisposition.noteId}.`,
        metadata: {
          noteId: existingDisposition.noteId,
          disposition: existingDisposition.disposition,
          noteStatus: nextNote?.status ?? null,
          resolvedBy: actor.id
        }
      });
    });

    if (dispositionMissing) {
      reply.code(404);
      return { error: `Review disposition not found: ${dispositionId}` };
    }

    if (dispositionAlreadyResolved) {
      reply.code(400);
      return { error: "Review disposition is already resolved" };
    }

    if (dispositionForbidden) {
      reply.code(403);
      return { error: "Forbidden" };
    }

    return nextDisposition;
  });
}
