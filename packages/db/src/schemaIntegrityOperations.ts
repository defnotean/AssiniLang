import { z } from "zod";
import {
  languageSchema,
  corpusPassageSchema,
  noteSchema,
  userSchema,
  isGovernanceApproverRole,
  LOCAL_PROTOTYPE_USERS,
  auditEventSchema,
  isAiSessionCreatorRole,
  aiSessionSchema,
  governanceRecordSchema
} from "./schemaDomains.js";
import { isBlankPersistedValue, addParseablePersistedDateIssue } from "./schemaIntegrityCore.js";
import { auditMetadataPrivacyIssue } from "./auditMetadataPrivacy.js";

export function addGovernanceIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    users: Array<z.infer<typeof userSchema>>;
    governance: Array<z.infer<typeof governanceRecordSchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const languageIds = new Set(state.languages.map((language) => language.id));
  const usersById = new Map(users.map((user) => [user.id, user]));

  for (const record of state.governance) {
    if (isBlankPersistedValue(record.content)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Governance record content must not be blank",
        path: ["governance", record.id]
      });
    }

    addParseablePersistedDateIssue(
      context,
      "governance",
      record.id,
      "Governance record effectiveDate",
      record.effectiveDate
    );

    if (isBlankPersistedValue(record.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Governance record languageId must not be blank",
        path: ["governance", record.id]
      });
    }

    if (!languageIds.has(record.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Governance record references missing language: ${record.languageId}`,
        path: ["governance", record.id]
      });
    }

    const approver = isBlankPersistedValue(record.approvedBy) ? undefined : usersById.get(record.approvedBy);
    if (isBlankPersistedValue(record.approvedBy)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Governance record approver must not be blank",
        path: ["governance", record.id]
      });
    } else if (!approver || !isGovernanceApproverRole(approver.role)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Governance record approver is not allowed: ${record.approvedBy}`,
        path: ["governance", record.id]
      });
    }
  }
}

export function addAuditEventIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    users: Array<z.infer<typeof userSchema>>;
    auditEvents: Array<z.infer<typeof auditEventSchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const languageIds = new Set(state.languages.map((language) => language.id));
  const usersById = new Map(users.map((user) => [user.id, user]));

  for (const event of state.auditEvents) {
    if (isBlankPersistedValue(event.action)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Audit event action must not be blank",
        path: ["auditEvents", event.id]
      });
    }

    if (isBlankPersistedValue(event.entityId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Audit event entityId must not be blank",
        path: ["auditEvents", event.id]
      });
    }

    if (isBlankPersistedValue(event.summary)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Audit event summary must not be blank",
        path: ["auditEvents", event.id]
      });
    }

    addParseablePersistedDateIssue(context, "auditEvents", event.id, "Audit event at", event.at);

    const privacyIssue = auditMetadataPrivacyIssue(event.metadata);
    if (privacyIssue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Audit event metadata contains ${privacyIssue}`,
        path: ["auditEvents", event.id]
      });
    }

    if (event.languageId !== null && isBlankPersistedValue(event.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Audit event languageId must not be blank",
        path: ["auditEvents", event.id]
      });
    }

    if (event.languageId !== null && !languageIds.has(event.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Audit event references missing language: ${event.languageId}`,
        path: ["auditEvents", event.id]
      });
    }

    const actor = isBlankPersistedValue(event.actorId) ? undefined : usersById.get(event.actorId);
    if (isBlankPersistedValue(event.actorId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Audit event actorId must not be blank",
        path: ["auditEvents", event.id]
      });
      continue;
    }

    if (!actor) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Audit event references unknown actor: ${event.actorId}`,
        path: ["auditEvents", event.id]
      });
      continue;
    }

    if (event.actorRole !== actor.role) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Audit event actorRole ${event.actorRole} does not match actor ${event.actorId} role ${actor.role}`,
        path: ["auditEvents", event.id]
      });
    }
  }
}

