import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptyState, JsonStore } from "./store";
import {
  aiSessionSchema,
  auditEventSchema,
  elderCorrectionSchema,
  LOCAL_PROTOTYPE_USERS,
  noteStatusSchema,
  parseAppState,
  reviewApprovalSchema,
  reviewDispositionSchema,
  reviewPolicySchema,
  type Note,
  type ReviewDisposition,
  userRoleSchema
} from "./schema";

function createTestNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    languageId: "avenik",
    topic: "syntax/test",
    explanation: "Synthetic note explanation.",
    examples: [],
    evidencePassageIds: [],
    evidenceCount: 0,
    confidence: "medium",
    status: "draft",
    reviewer: {
      lastReviewedBy: null,
      lastReviewedAt: null,
      comments: []
    },
    dialectScope: "synthetic-default",
    editHistory: [],
    ...overrides
  };
}

function createTestDisposition(overrides: Partial<ReviewDisposition> = {}): ReviewDisposition {
  return {
    id: "review-disposition-1",
    languageId: "avenik",
    noteId: "note-1",
    disposition: "escalated",
    status: "open",
    reason: "Escalate for lead review.",
    assignedTo: "lead-1",
    dueAt: "2026-06-20",
    openedAt: "2026-06-06T00:00:00.000Z",
    openedBy: "reviewer-1",
    resolvedAt: null,
    resolvedBy: null,
    resolutionSummary: null,
    ...overrides
  };
}

