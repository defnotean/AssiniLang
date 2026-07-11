import { z } from "zod";
import {
  languageSchema,
  corpusPassageSchema,
  noteSchema,
  evaluationRunSchema,
  userSchema,
  reviewDispositionNoteStatusSet,
  isReviewPolicyAssignableRole,
  isElderCorrectionMutationRole,
  LOCAL_PROTOTYPE_USERS,
  elderCorrectionSchema,
  reviewApprovalSchema,
  reviewDispositionSchema
} from "./schemaDomains.js";
import { isBlankPersistedValue, addParseablePersistedDateIssue } from "./schemaIntegrityCore.js";

export function addEvaluationRunIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    evaluationRuns: Array<z.infer<typeof evaluationRunSchema>>;
  }
) {
  const languageIds = new Set(state.languages.map((language) => language.id));

  for (const run of state.evaluationRuns) {
    if (isBlankPersistedValue(run.summary)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Evaluation run summary must not be blank",
        path: ["evaluationRuns", run.id]
      });
    }

    if (isBlankPersistedValue(run.systemVersion)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Evaluation run systemVersion must not be blank",
        path: ["evaluationRuns", run.id]
      });
    }

    if (isBlankPersistedValue(run.fixtureVersion)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Evaluation run fixtureVersion must not be blank",
        path: ["evaluationRuns", run.id]
      });
    }

    addParseablePersistedDateIssue(context, "evaluationRuns", run.id, "Evaluation run createdAt", run.createdAt);

    if (isBlankPersistedValue(run.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Evaluation run languageId must not be blank",
        path: ["evaluationRuns", run.id]
      });
    } else if (!languageIds.has(run.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Evaluation run references missing language: ${run.languageId}`,
        path: ["evaluationRuns", run.id]
      });
    }

    for (const category of Object.keys(run.scores)) {
      if (isBlankPersistedValue(category)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Evaluation score category must not be blank",
          path: ["evaluationRuns", run.id]
        });
      }
    }

    for (const failure of run.failures) {
      if (isBlankPersistedValue(failure.category)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Evaluation failure category must not be blank",
          path: ["evaluationRuns", run.id]
        });
      }

      if (isBlankPersistedValue(failure.itemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Evaluation failure itemId must not be blank",
          path: ["evaluationRuns", run.id]
        });
      }

      if (isBlankPersistedValue(failure.message)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Evaluation failure message must not be blank",
          path: ["evaluationRuns", run.id]
        });
      }

      if (isBlankPersistedValue(failure.languageId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Evaluation failure languageId must not be blank",
          path: ["evaluationRuns", run.id]
        });
      } else if (failure.languageId !== run.languageId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Evaluation failure language ${failure.languageId} does not match run language ${run.languageId}`,
          path: ["evaluationRuns", run.id]
        });
      }
    }
  }
}

