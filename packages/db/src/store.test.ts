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
  type AuditEvent,
  type AiSession,
  type CorpusAnswerKey,
  type CorpusPassage,
  type ElderCorrection,
  type EvaluationRun,
  type Exercise,
  type ExerciseSubmission,
  type GovernanceRecord,
  type Language,
  type Note,
  type ReviewDisposition,
  userRoleSchema
} from "./schema";

function createTestLanguage(overrides: Partial<Language> = {}): Language {
  return {
    id: "avenik",
    name: "Avenik",
    typology: "agglutinative",
    description: "Synthetic test language.",
    orthography: "Latin synthetic orthography",
    status: "synthetic",
    fixtureSource: "unit-test",
    ...overrides
  };
}

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

function createTestCorpusPassage(overrides: Partial<CorpusPassage> = {}): CorpusPassage {
  return {
    id: "passage-1",
    languageId: "avenik",
    source: "synthetic-test",
    sourceMetadata: {
      author: "Synthetic Tester",
      year: 2026,
      license: "synthetic-only",
      consentRecord: "synthetic-test-consent"
    },
    textTarget: "mira talo-mi-na",
    textTranslation: "I walk by the river.",
    morphologicalSegmentation: [
      {
        surface: "mira",
        lemma: "mira",
        gloss: "river",
        features: ["noun"]
      },
      {
        surface: "talo-mi-na",
        lemma: "talo",
        gloss: "walk.present.1sg",
        features: ["verb", "present", "1sg"]
      }
    ],
    topicTags: ["motion"],
    consentStatus: {
      use: "synthetic-testing-only",
      restrictions: ["unit-test"]
    },
    ...overrides
  };
}

function createTestCorpusAnswerKey(overrides: Partial<CorpusAnswerKey> = {}): CorpusAnswerKey {
  const passage = createTestCorpusPassage();
  return {
    passageId: passage.id,
    languageId: passage.languageId,
    textTarget: passage.textTarget,
    textTranslation: passage.textTranslation,
    morphologicalSegmentation: passage.morphologicalSegmentation.map((morpheme) => ({
      ...morpheme,
      features: [...morpheme.features]
    })),
    ...overrides
  };
}

function createTestElderCorrection(overrides: Partial<ElderCorrection> = {}): ElderCorrection {
  return {
    id: "elder-correction-1",
    languageId: "avenik",
    noteId: "note-1",
    correction: "Clarify that tense appears before person in the synthetic suffix chain.",
    rationale: "Elder review should preserve suffix-order teaching notes.",
    severity: "major",
    status: "pending_review",
    proposedBy: "elder-1",
    proposedAt: "2026-06-06T00:00:00.000Z",
    reviewedBy: null,
    reviewedAt: null,
    ...overrides
  };
}

function createTestExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "exercise-1",
    languageId: "avenik",
    type: "translate_to_target",
    prompt: "Translate: I walk by the river.",
    allowedVocabulary: ["mira", "talo"],
    allowedRuleIds: ["rule-1"],
    expectedAnswers: ["mira talo-mi-na"],
    adversarialAnswers: [
      {
        answer: "talo mira",
        reason: "Wrong target-language order."
      },
      {
        answer: "mira talo",
        reason: "Missing required synthetic suffixes."
      }
    ],
    gradingExplanation: "Accepted answer matches the synthetic exercise key.",
    ...overrides
  };
}

function createTestSubmission(overrides: Partial<ExerciseSubmission> = {}): ExerciseSubmission {
  return {
    id: "submission-1",
    exerciseId: "exercise-1",
    languageId: "avenik",
    answer: "mira talo-mi-na",
    accepted: true,
    explanation: "Accepted answer matches the synthetic exercise key.",
    submittedAt: "2026-06-06T00:00:00.000Z",
    learnerId: "learner-1",
    ...overrides
  };
}

function createTestGovernanceRecord(overrides: Partial<GovernanceRecord> = {}): GovernanceRecord {
  return {
    id: "governance-1",
    languageId: "avenik",
    policyType: "generation",
    content: "Synthetic generation policy for local testing.",
    effectiveDate: "2026-06-06",
    approvedBy: "lead-1",
    ...overrides
  };
}

function createTestAuditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "audit-test-1",
    at: "2026-06-06T00:00:00.000Z",
    actorId: "lead-1",
    actorRole: "lead",
    action: "governance_record.created",
    entityType: "governance_record",
    entityId: "governance-1",
    languageId: "avenik",
    summary: "Created synthetic governance record.",
    metadata: { policyType: "generation" },
    ...overrides
  };
}

function createTestAiSession(overrides: Partial<AiSession> = {}): AiSession {
  const messages: AiSession["messages"] = [
    {
      id: "ai-session-1-message-1",
      role: "user",
      content: "Trace the synthetic note safely.",
      createdAt: "2026-06-06T00:00:00.000Z",
      createdBy: "programmer-1"
    },
    {
      id: "ai-session-1-message-2",
      role: "assistant",
      content: "Safe synthetic response.",
      createdAt: "2026-06-06T00:00:00.000Z",
      createdBy: "synthetic-ai"
    }
  ];

  return {
    id: "ai-session-1",
    languageId: "avenik",
    mode: "programmer_debug",
    status: "active",
    createdBy: "programmer-1",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    contextNoteIds: ["note-1"],
    contextPassageIds: ["passage-1"],
    messages,
    thinkingSummary: "Safe reasoning summary: observable trace for synthetic context.",
    trace: [
      {
        id: "ai-session-1-trace-retrieval",
        kind: "retrieval",
        label: "Evidence selection",
        summary: "Linked selected notes and corpus passages as observable evidence.",
        referencedIds: ["note-1", "passage-1"],
        warnings: []
      }
    ],
    neuralMap: {
      nodes: [],
      edges: []
    },
    privacy: {
      redactions: ["hidden-chain-of-thought", "answer-keys"],
      exposesHiddenChainOfThought: false
    },
    ...overrides
  };
}

function createTestAiMessage(overrides: Partial<AiSession["messages"][number]> = {}): AiSession["messages"][number] {
  return {
    id: "ai-session-1-message-custom",
    role: "user",
    content: "Trace the synthetic note safely.",
    createdAt: "2026-06-06T00:00:00.000Z",
    createdBy: "programmer-1",
    ...overrides
  };
}