describe("JsonStore", () => {
  it("writes and reads a seeded state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const state = createEmptyState();
      state.languages.push({
        id: "test-lang",
        name: "Test Lang",
        typology: "isolating",
        description: "Synthetic test language.",
        orthography: "Latin test alphabet",
        status: "synthetic",
        fixtureSource: "unit-test"
      });

      await store.write(state);
      const loaded = await store.read();
      const raw = JSON.parse(await readFile(dbPath, "utf8"));

      expect(loaded.languages[0]?.id).toBe("test-lang");
      expect(raw.schemaVersion).toBe(7);
      expect(loaded.auditEvents).toEqual([]);
      expect(loaded.reviewPolicies).toEqual([]);
      expect(loaded.reviewApprovals).toEqual([]);
      expect(loaded.reviewDispositions).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("migrates legacy v1 state without note answer keys", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const legacyState = createEmptyState();
      legacyState.notes.push({
        id: "legacy-note",
        languageId: "legacy-language",
        topic: "legacy/topic",
        explanation: "Legacy answer key text.",
        examples: [],
        evidencePassageIds: ["legacy-corpus"],
        evidenceCount: 1,
        confidence: "medium",
        status: "draft",
        reviewer: {
          lastReviewedBy: null,
          lastReviewedAt: null,
          comments: []
        },
        dialectScope: "synthetic legacy",
        editHistory: []
      });

      const { noteAnswerKeys: _removed, ...legacyWithoutAnswerKeys } = legacyState;
      await writeFile(dbPath, `${JSON.stringify({ ...legacyWithoutAnswerKeys, schemaVersion: 1 })}\n`, "utf8");

      const loaded = await store.read();

      expect(loaded.schemaVersion).toBe(7);
      expect(loaded.notes).toHaveLength(1);
      expect(loaded.noteAnswerKeys).toHaveLength(1);
      expect(loaded.exerciseSubmissions).toEqual([]);
      expect(loaded.auditEvents).toEqual([]);
      expect(loaded.reviewPolicies).toEqual([]);
      expect(loaded.reviewApprovals).toEqual([]);
      expect(loaded.reviewDispositions).toEqual([]);
      expect(loaded.noteAnswerKeys[0]).toMatchObject({
        id: "legacy-note",
        topic: "legacy/topic",
        explanation: "Legacy answer key text.",
        status: "approved"
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("migrates v2 state with answer keys to empty exercise submissions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const v2State = createEmptyState();
      const { exerciseSubmissions: _removed, ...v2WithoutSubmissions } = v2State;
      await writeFile(dbPath, `${JSON.stringify({ ...v2WithoutSubmissions, schemaVersion: 2 })}\n`, "utf8");

      const loaded = await store.read();

      expect(loaded.schemaVersion).toBe(7);
      expect(loaded.exerciseSubmissions).toEqual([]);
      expect(loaded.auditEvents).toEqual([]);
      expect(loaded.reviewPolicies).toEqual([]);
      expect(loaded.reviewApprovals).toEqual([]);
      expect(loaded.reviewDispositions).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reports the database path when local JSON is corrupted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      await writeFile(dbPath, "{ not valid json", "utf8");

      await expect(store.read()).rejects.toThrow(`Failed to read local database at ${dbPath}:`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("migrates v4 state into empty audit and review-policy ledgers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const v4State = createEmptyState();
      const { auditEvents: _removed, ...v4WithoutAuditEvents } = v4State;
      await writeFile(dbPath, `${JSON.stringify({ ...v4WithoutAuditEvents, schemaVersion: 4 })}\n`, "utf8");

      const loaded = await store.read();

      expect(loaded.schemaVersion).toBe(7);
      expect(loaded.auditEvents).toEqual([]);
      expect(loaded.reviewPolicies).toEqual([]);
      expect(loaded.reviewApprovals).toEqual([]);
      expect(loaded.reviewDispositions).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("migrates v5 state into empty review-policy ledgers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const v5State = createEmptyState();
      const { reviewPolicies: _policies, reviewApprovals: _approvals, ...v5WithoutReviewPolicy } = v5State;
      await writeFile(dbPath, `${JSON.stringify({ ...v5WithoutReviewPolicy, schemaVersion: 5 })}\n`, "utf8");

      const loaded = await store.read();

      expect(loaded.schemaVersion).toBe(7);
      expect(loaded.reviewPolicies).toEqual([]);
      expect(loaded.reviewApprovals).toEqual([]);
      expect(loaded.reviewDispositions).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("migrates v6 state into an empty review disposition ledger", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      const v6State = createEmptyState();
      const { reviewDispositions: _dispositions, ...v6WithoutDispositionLedger } = v6State;
      await writeFile(dbPath, `${JSON.stringify({ ...v6WithoutDispositionLedger, schemaVersion: 6 })}\n`, "utf8");

      const loaded = await store.read();

      expect(loaded.schemaVersion).toBe(7);
      expect(loaded.reviewDispositions).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("validates audit event records", () => {
    expect(auditEventSchema.parse({
      id: "audit-test-1",
      at: "2026-06-06T00:00:00.000Z",
      actorId: "lead-1",
      actorRole: "lead",
      action: "governance_record.created",
      entityType: "governance_record",
      entityId: "governance-1",
      languageId: "avenik",
      summary: "Created synthetic governance record.",
      metadata: { policyType: "generation" }
    })).toMatchObject({
      actorId: "lead-1",
      actorRole: "lead",
      action: "governance_record.created",
      metadata: { policyType: "generation" }
    });
  });

  it("validates review policy and approval records", () => {
    expect(reviewPolicySchema.parse({
      id: "review-policy-avenik",
      languageId: "avenik",
      assignedReviewerIds: ["reviewer-1", "elder-1"],
      approvalThreshold: 2,
      requiresAssignedReviewer: true,
      updatedAt: "2026-06-06T00:00:00.000Z",
      updatedBy: "lead-1"
    })).toMatchObject({
      languageId: "avenik",
      approvalThreshold: 2,
      requiresAssignedReviewer: true
    });

    expect(reviewApprovalSchema.parse({
      id: "review-approval-1",
      languageId: "avenik",
      noteId: "avn-rule-verb-chain-note",
      reviewerId: "reviewer-1",
      approvedAt: "2026-06-06T00:01:00.000Z"
    })).toMatchObject({
      noteId: "avn-rule-verb-chain-note",
      reviewerId: "reviewer-1"
    });
  });

  it("rejects duplicate persisted entity ids inside app-state collections", () => {
    const state = createEmptyState();
    const note = createTestNote();

    state.notes = [
      note,
      {
        ...note,
        explanation: "Second synthetic note with a duplicated persistent ID."
      }
    ];

    expect(() => parseAppState(state)).toThrow("Duplicate persisted id in notes: note-1");
  });

  it.each([
    [
      "missing note",
      {
        languageId: "avenik",
        noteId: "missing-note",
        reviewerId: "reviewer-1"
      },
      "Review approval references missing note: missing-note"
    ],
    [
      "note language mismatch",
      {
        languageId: "solari",
        noteId: "note-1",
        reviewerId: "reviewer-1"
      },
      "Review approval language solari does not match note note-1 language avenik"
    ],
    [
      "unknown reviewer",
      {
        languageId: "avenik",
        noteId: "note-1",
        reviewerId: "missing-reviewer"
      },
      "Review approval references unknown reviewer: missing-reviewer"
    ],
    [
      "unassignable reviewer",
      {
        languageId: "avenik",
        noteId: "note-1",
        reviewerId: "learner-1"
      },
      "Review approval reviewer is not assignable: learner-1"
    ]
  ])("rejects persisted review approvals with %s", (_caseName, approvalPatch, errorMessage) => {
    const state = createEmptyState();
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.notes = [createTestNote()];
    state.reviewApprovals = [{
      id: "review-approval-1",
      approvedAt: "2026-06-06T00:01:00.000Z",
      ...approvalPatch
    }];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    [
      "duplicate assigned reviewers",
      {
        assignedReviewerIds: ["reviewer-1", "reviewer-1"],
        approvalThreshold: 1,
        requiresAssignedReviewer: true
      },
      "Review policy assignedReviewerIds must be unique"
    ],
    [
      "unknown assigned reviewer",
      {
        assignedReviewerIds: ["reviewer-1", "missing-reviewer"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true
      },
      "Review policy references unknown reviewer: missing-reviewer"
    ],
    [
      "unassignable learner reviewer",
      {
        assignedReviewerIds: ["reviewer-1", "learner-1"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true
      },
      "Review policy reviewer is not assignable: learner-1"
    ],
    [
      "assigned-reviewer threshold overflow",
      {
        assignedReviewerIds: ["reviewer-1"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true
      },
      "Review policy approvalThreshold cannot exceed assigned reviewers"
    ],
    [
      "open-reviewer threshold overflow",
      {
        assignedReviewerIds: ["reviewer-1"],
        approvalThreshold: 5,
        requiresAssignedReviewer: false
      },
      "Review policy approvalThreshold cannot exceed assignable reviewers"
    ]
  ])("rejects persisted review policies with %s", (_caseName, policyPatch, errorMessage) => {
    const state = createEmptyState();
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.reviewPolicies = [{
      id: "review-policy-avenik",
      languageId: "avenik",
      updatedAt: "2026-06-06T00:00:00.000Z",
      updatedBy: "lead-1",
      ...policyPatch
    }];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it("rejects duplicate review approvals for the same note and reviewer", () => {
    const state = createEmptyState();
    state.reviewApprovals = [
      {
        id: "review-approval-1",
        languageId: "avenik",
        noteId: "note-1",
        reviewerId: "reviewer-1",
        approvedAt: "2026-06-06T00:01:00.000Z"
      },
      {
        id: "review-approval-2",
        languageId: "avenik",
        noteId: "note-1",
        reviewerId: "reviewer-1",
        approvedAt: "2026-06-06T00:02:00.000Z"
      }
    ];

    expect(() => parseAppState(state)).toThrow("Duplicate review approval for language/note/reviewer: avenik/note-1/reviewer-1");
  });

  it("validates richer note review lifecycle statuses", () => {
    expect(["draft", "under_review", "approved", "contested", "rejected", "deferred", "escalated"].map((status) => (
      noteStatusSchema.parse(status)
    ))).toEqual(["draft", "under_review", "approved", "contested", "rejected", "deferred", "escalated"]);
  });

  it.each([
    [
      "missing note",
      createTestDisposition({ noteId: "missing-note" }),
      "Review disposition references missing note: missing-note"
    ],
    [
      "note language mismatch",
      createTestDisposition({ languageId: "solari" }),
      "Review disposition language solari does not match note note-1 language avenik"
    ],
    [
      "unknown assignee",
      createTestDisposition({ assignedTo: "missing-user" }),
      "Review disposition assignee is not assignable: missing-user"
    ],
    [
      "unassignable assignee",
      createTestDisposition({ assignedTo: "learner-1" }),
      "Review disposition assignee is not assignable: learner-1"
    ],
    [
      "unknown opener",
      createTestDisposition({ openedBy: "missing-opener" }),
      "Review disposition opener is not assignable: missing-opener"
    ],
    [
      "open resolution fields",
      createTestDisposition({
        resolvedAt: "2026-06-06T01:00:00.000Z",
        resolvedBy: "lead-1",
        resolutionSummary: "Resolved too early."
      }),
      "Open review disposition cannot have resolution fields"
    ],
    [
      "resolved missing resolution fields",
      createTestDisposition({
        status: "resolved",
        resolvedAt: null,
        resolvedBy: null,
        resolutionSummary: null
      }),
      "Resolved review disposition requires resolvedAt, resolvedBy, and resolutionSummary"
    ],
    [
      "unknown resolver",
      createTestDisposition({
        status: "resolved",
        resolvedAt: "2026-06-06T01:00:00.000Z",
        resolvedBy: "missing-resolver",
        resolutionSummary: "Resolved after follow-up."
      }),
      "Review disposition resolver is not assignable: missing-resolver"
    ]
  ])("rejects persisted review dispositions with %s", (_caseName, disposition, errorMessage) => {
    const state = createEmptyState();
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.notes = [createTestNote()];
    state.reviewDispositions = [disposition];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it("rejects duplicate open review disposition work for the same note and disposition", () => {
    const state = createEmptyState();
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.notes = [createTestNote()];
    state.reviewDispositions = [
      createTestDisposition({ id: "review-disposition-1" }),
      createTestDisposition({ id: "review-disposition-2", reason: "Duplicate open escalation." })
    ];

    expect(() => parseAppState(state)).toThrow("Duplicate open review disposition for language/note/disposition: avenik/note-1/escalated");
  });

  it("validates review disposition work records", () => {
    expect(reviewDispositionSchema.parse({
      id: "review-disposition-1",
      languageId: "avenik",
      noteId: "avn-rule-verb-chain-note",
      disposition: "escalated",
      status: "open",
      reason: "Escalate for lead review.",
      assignedTo: "lead-1",
      dueAt: "2026-06-20",
      openedAt: "2026-06-06T00:00:00.000Z",
      openedBy: "reviewer-1",
      resolvedAt: null,
      resolvedBy: null,
      resolutionSummary: null
    })).toMatchObject({
      disposition: "escalated",
      status: "open",
      assignedTo: "lead-1"
    });
  });

  it("does not write a db file when updating a missing note", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);

      await expect(store.updateNote("missing-note", { status: "approved" })).rejects.toThrow(
        "Note not found: missing-note"
      );
      await expect(readFile(dbPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("serializes concurrent updates through the latest persisted state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assini-store-"));
    const dbPath = join(dir, "local-db.json");

    try {
      const store = new JsonStore(dbPath);
      await store.write(createEmptyState());

      await Promise.all(
        Array.from({ length: 20 }, async (_, index) =>
          store.update((state) => ({
            ...state,
            languages: [
              ...state.languages,
              {
                id: `lang-${index}`,
                name: `Lang ${index}`,
                typology: "isolating",
                description: "Synthetic concurrent update language.",
                orthography: "Latin",
                status: "synthetic",
                fixtureSource: "concurrency-test"
              }
            ]
          }))
        )
      );

      const loaded = await store.read();

      expect(loaded.languages.map((language) => language.id).sort()).toEqual(
        Array.from({ length: 20 }, (_, index) => `lang-${index}`).sort()
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