export function addReviewApprovalIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    notes: Array<z.infer<typeof noteSchema>>;
    users: Array<z.infer<typeof userSchema>>;
    reviewApprovals: Array<z.infer<typeof reviewApprovalSchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const usersById = new Map(users.map((user) => [user.id, user]));
  const notesById = new Map(state.notes.map((note) => [note.id, note]));

  for (const approval of state.reviewApprovals) {
    addParseablePersistedDateIssue(
      context,
      "reviewApprovals",
      approval.id,
      "Review approval approvedAt",
      approval.approvedAt
    );

    if (isBlankPersistedValue(approval.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review approval languageId must not be blank",
        path: ["reviewApprovals", approval.id]
      });
    }

    if (isBlankPersistedValue(approval.noteId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review approval noteId must not be blank",
        path: ["reviewApprovals", approval.id]
      });
    }

    if (isBlankPersistedValue(approval.reviewerId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review approval reviewerId must not be blank",
        path: ["reviewApprovals", approval.id]
      });
    }

    const note = notesById.get(approval.noteId);
    if (!note) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review approval references missing note: ${approval.noteId}`,
        path: ["reviewApprovals", approval.id]
      });
    } else if (approval.languageId !== note.languageId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review approval language ${approval.languageId} does not match note ${approval.noteId} language ${note.languageId}`,
        path: ["reviewApprovals", approval.id]
      });
    } else if (note.status !== "under_review" && note.status !== "approved") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review approval note ${approval.noteId} must be under_review or approved, found ${note.status}`,
        path: ["reviewApprovals", approval.id]
      });
    }

    const reviewer = usersById.get(approval.reviewerId);
    if (!reviewer) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review approval references unknown reviewer: ${approval.reviewerId}`,
        path: ["reviewApprovals", approval.id]
      });
      continue;
    }

    if (!isReviewPolicyAssignableRole(reviewer.role)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review approval reviewer is not assignable: ${approval.reviewerId}`,
        path: ["reviewApprovals", approval.id]
      });
    }
  }
}

export function addReviewDispositionIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    notes: Array<z.infer<typeof noteSchema>>;
    users: Array<z.infer<typeof userSchema>>;
    reviewDispositions: Array<z.infer<typeof reviewDispositionSchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const usersById = new Map(users.map((user) => [user.id, user]));
  const notesById = new Map(state.notes.map((note) => [note.id, note]));
  const openDispositionKeys = new Set<string>();

  const addAssignableUserIssue = (userId: string, label: "assignee" | "opener" | "resolver", dispositionId: string) => {
    if (isBlankPersistedValue(userId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review disposition ${label} must not be blank`,
        path: ["reviewDispositions", dispositionId]
      });
      return;
    }

    const user = usersById.get(userId);
    if (!user || !isReviewPolicyAssignableRole(user.role)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review disposition ${label} is not assignable: ${userId}`,
        path: ["reviewDispositions", dispositionId]
      });
    }
  };

  for (const disposition of state.reviewDispositions) {
    if (isBlankPersistedValue(disposition.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review disposition languageId must not be blank",
        path: ["reviewDispositions", disposition.id]
      });
    }

    if (isBlankPersistedValue(disposition.noteId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review disposition noteId must not be blank",
        path: ["reviewDispositions", disposition.id]
      });
    }

    const note = notesById.get(disposition.noteId);
    if (!note) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review disposition references missing note: ${disposition.noteId}`,
        path: ["reviewDispositions", disposition.id]
      });
    } else if (disposition.languageId !== note.languageId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Review disposition language ${disposition.languageId} does not match note ${disposition.noteId} language ${note.languageId}`,
        path: ["reviewDispositions", disposition.id]
      });
    } else if (disposition.status === "open" && !reviewDispositionNoteStatusSet.has(note.status)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Open review disposition note ${disposition.noteId} must have a disposition status, found ${note.status}`,
        path: ["reviewDispositions", disposition.id]
      });
    }

    addParseablePersistedDateIssue(
      context,
      "reviewDispositions",
      disposition.id,
      "Review disposition dueAt",
      disposition.dueAt
    );
    addParseablePersistedDateIssue(
      context,
      "reviewDispositions",
      disposition.id,
      "Review disposition openedAt",
      disposition.openedAt
    );
    addParseablePersistedDateIssue(
      context,
      "reviewDispositions",
      disposition.id,
      "Review disposition resolvedAt",
      disposition.resolvedAt
    );

    if (disposition.reason.trim().length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review disposition reason must not be blank",
        path: ["reviewDispositions", disposition.id]
      });
    }

    addAssignableUserIssue(disposition.assignedTo, "assignee", disposition.id);
    addAssignableUserIssue(disposition.openedBy, "opener", disposition.id);

    if (disposition.status === "open") {
      const openKey = `${disposition.languageId}/${disposition.noteId}/${disposition.disposition}`;
      if (openDispositionKeys.has(openKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate open review disposition for language/note/disposition: ${openKey}`,
          path: ["reviewDispositions", disposition.id]
        });
      }
      openDispositionKeys.add(openKey);

      if (
        disposition.resolvedAt !== null ||
        disposition.resolvedBy !== null ||
        disposition.resolutionSummary !== null
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Open review disposition cannot have resolution fields",
          path: ["reviewDispositions", disposition.id]
        });
      }
    }

    if (disposition.status === "resolved") {
      if (
        disposition.resolvedAt === null ||
        disposition.resolvedBy === null ||
        disposition.resolutionSummary === null
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Resolved review disposition requires resolvedAt, resolvedBy, and resolutionSummary",
          path: ["reviewDispositions", disposition.id]
        });
      }

      if (disposition.resolutionSummary !== null && disposition.resolutionSummary.trim().length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Review disposition resolutionSummary must not be blank",
          path: ["reviewDispositions", disposition.id]
        });
      }

      const openedAtTime = Date.parse(disposition.openedAt);
      const resolvedAtTime = disposition.resolvedAt === null ? NaN : Date.parse(disposition.resolvedAt);
      if (!Number.isNaN(openedAtTime) && !Number.isNaN(resolvedAtTime) && resolvedAtTime < openedAtTime) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Review disposition resolvedAt cannot be before openedAt",
          path: ["reviewDispositions", disposition.id]
        });
      }

      if (disposition.resolvedBy !== null) {
        addAssignableUserIssue(disposition.resolvedBy, "resolver", disposition.id);
      }
    }
  }
}

export function addElderCorrectionIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    notes: Array<z.infer<typeof noteSchema>>;
    corpus: Array<z.infer<typeof corpusPassageSchema>>;
    users: Array<z.infer<typeof userSchema>>;
    elderCorrections: Array<z.infer<typeof elderCorrectionSchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const languageIds = new Set(state.languages.map((language) => language.id));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const notesById = new Map(state.notes.map((note) => [note.id, note]));
  const passagesById = new Map(state.corpus.map((passage) => [passage.id, passage]));

  const addAllowedActorIssue = (userId: string, label: "proposer" | "reviewer", correctionId: string) => {
    if (isBlankPersistedValue(userId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Elder correction ${label} must not be blank`,
        path: ["elderCorrections", correctionId]
      });
      return;
    }

    const user = usersById.get(userId);
    if (!user || !isElderCorrectionMutationRole(user.role)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Elder correction ${label} is not allowed: ${userId}`,
        path: ["elderCorrections", correctionId]
      });
    }
  };

  for (const correction of state.elderCorrections) {
    if (isBlankPersistedValue(correction.correction)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Elder correction text must not be blank",
        path: ["elderCorrections", correction.id]
      });
    }

    if (isBlankPersistedValue(correction.rationale)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Elder correction rationale must not be blank",
        path: ["elderCorrections", correction.id]
      });
    }

    if (correction.contextText !== undefined && isBlankPersistedValue(correction.contextText)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Elder correction contextText must not be blank",
        path: ["elderCorrections", correction.id]
      });
    }

    if (isBlankPersistedValue(correction.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Elder correction languageId must not be blank",
        path: ["elderCorrections", correction.id]
      });
    }

    if (!languageIds.has(correction.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Elder correction references missing language: ${correction.languageId}`,
        path: ["elderCorrections", correction.id]
      });
    }

    if (correction.noteId !== undefined) {
      if (isBlankPersistedValue(correction.noteId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Elder correction noteId must not be blank",
          path: ["elderCorrections", correction.id]
        });
      }

      const note = notesById.get(correction.noteId);
      if (!note) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Elder correction references missing note: ${correction.noteId}`,
          path: ["elderCorrections", correction.id]
        });
      } else if (correction.languageId !== note.languageId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Elder correction language ${correction.languageId} does not match note ${correction.noteId} language ${note.languageId}`,
          path: ["elderCorrections", correction.id]
        });
      }
    }

    if (correction.passageId !== undefined) {
      if (isBlankPersistedValue(correction.passageId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Elder correction passageId must not be blank",
          path: ["elderCorrections", correction.id]
        });
      }

      const passage = passagesById.get(correction.passageId);
      if (!passage) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Elder correction references missing passage: ${correction.passageId}`,
          path: ["elderCorrections", correction.id]
        });
      } else if (correction.languageId !== passage.languageId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Elder correction language ${correction.languageId} does not match passage ${correction.passageId} language ${passage.languageId}`,
          path: ["elderCorrections", correction.id]
        });
      }
    }

    addAllowedActorIssue(correction.proposedBy, "proposer", correction.id);
    addParseablePersistedDateIssue(
      context,
      "elderCorrections",
      correction.id,
      "Elder correction proposedAt",
      correction.proposedAt
    );

    if (correction.status === "pending_review") {
      if (correction.reviewedBy !== null || correction.reviewedAt !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pending elder correction cannot have review attribution",
          path: ["elderCorrections", correction.id]
        });
      }
      continue;
    }

    if (correction.reviewedBy === null || correction.reviewedAt === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reviewed elder correction requires reviewedBy and reviewedAt",
        path: ["elderCorrections", correction.id]
      });
    }

    if (correction.reviewedBy !== null) {
      addAllowedActorIssue(correction.reviewedBy, "reviewer", correction.id);
    }

    addParseablePersistedDateIssue(
      context,
      "elderCorrections",
      correction.id,
      "Elder correction reviewedAt",
      correction.reviewedAt
    );

    if (
      correction.reviewedAt !== null &&
      !Number.isNaN(Date.parse(correction.proposedAt)) &&
      !Number.isNaN(Date.parse(correction.reviewedAt)) &&
      Date.parse(correction.reviewedAt) < Date.parse(correction.proposedAt)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Elder correction reviewedAt cannot be before proposedAt",
        path: ["elderCorrections", correction.id]
      });
    }

    if (correction.status === "applied" && correction.noteId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Applied elder correction must reference a note",
        path: ["elderCorrections", correction.id]
      });
    }
  }
}

export function duplicateReviewApprovalKey(
  approvals: Array<Pick<z.infer<typeof reviewApprovalSchema>, "languageId" | "noteId" | "reviewerId">>
): string | undefined {
  const seen = new Set<string>();
  for (const approval of approvals) {
    const key = `${approval.languageId}/${approval.noteId}/${approval.reviewerId}`;
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return undefined;
}