function createTestEvaluationRun(overrides: Partial<EvaluationRun> = {}): EvaluationRun {
  return {
    id: "evaluation-run-1",
    languageId: "avenik",
    createdAt: "2026-06-06T00:00:00.000Z",
    systemVersion: "unit-test",
    fixtureVersion: "unit-test",
    scores: {
      noteCoverage: 1,
      noteAccuracy: 1
    },
    failures: [],
    summary: "Synthetic evaluation run.",
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
      legacyState.languages.push(createTestLanguage({ id: "legacy-language", name: "Legacy Language" }));
      legacyState.corpus.push(createTestCorpusPassage({
        id: "legacy-corpus",
        languageId: "legacy-language"
      }));
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
    state.languages = [createTestLanguage()];

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
      "blank id",
      { id: "   " },
      "Language id must not be blank"
    ],
    [
      "blank name",
      { name: "   " },
      "Language name must not be blank: avenik"
    ],
    [
      "blank description",
      { description: "   " },
      "Language description must not be blank: avenik"
    ],
    [
      "blank orthography",
      { orthography: "   " },
      "Language orthography must not be blank: avenik"
    ],
    [
      "blank fixture source",
      { fixtureSource: "   " },
      "Language fixtureSource must not be blank: avenik"
    ]
  ])("rejects persisted languages with %s", (_caseName, languagePatch, errorMessage) => {
    const state = createEmptyState();
    state.languages = [createTestLanguage(languagePatch)];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    [
      "blank id",
      { id: "   " },
      "User id must not be blank"
    ],
    [
      "blank name",
      { name: "   " },
      "User name must not be blank: learner-1"
    ],
    [
      "blank avatar",
      { avatarUrl: "   " },
      "User avatarUrl must not be blank: learner-1"
    ]
  ])("rejects persisted users with %s", (_caseName, userPatch, errorMessage) => {
    const state = createEmptyState();
    state.users = [{ ...LOCAL_PROTOTYPE_USERS[0], ...userPatch }];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    [
      "note with missing language",
      "notes",
      createTestNote({ languageId: "missing-language" }),
      "Note references missing language: missing-language"
    ],
    [
      "note answer key with missing language",
      "noteAnswerKeys",
      createTestNote({ id: "note-answer-key-1", languageId: "missing-language", status: "approved" }),
      "Note answer key references missing language: missing-language"
    ],
    [
      "note with blank topic",
      "notes",
      createTestNote({ topic: "   " }),
      "Note topic must not be blank: note-1"
    ],
    [
      "note answer key with blank topic",
      "noteAnswerKeys",
      createTestNote({ id: "note-answer-key-1", status: "approved", topic: "   " }),
      "Note answer key topic must not be blank: note-answer-key-1"
    ],
    [
      "note with blank explanation",
      "notes",
      createTestNote({ explanation: "   " }),
      "Note explanation must not be blank: note-1"
    ],
    [
      "note answer key with blank explanation",
      "noteAnswerKeys",
      createTestNote({ id: "note-answer-key-1", status: "approved", explanation: "   " }),
      "Note answer key explanation must not be blank: note-answer-key-1"
    ],
    [
      "note with blank dialect scope",
      "notes",
      createTestNote({ dialectScope: "   " }),
      "Note dialect scope must not be blank: note-1"
    ],
    [
      "note answer key with blank dialect scope",
      "noteAnswerKeys",
      createTestNote({ id: "note-answer-key-1", status: "approved", dialectScope: "   " }),
      "Note answer key dialect scope must not be blank: note-answer-key-1"
    ],
    [
      "evidence-count drift",
      "notes",
      createTestNote({ evidencePassageIds: ["passage-1"], evidenceCount: 2 }),
      "Note evidenceCount 2 does not match evidencePassageIds length 1: note-1"
    ],
    [
      "note with unparseable reviewer timestamp",
      "notes",
      createTestNote({
        reviewer: {
          lastReviewedBy: "reviewer-1",
          lastReviewedAt: "not-a-date",
          comments: []
        }
      }),
      "Note reviewer lastReviewedAt must be parseable: not-a-date"
    ],
    [
      "note with unparseable edit-history timestamp",
      "notes",
      createTestNote({
        editHistory: [
          {
            at: "not-a-date",
            by: "reviewer-1",
            action: "reviewed",
            summary: "Malformed timestamp should not restore."
          }
        ]
      }),
      "Note editHistory at must be parseable: not-a-date"
    ],
    [
      "note answer key with unparseable edit-history timestamp",
      "noteAnswerKeys",
      createTestNote({
        id: "note-answer-key-1",
        status: "approved",
        editHistory: [
          {
            at: "not-a-date",
            by: "legacy-v1-migration",
            action: "migrated",
            summary: "Malformed answer-key timestamp should not restore."
          }
        ]
      }),
      "Note answer key editHistory at must be parseable: not-a-date"
    ],
    [
      "note with unknown reviewer actor",
      "notes",
      createTestNote({
        reviewer: {
          lastReviewedBy: "missing-reviewer",
          lastReviewedAt: "2026-06-06T00:00:00.000Z",
          comments: ["Unknown reviewers should not restore."]
        }
      }),
      "Note reviewer lastReviewedBy is not allowed: missing-reviewer"
    ],
    [
      "note with unassignable reviewer actor",
      "notes",
      createTestNote({
        reviewer: {
          lastReviewedBy: "learner-1",
          lastReviewedAt: "2026-06-06T00:00:00.000Z",
          comments: ["Learners cannot be note reviewers."]
        }
      }),
      "Note reviewer lastReviewedBy is not allowed: learner-1"
    ],
    [
      "note with unknown edit-history actor",
      "notes",
      createTestNote({
        editHistory: [
          {
            at: "2026-06-06T00:00:00.000Z",
            by: "missing-writer",
            action: "reviewed",
            summary: "Unknown edit-history writers should not restore."
          }
        ]
      }),
      "Note editHistory by is not allowed: missing-writer"
    ],
    [
      "note answer key with unknown edit-history actor",
      "noteAnswerKeys",
      createTestNote({
        id: "note-answer-key-1",
        status: "approved",
        editHistory: [
          {
            at: "2026-06-06T00:00:00.000Z",
            by: "missing-system-writer",
            action: "seeded",
            summary: "Unknown answer-key writers should not restore."
          }
        ]
      }),
      "Note answer key editHistory by is not allowed: missing-system-writer"
    ],
    [
      "note with unsupported edit-history action",
      "notes",
      createTestNote({
        editHistory: [
          {
            at: "2026-06-06T00:00:00.000Z",
            by: "reviewer-1",
            action: "made_up_action",
            summary: "Unsupported note timeline actions should not restore."
          }
        ]
      }),
      "Note editHistory action is not allowed: made_up_action"
    ],
    [
      "note with blank reviewer comment",
      "notes",
      createTestNote({
        reviewer: {
          lastReviewedBy: "reviewer-1",
          lastReviewedAt: "2026-06-06T00:00:00.000Z",
          comments: ["   "]
        }
      }),
      "Note reviewer comment must not be blank"
    ],
    [
      "note with blank edit-history summary",
      "notes",
      createTestNote({
        editHistory: [
          {
            at: "2026-06-06T00:00:00.000Z",
            by: "reviewer-1",
            action: "reviewed",
            summary: "   "
          }
        ]
      }),
      "Note editHistory summary must not be blank"
    ],
    [
      "note answer key with unsupported edit-history action",
      "noteAnswerKeys",
      createTestNote({
        id: "note-answer-key-1",
        status: "approved",
        editHistory: [
          {
            at: "2026-06-06T00:00:00.000Z",
            by: "synthetic-generator",
            action: "seeded",
            summary: "Unsupported answer-key timeline actions should not restore."
          }
        ]
      }),
      "Note answer key editHistory action is not allowed: seeded"
    ],
    [
      "note answer key with blank edit-history summary",
      "noteAnswerKeys",
      createTestNote({
        id: "note-answer-key-1",
        status: "approved",
        editHistory: [
          {
            at: "2026-06-06T00:00:00.000Z",
            by: "synthetic-generator",
            action: "created",
            summary: "   "
          }
        ]
      }),
      "Note answer key editHistory summary must not be blank"
    ],
    [
      "missing evidence passage",
      "notes",
      createTestNote({ evidencePassageIds: ["missing-passage"], evidenceCount: 1 }),
      "Note references missing evidence passage: missing-passage"
    ],
    [
      "evidence passage language mismatch",
      "notes",
      createTestNote({ evidencePassageIds: ["other-passage"], evidenceCount: 1 }),
      "Note evidence passage other-passage language solari does not match note note-1 language avenik"
    ],
    [
      "missing example passage",
      "notes",
      createTestNote({
        examples: [{ passageId: "missing-passage", target: "missing target", translation: "Missing translation." }]
      }),
      "Note references missing example passage: missing-passage"
    ],
    [
      "example target mismatch",
      "notes",
      createTestNote({
        examples: [{ passageId: "passage-1", target: "wrong target", translation: "I walk by the river." }]
      }),
      "Note example passage-1 target does not match cited corpus textTarget"
    ],
    [
      "example translation mismatch",
      "notes",
      createTestNote({
        examples: [{ passageId: "passage-1", target: "mira talo-mi-na", translation: "Wrong translation." }]
      }),
      "Note example passage-1 translation does not match cited corpus textTranslation"
    ]
  ])("rejects persisted %s", (_caseName, collection, note, errorMessage) => {
    const state = createEmptyState();
    state.languages = [createTestLanguage(), createTestLanguage({ id: "solari", name: "Solari", typology: "isolating" })];
    state.corpus = [
      createTestCorpusPassage(),
      createTestCorpusPassage({ id: "other-passage", languageId: "solari" })
    ];
    if (collection === "notes") {
      state.notes = [note];
    } else {
      state.noteAnswerKeys = [note];
    }

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    [
      "missing language",
      createTestCorpusPassage({ languageId: "missing-language" }),
      "Corpus passage references missing language: missing-language"
    ],
    [
      "blank source",
      createTestCorpusPassage({ source: "   " }),
      "Corpus source must not be blank for passage passage-1"
    ],
    [
      "blank source author",
      createTestCorpusPassage({
        sourceMetadata: {
          ...createTestCorpusPassage().sourceMetadata,
          author: "   "
        }
      }),
      "Corpus source author must not be blank for passage passage-1"
    ],
    [
      "blank source license",
      createTestCorpusPassage({
        sourceMetadata: {
          ...createTestCorpusPassage().sourceMetadata,
          license: "   "
        }
      }),
      "Corpus source license must not be blank for passage passage-1"
    ],
    [
      "blank source consent record",
      createTestCorpusPassage({
        sourceMetadata: {
          ...createTestCorpusPassage().sourceMetadata,
          consentRecord: "   "
        }
      }),
      "Corpus source consent record must not be blank for passage passage-1"
    ],
    [
      "blank target text",
      createTestCorpusPassage({ textTarget: "   " }),
      "Corpus target text must not be blank for passage passage-1"
    ],
    [
      "blank translation",
      createTestCorpusPassage({ textTranslation: "   " }),
      "Corpus translation must not be blank for passage passage-1"
    ],
    [
      "blank consent restriction",
      createTestCorpusPassage({
        consentStatus: {
          use: "synthetic-testing-only",
          restrictions: ["   "]
        }
      }),
      "Corpus consent restriction must not be blank for passage passage-1"
    ],
    [
      "duplicate topic tags",
      createTestCorpusPassage({ topicTags: ["motion", " motion "] }),
      "Corpus topic tag is duplicated for passage passage-1: motion"
    ],
    [
      "missing topic tags",
      createTestCorpusPassage({ topicTags: [] }),
      "Corpus passage requires at least one topic tag: passage-1"
    ],
    [
      "blank topic tag",
      createTestCorpusPassage({ topicTags: ["   "] }),
      "Corpus topic tag must not be blank for passage passage-1"
    ],
    [
      "blank morpheme surface",
      createTestCorpusPassage({
        morphologicalSegmentation: [
          {
            surface: "   ",
            lemma: "mira",
            gloss: "river",
            features: ["noun"]
          },
          {
            surface: "talo-mi-na",
            lemma: "talo",
            gloss: "walk.present.1sg",
            features: ["verb", "present", "1sg"]
          }
        ]
      }),
      "Corpus morpheme surface must not be blank for passage passage-1"
    ],
    [
      "blank morpheme lemma",
      createTestCorpusPassage({
        morphologicalSegmentation: [
          {
            surface: "mira",
            lemma: "   ",
            gloss: "river",
            features: ["noun"]
          },
          {
            surface: "talo-mi-na",
            lemma: "talo",
            gloss: "walk.present.1sg",
            features: ["verb", "present", "1sg"]
          }
        ]
      }),
      "Corpus morpheme lemma must not be blank for passage passage-1 surface mira"
    ],
    [
      "blank morpheme gloss",
      createTestCorpusPassage({
        morphologicalSegmentation: [
          {
            surface: "mira",
            lemma: "mira",
            gloss: "   ",
            features: ["noun"]
          },
          {
            surface: "talo-mi-na",
            lemma: "talo",
            gloss: "walk.present.1sg",
            features: ["verb", "present", "1sg"]
          }
        ]
      }),
      "Corpus morpheme gloss must not be blank for passage passage-1 surface mira"
    ],
    [
      "duplicate morpheme features",
      createTestCorpusPassage({
        morphologicalSegmentation: [
          {
            surface: "mira",
            lemma: "mira",
            gloss: "river",
            features: ["noun", " noun "]
          }
        ]
      }),
      "Corpus morpheme feature is duplicated for passage passage-1 surface mira: noun"
    ],
    [
      "blank morpheme feature",
      createTestCorpusPassage({
        morphologicalSegmentation: [
          {
            surface: "mira",
            lemma: "mira",
            gloss: "river",
            features: ["   "]
          },
          {
            surface: "talo-mi-na",
            lemma: "talo",
            gloss: "walk.present.1sg",
            features: ["verb", "present", "1sg"]
          }
        ]
      }),
      "Corpus morpheme feature must not be blank for passage passage-1 surface mira"
    ],
    [
      "segmentation surface absent from target text",
      createTestCorpusPassage({
        morphologicalSegmentation: [
          {
            surface: "ghost",
            lemma: "ghost",
            gloss: "ghost",
            features: ["noun"]
          }
        ]
      }),
      "Corpus segmentation surface is not present in target text for passage passage-1: ghost"
    ],
    [
      "uncovered target token",
      createTestCorpusPassage({
        textTarget: "mira lumo-ke talo-mi-na",
        morphologicalSegmentation: [
          {
            surface: "mira",
            lemma: "mira",
            gloss: "river",
            features: ["noun"]
          },
          {
            surface: "talo-mi-na",
            lemma: "talo",
            gloss: "walk.present.1sg",
            features: ["verb", "present", "1sg"]
          }
        ]
      }),
      "Corpus segmentation does not cover target token for passage passage-1: lumo-ke"
    ]
  ])("rejects persisted corpus passages with %s", (_caseName, passage, errorMessage) => {
    const state = createEmptyState();
    state.languages = [createTestLanguage()];
    state.corpus = [passage];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    [
      "missing passage",
      createTestCorpusAnswerKey({ passageId: "missing-passage" }),
      "Corpus answer key references missing passage: missing-passage"
    ],
    [
      "passage language mismatch",
      createTestCorpusAnswerKey({ languageId: "solari" }),
      "Corpus answer key language solari does not match passage passage-1 language avenik"
    ],
    [
      "blank target text",
      createTestCorpusAnswerKey({ textTarget: "   " }),
      "Corpus answer key target text must not be blank for passage passage-1"
    ],
    [
      "blank translation",
      createTestCorpusAnswerKey({ textTranslation: "   " }),
      "Corpus answer key translation must not be blank for passage passage-1"
    ],
    [
      "blank morpheme surface",
      createTestCorpusAnswerKey({
        morphologicalSegmentation: [
          {
            surface: "   ",
            lemma: "mira",
            gloss: "river",
            features: ["noun"]
          },
          {
            surface: "talo-mi-na",
            lemma: "talo",
            gloss: "walk.present.1sg",
            features: ["verb", "present", "1sg"]
          }
        ]
      }),
      "Corpus answer key morpheme surface must not be blank for passage passage-1"
    ],
    [
      "blank morpheme lemma",
      createTestCorpusAnswerKey({
        morphologicalSegmentation: [
          {
            surface: "mira",
            lemma: "   ",
            gloss: "river",
            features: ["noun"]
          },
          {
            surface: "talo-mi-na",
            lemma: "talo",
            gloss: "walk.present.1sg",
            features: ["verb", "present", "1sg"]
          }
        ]
      }),
      "Corpus answer key morpheme lemma must not be blank for passage passage-1 surface mira"
    ],
    [
      "blank morpheme gloss",
      createTestCorpusAnswerKey({
        morphologicalSegmentation: [
          {
            surface: "mira",
            lemma: "mira",
            gloss: "   ",
            features: ["noun"]
          },
          {
            surface: "talo-mi-na",
            lemma: "talo",
            gloss: "walk.present.1sg",
            features: ["verb", "present", "1sg"]
          }
        ]
      }),
      "Corpus answer key morpheme gloss must not be blank for passage passage-1 surface mira"
    ],
    [
      "blank morpheme feature",
      createTestCorpusAnswerKey({
        morphologicalSegmentation: [
          {
            surface: "mira",
            lemma: "mira",
            gloss: "river",
            features: ["   "]
          },
          {
            surface: "talo-mi-na",
            lemma: "talo",
            gloss: "walk.present.1sg",
            features: ["verb", "present", "1sg"]
          }
        ]
      }),
      "Corpus answer key morpheme feature must not be blank for passage passage-1 surface mira"
    ],
    [
      "duplicate morpheme feature",
      createTestCorpusAnswerKey({
        morphologicalSegmentation: [
          {
            surface: "mira",
            lemma: "mira",
            gloss: "river",
            features: ["noun", " noun "]
          },
          {
            surface: "talo-mi-na",
            lemma: "talo",
            gloss: "walk.present.1sg",
            features: ["verb", "present", "1sg"]
          }
        ]
      }),
      "Corpus answer key morpheme feature is duplicated for passage passage-1 surface mira: noun"
    ],
    [
      "segmentation surface absent from target text",
      createTestCorpusAnswerKey({
        morphologicalSegmentation: [
          {
            surface: "ghost",
            lemma: "ghost",
            gloss: "ghost",
            features: ["noun"]
          }
        ]
      }),
      "Corpus answer key segmentation surface is not present in target text for passage passage-1: ghost"
    ],
    [
      "uncovered target token",
      createTestCorpusAnswerKey({
        textTarget: "mira lumo-ke talo-mi-na",
        morphologicalSegmentation: [
          {
            surface: "mira",
            lemma: "mira",
            gloss: "river",
            features: ["noun"]
          },
          {
            surface: "talo-mi-na",
            lemma: "talo",
            gloss: "walk.present.1sg",
            features: ["verb", "present", "1sg"]
          }
        ]
      }),
      "Corpus answer key segmentation does not cover target token for passage passage-1: lumo-ke"
    ]
  ])("rejects persisted corpus answer keys with %s", (_caseName, answerKey, errorMessage) => {
    const state = createEmptyState();
    state.languages = [createTestLanguage()];
    state.corpus = [createTestCorpusPassage()];
    state.corpusAnswerKeys = [answerKey];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    [
      "blank language id",
      {
        languageId: "   ",
        noteId: "note-1",
        reviewerId: "reviewer-1"
      },
      "Review approval languageId must not be blank"
    ],
    [
      "blank note id",
      {
        languageId: "avenik",
        noteId: "   ",
        reviewerId: "reviewer-1"
      },
      "Review approval noteId must not be blank"
    ],
    [
      "blank reviewer id",
      {
        languageId: "avenik",
        noteId: "note-1",
        reviewerId: "   "
      },
      "Review approval reviewerId must not be blank"
    ],
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
      "unparseable approval timestamp",
      {
        languageId: "avenik",
        noteId: "note-1",
        reviewerId: "reviewer-1",
        approvedAt: "not-a-date"
      },
      "Review approval approvedAt must be parseable: not-a-date"
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
    state.languages = [createTestLanguage()];
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.notes = [createTestNote({ status: "under_review" })];
    state.reviewApprovals = [{
      id: "review-approval-1",
      approvedAt: "2026-06-06T00:01:00.000Z",
      ...approvalPatch
    }];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each(["draft", "contested", "rejected", "deferred", "escalated"] as const)(
    "rejects persisted review approvals for %s notes",
    (status) => {
      const state = createEmptyState();
      state.languages = [createTestLanguage()];
      state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
      state.notes = [createTestNote({ status })];
      state.reviewApprovals = [{
        id: `review-approval-${status}`,
        languageId: "avenik",
        noteId: "note-1",
        reviewerId: "reviewer-1",
        approvedAt: "2026-06-06T00:01:00.000Z"
      }];

      expect(() => parseAppState(state)).toThrow(`Review approval note note-1 must be under_review or approved, found ${status}`);
    }
  );

  it.each([
    [
      "missing language",
      {
        languageId: "missing-language",
        assignedReviewerIds: ["reviewer-1"],
        approvalThreshold: 1,
        requiresAssignedReviewer: true
      },
      "Review policy references missing language: missing-language"
    ],
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
      "blank assigned reviewer",
      {
        assignedReviewerIds: ["reviewer-1", "   "],
        approvalThreshold: 2,
        requiresAssignedReviewer: true
      },
      "Review policy assigned reviewer must not be blank"
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
    ],
    [
      "unparseable update timestamp",
      {
        assignedReviewerIds: ["reviewer-1"],
        approvalThreshold: 1,
        requiresAssignedReviewer: true,
        updatedAt: "not-a-date"
      },
      "Review policy updatedAt must be parseable: not-a-date"
    ],
    [
      "blank updater",
      {
        assignedReviewerIds: ["reviewer-1"],
        approvalThreshold: 1,
        requiresAssignedReviewer: true,
        updatedBy: "   "
      },
      "Review policy updatedBy must not be blank"
    ],
    [
      "unknown updater",
      {
        assignedReviewerIds: ["reviewer-1"],
        approvalThreshold: 1,
        requiresAssignedReviewer: true,
        updatedBy: "missing-user"
      },
      "Review policy updater is not allowed: missing-user"
    ],
    [
      "unallowed updater role",
      {
        assignedReviewerIds: ["reviewer-1"],
        approvalThreshold: 1,
        requiresAssignedReviewer: true,
        updatedBy: "reviewer-1"
      },
      "Review policy updater is not allowed: reviewer-1"
    ]
  ])("rejects persisted review policies with %s", (_caseName, policyPatch, errorMessage) => {
    const state = createEmptyState();
    state.languages = [createTestLanguage()];
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

  it("rejects duplicate review policies for the same language", () => {
    const state = createEmptyState();
    state.languages = [createTestLanguage()];
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.reviewPolicies = [
      {
        id: "review-policy-avenik-primary",
        languageId: "avenik",
        assignedReviewerIds: ["reviewer-1"],
        approvalThreshold: 1,
        requiresAssignedReviewer: true,
        updatedAt: "2026-06-06T00:00:00.000Z",
        updatedBy: "lead-1"
      },
      {
        id: "review-policy-avenik-secondary",
        languageId: "avenik",
        assignedReviewerIds: ["elder-1"],
        approvalThreshold: 1,
        requiresAssignedReviewer: true,
        updatedAt: "2026-06-06T00:01:00.000Z",
        updatedBy: "lead-1"
      }
    ];

    expect(() => parseAppState(state)).toThrow("Duplicate review policy for language: avenik");
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

  it.each([
    [
      "missing language",
      createTestExercise({ languageId: "missing-language" }),
      "Exercise references missing language: missing-language"
    ],
    [
      "blank prompt",
      createTestExercise({ prompt: "   " }),
      "Exercise prompt must not be blank: exercise-1"
    ],
    [
      "blank grading explanation",
      createTestExercise({ gradingExplanation: "   " }),
      "Exercise grading explanation must not be blank: exercise-1"
    ],
    [
      "duplicate allowed vocabulary",
      createTestExercise({ allowedVocabulary: ["mira", "mira"] }),
      "Exercise allowed vocabulary is duplicated: mira"
    ],
    [
      "blank allowed vocabulary",
      createTestExercise({ allowedVocabulary: ["   "] }),
      "Exercise allowed vocabulary must not be blank"
    ],
    [
      "duplicate allowed rule",
      createTestExercise({ allowedRuleIds: ["rule-1", "rule-1"] }),
      "Exercise allowed rule is duplicated: rule-1"
    ],
    [
      "blank allowed rule",
      createTestExercise({ allowedRuleIds: ["   "] }),
      "Exercise allowed rule must not be blank"
    ],
    [
      "duplicate expected answer",
      createTestExercise({ expectedAnswers: ["mira talo-mi-na", " mira   talo-mi-na "] }),
      "Exercise expected answer is duplicated: mira talo-mi-na"
    ],
    [
      "blank expected answer",
      createTestExercise({
        type: "translate_to_english",
        expectedAnswers: ["   "]
      }),
      "Exercise expected answer must not be blank"
    ],
    [
      "too few adversarial probes",
      createTestExercise({ adversarialAnswers: [{ answer: "talo mira", reason: "Wrong target-language order." }] }),
      "Exercise requires at least two adversarial probes: exercise-1"
    ],
    [
      "adversarial answer duplicating expected answer",
      createTestExercise({
        adversarialAnswers: [
          { answer: "mira talo-mi-na", reason: "Duplicates the expected answer." },
          { answer: "mira talo", reason: "Missing required synthetic suffixes." }
        ]
      }),
      "Exercise adversarial answer duplicates an expected answer: mira talo-mi-na"
    ],
    [
      "duplicate adversarial answer",
      createTestExercise({
        adversarialAnswers: [
          { answer: "talo mira", reason: "Wrong target-language order." },
          { answer: " talo   mira ", reason: "Same wrong order with extra whitespace." }
        ]
      }),
      "Exercise adversarial answer is duplicated: talo mira"
    ],
    [
      "blank adversarial answer",
      createTestExercise({
        adversarialAnswers: [
          { answer: "   ", reason: "Blank adversarial answers should not restore." },
          { answer: "mira talo", reason: "Missing required synthetic suffixes." }
        ]
      }),
      "Exercise adversarial answer must not be blank"
    ],
    [
      "blank adversarial reason",
      createTestExercise({
        adversarialAnswers: [
          { answer: "talo mira", reason: "   " },
          { answer: "mira talo", reason: "Missing required synthetic suffixes." }
        ]
      }),
      "Exercise adversarial reason must not be blank"
    ],
    [
      "translate-to-target expected answer missing from corpus",
      createTestExercise({ expectedAnswers: ["unknown target form"] }),
      "Translate-to-target expected answer is not present in corpus: unknown target form"
    ],
    [
      "choose-particle expected answer outside allowed vocabulary",
      createTestExercise({
        type: "choose_particle",
        prompt: "Choose the particle that marks present tense.",
        allowedVocabulary: ["-mi", "-lo"],
        expectedAnswers: ["-na"]
      }),
      "Choose-particle expected answer is not allowed vocabulary: -na"
    ]
  ])("rejects persisted exercises with %s", (_caseName, exercise, errorMessage) => {
    const state = createEmptyState();
    state.languages = [createTestLanguage()];
    state.corpus = [createTestCorpusPassage()];
    state.exercises = [exercise];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    [
      "missing exercise",
      createTestSubmission({ exerciseId: "missing-exercise" }),
      "Exercise submission references missing exercise: missing-exercise"
    ],
    [
      "exercise language mismatch",
      createTestSubmission({ languageId: "solari" }),
      "Exercise submission language solari does not match exercise exercise-1 language avenik"
    ],
    [
      "unparseable submitted date",
      createTestSubmission({ submittedAt: "not-a-date" }),
      "Exercise submission submittedAt must be parseable: not-a-date"
    ],
    [
      "blank answer",
      createTestSubmission({ answer: "   " }),
      "Exercise submission answer must not be blank"
    ],
    [
      "blank explanation",
      createTestSubmission({ explanation: "   " }),
      "Exercise submission explanation must not be blank"
    ],
    [
      "unknown learner actor",
      createTestSubmission({ learnerId: "missing-user" }),
      "Exercise submission learner is not allowed: missing-user"
    ],
    [
      "unallowed learner actor role",
      createTestSubmission({ learnerId: "elder-1" }),
      "Exercise submission learner is not allowed: elder-1"
    ]
  ])("rejects persisted exercise submissions with %s", (_caseName, submission, errorMessage) => {
    const state = createEmptyState();
    state.languages = [createTestLanguage()];
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.corpus = [createTestCorpusPassage()];
    state.exercises = [createTestExercise()];
    state.exerciseSubmissions = [submission];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    [
      "blank language id",
      createTestGovernanceRecord({ languageId: "   " }),
      "Governance record languageId must not be blank"
    ],
    [
      "missing language",
      createTestGovernanceRecord({ languageId: "missing-language" }),
      "Governance record references missing language: missing-language"
    ],
    [
      "blank approver",
      createTestGovernanceRecord({ approvedBy: "   " }),
      "Governance record approver must not be blank"
    ],
    [
      "unknown approver",
      createTestGovernanceRecord({ approvedBy: "missing-user" }),
      "Governance record approver is not allowed: missing-user"
    ],
    [
      "unallowed approver role",
      createTestGovernanceRecord({ approvedBy: "reviewer-1" }),
      "Governance record approver is not allowed: reviewer-1"
    ],
    [
      "unparseable effective date",
      createTestGovernanceRecord({ effectiveDate: "not-a-date" }),
      "Governance record effectiveDate must be parseable: not-a-date"
    ],
    [
      "blank content",
      createTestGovernanceRecord({ content: "   " }),
      "Governance record content must not be blank"
    ]
  ])("rejects persisted governance records with %s", (_caseName, record, errorMessage) => {
    const state = createEmptyState();
    state.languages = [createTestLanguage()];
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.governance = [record];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    [
      "unparseable timestamp",
      createTestAuditEvent({ at: "not-a-date" }),
      "Audit event at must be parseable: not-a-date"
    ],
    [
      "missing non-null language",
      createTestAuditEvent({ languageId: "missing-language" }),
      "Audit event references missing language: missing-language"
    ],
    [
      "blank non-null language",
      createTestAuditEvent({ languageId: "   " }),
      "Audit event languageId must not be blank"
    ],
    [
      "unknown actor",
      createTestAuditEvent({ actorId: "missing-user" }),
      "Audit event references unknown actor: missing-user"
    ],
    [
      "blank actor",
      createTestAuditEvent({ actorId: "   " }),
      "Audit event actorId must not be blank"
    ],
    [
      "actor role mismatch",
      createTestAuditEvent({ actorRole: "admin" }),
      "Audit event actorRole admin does not match actor lead-1 role lead"
    ],
    [
      "blank action",
      createTestAuditEvent({ action: "   " }),
      "Audit event action must not be blank"
    ],
    [
      "blank entity id",
      createTestAuditEvent({ entityId: "   " }),
      "Audit event entityId must not be blank"
    ],
    [
      "blank summary",
      createTestAuditEvent({ summary: "   " }),
      "Audit event summary must not be blank"
    ],
    [
      "private metadata field",
      createTestAuditEvent({ metadata: { learnerAnswer: "private learner answer" } }),
      "Audit event metadata contains private field: learnerAnswer"
    ],
    [
      "secret-like metadata value",
      createTestAuditEvent({ metadata: { diagnostic: "Bearer sk-test-secret-value" } }),
      "Audit event metadata contains secret-like value at diagnostic"
    ]
  ])("rejects persisted audit events with %s", (_caseName, event, errorMessage) => {
    const state = createEmptyState();
    state.languages = [createTestLanguage()];
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.auditEvents = [event];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    [
      "blank language id",
      createTestAiSession({ languageId: "   " }),
      "AI session languageId must not be blank"
    ],
    [
      "missing language",
      createTestAiSession({ languageId: "missing-language" }),
      "AI session references missing language: missing-language"
    ],
    [
      "blank creator",
      createTestAiSession({ createdBy: "   " }),
      "AI session creator must not be blank"
    ],
    [
      "unknown creator",
      createTestAiSession({ createdBy: "missing-user" }),
      "AI session creator is not allowed for mode programmer_debug: missing-user"
    ],
    [
      "creator role not allowed for mode",
      createTestAiSession({ createdBy: "learner-1" }),
      "AI session creator is not allowed for mode programmer_debug: learner-1"
    ],
    [
      "blank thinking summary",
      createTestAiSession({ thinkingSummary: "   " }),
      "AI session thinkingSummary must not be blank"
    ],
    [
      "blank message content",
      createTestAiSession({
        messages: [
          createTestAiMessage({ id: "ai-session-1-message-1", content: "   " })
        ]
      }),
      "AI session message content must not be blank: ai-session-1-message-1"
    ],
    [
      "unparseable created date",
      createTestAiSession({ createdAt: "not-a-date" }),
      "AI session createdAt must be parseable: not-a-date"
    ],
    [
      "unparseable updated date",
      createTestAiSession({ updatedAt: "not-a-date" }),
      "AI session updatedAt must be parseable: not-a-date"
    ],
    [
      "updated before created",
      createTestAiSession({
        createdAt: "2026-06-06T02:00:00.000Z",
        updatedAt: "2026-06-06T01:00:00.000Z",
        messages: [
          createTestAiMessage({ id: "ai-session-1-message-1", createdAt: "2026-06-06T02:00:00.000Z" })
        ]
      }),
      "AI session updatedAt cannot be before createdAt"
    ],
    [
      "unparseable message date",
      createTestAiSession({
        messages: [
          createTestAiMessage({ id: "ai-session-1-message-1", createdAt: "not-a-date" })
        ]
      }),
      "AI session message createdAt must be parseable: not-a-date"
    ],
    [
      "message before session creation",
      createTestAiSession({
        createdAt: "2026-06-06T01:00:00.000Z",
        updatedAt: "2026-06-06T02:00:00.000Z",
        messages: [
          createTestAiMessage({ id: "ai-session-1-message-1", createdAt: "2026-06-06T00:00:00.000Z" })
        ]
      }),
      "AI session message ai-session-1-message-1 cannot be before session createdAt"
    ],
    [
      "message after session update",
      createTestAiSession({
        updatedAt: "2026-06-06T01:00:00.000Z",
        messages: [
          createTestAiMessage({ id: "ai-session-1-message-1", createdAt: "2026-06-06T02:00:00.000Z" })
        ]
      }),
      "AI session message ai-session-1-message-1 cannot be after session updatedAt"
    ],
    [
      "blank trace label",
      createTestAiSession({
        trace: [
          {
            id: "ai-session-1-trace-retrieval",
            kind: "retrieval",
            label: "   ",
            summary: "Linked selected notes and corpus passages as observable evidence.",
            referencedIds: ["note-1", "passage-1"],
            warnings: []
          }
        ]
      }),
      "AI session trace label must not be blank: ai-session-1-trace-retrieval"
    ],
    [
      "blank trace summary",
      createTestAiSession({
        trace: [
          {
            id: "ai-session-1-trace-retrieval",
            kind: "retrieval",
            label: "Evidence selection",
            summary: "   ",
            referencedIds: ["note-1", "passage-1"],
            warnings: []
          }
        ]
      }),
      "AI session trace summary must not be blank: ai-session-1-trace-retrieval"
    ],
    [
      "blank trace warning",
      createTestAiSession({
        trace: [
          {
            id: "ai-session-1-trace-retrieval",
            kind: "retrieval",
            label: "Evidence selection",
            summary: "Linked selected notes and corpus passages as observable evidence.",
            referencedIds: ["note-1", "passage-1"],
            warnings: ["   "]
          }
        ]
      }),
      "AI session trace warning must not be blank: ai-session-1-trace-retrieval"
    ],
    [
      "blank privacy redaction",
      createTestAiSession({
        privacy: {
          redactions: ["hidden-chain-of-thought", "   "],
          exposesHiddenChainOfThought: false
        }
      }),
      "AI session privacy redaction must not be blank"
    ],
    [
      "missing context note",
      createTestAiSession({ contextNoteIds: ["missing-note"] }),
      "AI session references missing context note: missing-note"
    ],
    [
      "blank context note",
      createTestAiSession({ contextNoteIds: ["   "] }),
      "AI session contextNoteId must not be blank"
    ],
    [
      "context note language mismatch",
      createTestAiSession({ contextNoteIds: ["other-note"] }),
      "AI session context note other-note language solari does not match session language avenik"
    ],
    [
      "missing context passage",
      createTestAiSession({ contextPassageIds: ["missing-passage"] }),
      "AI session references missing context passage: missing-passage"
    ],
    [
      "blank context passage",
      createTestAiSession({ contextPassageIds: ["   "] }),
      "AI session contextPassageId must not be blank"
    ],
    [
      "context passage language mismatch",
      createTestAiSession({ contextPassageIds: ["other-passage"] }),
      "AI session context passage other-passage language solari does not match session language avenik"
    ]
  ])("rejects persisted AI sessions with %s", (_caseName, session, errorMessage) => {
    const state = createEmptyState();
    state.languages = [createTestLanguage(), createTestLanguage({ id: "solari", name: "Solari", typology: "isolating" })];
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.notes = [
      createTestNote(),
      createTestNote({ id: "other-note", languageId: "solari" })
    ];
    state.corpus = [
      createTestCorpusPassage(),
      createTestCorpusPassage({ id: "other-passage", languageId: "solari" })
    ];
    state.aiSessions = [session];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    [
      "missing language",
      createTestEvaluationRun({ languageId: "missing-language" }),
      "Evaluation run references missing language: missing-language"
    ],
    [
      "unparseable created date",
      createTestEvaluationRun({ createdAt: "not-a-date" }),
      "Evaluation run createdAt must be parseable: not-a-date"
    ],
    [
      "blank summary",
      createTestEvaluationRun({ summary: "   " }),
      "Evaluation run summary must not be blank"
    ],
    [
      "blank system version",
      createTestEvaluationRun({ systemVersion: "   " }),
      "Evaluation run systemVersion must not be blank"
    ],
    [
      "blank fixture version",
      createTestEvaluationRun({ fixtureVersion: "   " }),
      "Evaluation run fixtureVersion must not be blank"
    ],
    [
      "blank score category",
      createTestEvaluationRun({ scores: { "   ": 1 } }),
      "Evaluation score category must not be blank"
    ],
    [
      "blank failure category",
      createTestEvaluationRun({
        failures: [
          {
            category: "   ",
            languageId: "avenik",
            itemId: "note-1",
            message: "Blank failure categories should not restore."
          }
        ]
      }),
      "Evaluation failure category must not be blank"
    ],
    [
      "blank failure item id",
      createTestEvaluationRun({
        failures: [
          {
            category: "noteAccuracy",
            languageId: "avenik",
            itemId: "   ",
            message: "Blank failure item IDs should not restore."
          }
        ]
      }),
      "Evaluation failure itemId must not be blank"
    ],
    [
      "blank failure message",
      createTestEvaluationRun({
        failures: [
          {
            category: "noteAccuracy",
            languageId: "avenik",
            itemId: "note-1",
            message: "   "
          }
        ]
      }),
      "Evaluation failure message must not be blank"
    ],
    [
      "failure language mismatch",
      createTestEvaluationRun({
        failures: [
          {
            category: "noteAccuracy",
            languageId: "solari",
            itemId: "note-1",
            message: "Mismatched synthetic failure line."
          }
        ]
      }),
      "Evaluation failure language solari does not match run language avenik"
    ]
  ])("rejects persisted evaluation runs with %s", (_caseName, run, errorMessage) => {
    const state = createEmptyState();
    state.languages = [createTestLanguage(), createTestLanguage({ id: "solari", name: "Solari", typology: "isolating" })];
    state.evaluationRuns = [run];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it("validates richer note review lifecycle statuses", () => {
    expect(["draft", "under_review", "approved", "contested", "rejected", "deferred", "escalated"].map((status) => (
      noteStatusSchema.parse(status)
    ))).toEqual(["draft", "under_review", "approved", "contested", "rejected", "deferred", "escalated"]);
  });

  it.each([
    [
      "blank language id",
      createTestDisposition({ languageId: "   " }),
      "Review disposition languageId must not be blank"
    ],
    [
      "blank note id",
      createTestDisposition({ noteId: "   " }),
      "Review disposition noteId must not be blank"
    ],
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
      "blank assignee",
      createTestDisposition({ assignedTo: "   " }),
      "Review disposition assignee must not be blank"
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
      "blank opener",
      createTestDisposition({ openedBy: "   " }),
      "Review disposition opener must not be blank"
    ],
    [
      "unparseable due date",
      createTestDisposition({ dueAt: "not-a-date" }),
      "Review disposition dueAt must be parseable: not-a-date"
    ],
    [
      "unparseable opened date",
      createTestDisposition({ openedAt: "not-a-date" }),
      "Review disposition openedAt must be parseable: not-a-date"
    ],
    [
      "blank reason",
      createTestDisposition({ reason: "   " }),
      "Review disposition reason must not be blank"
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
      "unparseable resolved date",
      createTestDisposition({
        status: "resolved",
        resolvedAt: "not-a-date",
        resolvedBy: "lead-1",
        resolutionSummary: "Resolved after follow-up."
      }),
      "Review disposition resolvedAt must be parseable: not-a-date"
    ],
    [
      "resolved before opened",
      createTestDisposition({
        status: "resolved",
        openedAt: "2026-06-06T02:00:00.000Z",
        resolvedAt: "2026-06-06T01:00:00.000Z",
        resolvedBy: "lead-1",
        resolutionSummary: "Resolved before it opened."
      }),
      "Review disposition resolvedAt cannot be before openedAt"
    ],
    [
      "blank resolution summary",
      createTestDisposition({
        status: "resolved",
        resolvedAt: "2026-06-06T01:00:00.000Z",
        resolvedBy: "lead-1",
        resolutionSummary: "   "
      }),
      "Review disposition resolutionSummary must not be blank"
    ],
    [
      "blank resolver",
      createTestDisposition({
        status: "resolved",
        resolvedAt: "2026-06-06T01:00:00.000Z",
        resolvedBy: "   ",
        resolutionSummary: "Resolved after follow-up."
      }),
      "Review disposition resolver must not be blank"
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
    state.languages = [createTestLanguage(), createTestLanguage({ id: "solari", name: "Solari", typology: "isolating" })];
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.notes = [createTestNote({ status: "escalated" })];
    state.reviewDispositions = [disposition];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each(["draft", "under_review", "approved"] as const)(
    "rejects open review dispositions for %s notes",
    (status) => {
      const state = createEmptyState();
      state.languages = [createTestLanguage()];
      state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
      state.notes = [createTestNote({ status })];
      state.reviewDispositions = [createTestDisposition()];

      expect(() => parseAppState(state)).toThrow(`Open review disposition note note-1 must have a disposition status, found ${status}`);
    }
  );

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

  it.each([
    [
      "blank language id",
      createTestElderCorrection({ languageId: "   ", noteId: undefined, contextText: "Custom context only." }),
      "Elder correction languageId must not be blank"
    ],
    [
      "missing language",
      createTestElderCorrection({ languageId: "missing-language", noteId: undefined, contextText: "Custom context only." }),
      "Elder correction references missing language: missing-language"
    ],
    [
      "blank note target",
      createTestElderCorrection({ noteId: "   " }),
      "Elder correction noteId must not be blank"
    ],
    [
      "missing note target",
      createTestElderCorrection({ noteId: "missing-note" }),
      "Elder correction references missing note: missing-note"
    ],
    [
      "note language mismatch",
      createTestElderCorrection({ languageId: "solari" }),
      "Elder correction language solari does not match note note-1 language avenik"
    ],
    [
      "missing passage target",
      createTestElderCorrection({ noteId: undefined, passageId: "missing-passage" }),
      "Elder correction references missing passage: missing-passage"
    ],
    [
      "blank passage target",
      createTestElderCorrection({ noteId: undefined, passageId: "   " }),
      "Elder correction passageId must not be blank"
    ],
    [
      "passage language mismatch",
      createTestElderCorrection({ languageId: "solari", noteId: undefined, passageId: "passage-1" }),
      "Elder correction language solari does not match passage passage-1 language avenik"
    ],
    [
      "blank correction",
      createTestElderCorrection({ correction: "   " }),
      "Elder correction text must not be blank"
    ],
    [
      "blank rationale",
      createTestElderCorrection({ rationale: "   " }),
      "Elder correction rationale must not be blank"
    ],
    [
      "blank custom context",
      createTestElderCorrection({ noteId: undefined, contextText: "   " }),
      "Elder correction contextText must not be blank"
    ],
    [
      "unknown proposer",
      createTestElderCorrection({ proposedBy: "missing-user" }),
      "Elder correction proposer is not allowed: missing-user"
    ],
    [
      "blank proposer",
      createTestElderCorrection({ proposedBy: "   " }),
      "Elder correction proposer must not be blank"
    ],
    [
      "learner proposer",
      createTestElderCorrection({ proposedBy: "learner-1" }),
      "Elder correction proposer is not allowed: learner-1"
    ],
    [
      "unparseable proposed date",
      createTestElderCorrection({ proposedAt: "not-a-date" }),
      "Elder correction proposedAt must be parseable: not-a-date"
    ],
    [
      "pending review attribution",
      createTestElderCorrection({
        reviewedBy: "lead-1",
        reviewedAt: "2026-06-06T01:00:00.000Z"
      }),
      "Pending elder correction cannot have review attribution"
    ],
    [
      "accepted missing review attribution",
      createTestElderCorrection({ status: "accepted" }),
      "Reviewed elder correction requires reviewedBy and reviewedAt"
    ],
    [
      "unparseable reviewed date",
      createTestElderCorrection({
        status: "accepted",
        reviewedBy: "lead-1",
        reviewedAt: "not-a-date"
      }),
      "Elder correction reviewedAt must be parseable: not-a-date"
    ],
    [
      "review before proposal",
      createTestElderCorrection({
        status: "accepted",
        proposedAt: "2026-06-06T02:00:00.000Z",
        reviewedBy: "lead-1",
        reviewedAt: "2026-06-06T01:00:00.000Z"
      }),
      "Elder correction reviewedAt cannot be before proposedAt"
    ],
    [
      "blank reviewer",
      createTestElderCorrection({
        status: "accepted",
        reviewedBy: "   ",
        reviewedAt: "2026-06-06T01:00:00.000Z"
      }),
      "Elder correction reviewer must not be blank"
    ],
    [
      "unallowed reviewer",
      createTestElderCorrection({
        status: "accepted",
        reviewedBy: "learner-1",
        reviewedAt: "2026-06-06T01:00:00.000Z"
      }),
      "Elder correction reviewer is not allowed: learner-1"
    ],
    [
      "applied custom-context correction",
      createTestElderCorrection({
        noteId: undefined,
        contextText: "Custom context without a note target.",
        status: "applied",
        reviewedBy: "lead-1",
        reviewedAt: "2026-06-06T01:00:00.000Z"
      }),
      "Applied elder correction must reference a note"
    ]
  ])("rejects persisted elder corrections with %s", (_caseName, correction, errorMessage) => {
    const state = createEmptyState();
    state.languages = [createTestLanguage(), createTestLanguage({ id: "solari", name: "Solari", typology: "isolating" })];
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.notes = [createTestNote()];
    state.corpus = [createTestCorpusPassage()];
    state.elderCorrections = [correction];

    expect(() => parseAppState(state)).toThrow(errorMessage);
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