export function addAiSessionIntegrityIssues(
  context: z.RefinementCtx,
  state: {
    languages: Array<z.infer<typeof languageSchema>>;
    notes: Array<z.infer<typeof noteSchema>>;
    corpus: Array<z.infer<typeof corpusPassageSchema>>;
    users: Array<z.infer<typeof userSchema>>;
    aiSessions: Array<z.infer<typeof aiSessionSchema>>;
  }
) {
  const users = state.users.length > 0 ? state.users : LOCAL_PROTOTYPE_USERS;
  const languageIds = new Set(state.languages.map((language) => language.id));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const notesById = new Map(state.notes.map((note) => [note.id, note]));
  const passagesById = new Map(state.corpus.map((passage) => [passage.id, passage]));

  for (const session of state.aiSessions) {
    if (isBlankPersistedValue(session.thinkingSummary)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AI session thinkingSummary must not be blank",
        path: ["aiSessions", session.id]
      });
    }

    for (const redaction of session.privacy.redactions) {
      if (isBlankPersistedValue(redaction)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AI session privacy redaction must not be blank",
          path: ["aiSessions", session.id]
        });
      }
    }

    if (isBlankPersistedValue(session.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AI session languageId must not be blank",
        path: ["aiSessions", session.id]
      });
    }

    if (!languageIds.has(session.languageId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `AI session references missing language: ${session.languageId}`,
        path: ["aiSessions", session.id]
      });
    }

    const creator = isBlankPersistedValue(session.createdBy) ? undefined : usersById.get(session.createdBy);
    if (isBlankPersistedValue(session.createdBy)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AI session creator must not be blank",
        path: ["aiSessions", session.id]
      });
    } else if (!creator || !isAiSessionCreatorRole(session.mode, creator.role)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `AI session creator is not allowed for mode ${session.mode}: ${session.createdBy}`,
        path: ["aiSessions", session.id]
      });
    }

    addParseablePersistedDateIssue(context, "aiSessions", session.id, "AI session createdAt", session.createdAt);
    addParseablePersistedDateIssue(context, "aiSessions", session.id, "AI session updatedAt", session.updatedAt);
    const createdAtTime = Date.parse(session.createdAt);
    const updatedAtTime = Date.parse(session.updatedAt);
    const sessionTimelineIsParseable = !Number.isNaN(createdAtTime) && !Number.isNaN(updatedAtTime);

    if (sessionTimelineIsParseable && updatedAtTime < createdAtTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AI session updatedAt cannot be before createdAt",
        path: ["aiSessions", session.id]
      });
    }

    for (const message of session.messages) {
      if (isBlankPersistedValue(message.content)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session message content must not be blank: ${message.id}`,
          path: ["aiSessions", session.id]
        });
      }

      addParseablePersistedDateIssue(
        context,
        "aiSessions",
        session.id,
        "AI session message createdAt",
        message.createdAt
      );
      const messageCreatedAtTime = Date.parse(message.createdAt);
      if (!sessionTimelineIsParseable || Number.isNaN(messageCreatedAtTime)) continue;

      if (messageCreatedAtTime < createdAtTime) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session message ${message.id} cannot be before session createdAt`,
          path: ["aiSessions", session.id]
        });
      }

      if (messageCreatedAtTime > updatedAtTime) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session message ${message.id} cannot be after session updatedAt`,
          path: ["aiSessions", session.id]
        });
      }
    }

    for (const traceStep of session.trace) {
      if (isBlankPersistedValue(traceStep.label)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session trace label must not be blank: ${traceStep.id}`,
          path: ["aiSessions", session.id]
        });
      }

      if (isBlankPersistedValue(traceStep.summary)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session trace summary must not be blank: ${traceStep.id}`,
          path: ["aiSessions", session.id]
        });
      }

      for (const warning of traceStep.warnings) {
        if (isBlankPersistedValue(warning)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `AI session trace warning must not be blank: ${traceStep.id}`,
            path: ["aiSessions", session.id]
          });
        }
      }
    }

    for (const noteId of session.contextNoteIds) {
      if (isBlankPersistedValue(noteId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AI session contextNoteId must not be blank",
          path: ["aiSessions", session.id]
        });
        continue;
      }

      const note = notesById.get(noteId);
      if (!note) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session references missing context note: ${noteId}`,
          path: ["aiSessions", session.id]
        });
      } else if (note.languageId !== session.languageId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session context note ${noteId} language ${note.languageId} does not match session language ${session.languageId}`,
          path: ["aiSessions", session.id]
        });
      }
    }

    for (const passageId of session.contextPassageIds) {
      if (isBlankPersistedValue(passageId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AI session contextPassageId must not be blank",
          path: ["aiSessions", session.id]
        });
        continue;
      }

      const passage = passagesById.get(passageId);
      if (!passage) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session references missing context passage: ${passageId}`,
          path: ["aiSessions", session.id]
        });
      } else if (passage.languageId !== session.languageId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI session context passage ${passageId} language ${passage.languageId} does not match session language ${session.languageId}`,
          path: ["aiSessions", session.id]
        });
      }
    }
  }
}
