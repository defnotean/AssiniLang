import { describe, expect, it } from "vitest";
import { createEmptyState } from "./store";
import { LOCAL_PROTOTYPE_USERS, noteStatusSchema, parseAppState, reviewDispositionSchema } from "./schema";
import type { Exercise } from "./schema";
import {
  createTestLanguage,
  createTestNote,
  createTestCorpusPassage,
  createTestElderCorrection,
  createTestExercise,
  createTestSubmission,
  createTestGovernanceRecord,
  createTestAuditEvent,
  createTestAiSession,
  createTestAiMessage,
  createTestEvaluationRun,
  createTestDisposition
} from "./storeTestFixtures";

describe("JsonStore review and governance integrity", () => {
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

    expect(() => parseAppState(state)).toThrow(
      "Duplicate review approval for language/note/reviewer: avenik/note-1/reviewer-1"
    );
  });

  it.each([
    [
      "blank language id",
      createTestExercise({ languageId: "   " }),
      "Exercise languageId must not be blank: exercise-1"
    ],
    [
      "missing language",
      createTestExercise({ languageId: "missing-language" }),
      "Exercise references missing language: missing-language"
    ],
    ["blank prompt", createTestExercise({ prompt: "   " }), "Exercise prompt must not be blank: exercise-1"],
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
    ["blank allowed rule", createTestExercise({ allowedRuleIds: ["   "] }), "Exercise allowed rule must not be blank"],
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
          { answer: "mira talo", reason: "Missing required verb suffixes." }
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
          { answer: "mira talo", reason: "Missing required verb suffixes." }
        ]
      }),
      "Exercise adversarial answer must not be blank"
    ],
    [
      "blank adversarial reason",
      createTestExercise({
        adversarialAnswers: [
          { answer: "talo mira", reason: "   " },
          { answer: "mira talo", reason: "Missing required verb suffixes." }
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
      "blank exercise id",
      createTestSubmission({ exerciseId: "   " }),
      "Exercise submission exerciseId must not be blank"
    ],
    [
      "missing exercise",
      createTestSubmission({ exerciseId: "missing-exercise" }),
      "Exercise submission references missing exercise: missing-exercise"
    ],
    [
      "blank language id",
      createTestSubmission({ languageId: "   " }),
      "Exercise submission languageId must not be blank"
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
    ["blank answer", createTestSubmission({ answer: "   " }), "Exercise submission answer must not be blank"],
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
      "blank learner actor",
      createTestSubmission({ learnerId: "   " }),
      "Exercise submission learnerId must not be blank"
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
    ["blank content", createTestGovernanceRecord({ content: "   " }), "Governance record content must not be blank"]
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
    ["blank actor", createTestAuditEvent({ actorId: "   " }), "Audit event actorId must not be blank"],
    [
      "actor role mismatch",
      createTestAuditEvent({ actorRole: "admin" }),
      "Audit event actorRole admin does not match actor lead-1 role lead"
    ],
    ["blank action", createTestAuditEvent({ action: "   " }), "Audit event action must not be blank"],
    ["blank entity id", createTestAuditEvent({ entityId: "   " }), "Audit event entityId must not be blank"],
    ["blank summary", createTestAuditEvent({ summary: "   " }), "Audit event summary must not be blank"],
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
    ["blank language id", createTestAiSession({ languageId: "   " }), "AI session languageId must not be blank"],
    [
      "missing language",
      createTestAiSession({ languageId: "missing-language" }),
      "AI session references missing language: missing-language"
    ],
    ["blank creator", createTestAiSession({ createdBy: "   " }), "AI session creator must not be blank"],
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
        messages: [createTestAiMessage({ id: "ai-session-1-message-1", content: "   " })]
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
        messages: [createTestAiMessage({ id: "ai-session-1-message-1", createdAt: "2026-06-06T02:00:00.000Z" })]
      }),
      "AI session updatedAt cannot be before createdAt"
    ],
    [
      "unparseable message date",
      createTestAiSession({
        messages: [createTestAiMessage({ id: "ai-session-1-message-1", createdAt: "not-a-date" })]
      }),
      "AI session message createdAt must be parseable: not-a-date"
    ],
    [
      "message before session creation",
      createTestAiSession({
        createdAt: "2026-06-06T01:00:00.000Z",
        updatedAt: "2026-06-06T02:00:00.000Z",
        messages: [createTestAiMessage({ id: "ai-session-1-message-1", createdAt: "2026-06-06T00:00:00.000Z" })]
      }),
      "AI session message ai-session-1-message-1 cannot be before session createdAt"
    ],
    [
      "message after session update",
      createTestAiSession({
        updatedAt: "2026-06-06T01:00:00.000Z",
        messages: [createTestAiMessage({ id: "ai-session-1-message-1", createdAt: "2026-06-06T02:00:00.000Z" })]
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
    state.languages = [
      createTestLanguage(),
      createTestLanguage({ id: "solari", name: "Solari", typology: "isolating" })
    ];
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.notes = [createTestNote(), createTestNote({ id: "other-note", languageId: "solari" })];
    state.corpus = [createTestCorpusPassage(), createTestCorpusPassage({ id: "other-passage", languageId: "solari" })];
    state.aiSessions = [session];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    [
      "blank language id",
      createTestEvaluationRun({ languageId: "   " }),
      "Evaluation run languageId must not be blank"
    ],
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
    ["blank summary", createTestEvaluationRun({ summary: "   " }), "Evaluation run summary must not be blank"],
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
            message: "Mismatched failure line."
          }
        ]
      }),
      "Evaluation failure language solari does not match run language avenik"
    ],
    [
      "blank failure language id",
      createTestEvaluationRun({
        failures: [
          {
            category: "noteAccuracy",
            languageId: "   ",
            itemId: "note-1",
            message: "Blank failure language IDs should not restore."
          }
        ]
      }),
      "Evaluation failure languageId must not be blank"
    ]
  ])("rejects persisted evaluation runs with %s", (_caseName, run, errorMessage) => {
    const state = createEmptyState();
    state.languages = [
      createTestLanguage(),
      createTestLanguage({ id: "solari", name: "Solari", typology: "isolating" })
    ];
    state.evaluationRuns = [run];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it("validates richer note review lifecycle statuses", () => {
    expect(
      ["draft", "under_review", "approved", "contested", "rejected", "deferred", "escalated"].map((status) =>
        noteStatusSchema.parse(status)
      )
    ).toEqual(["draft", "under_review", "approved", "contested", "rejected", "deferred", "escalated"]);
  });

  it.each([
    [
      "blank language id",
      createTestDisposition({ languageId: "   " }),
      "Review disposition languageId must not be blank"
    ],
    ["blank note id", createTestDisposition({ noteId: "   " }), "Review disposition noteId must not be blank"],
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
    ["blank assignee", createTestDisposition({ assignedTo: "   " }), "Review disposition assignee must not be blank"],
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
    ["blank opener", createTestDisposition({ openedBy: "   " }), "Review disposition opener must not be blank"],
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
    ["blank reason", createTestDisposition({ reason: "   " }), "Review disposition reason must not be blank"],
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
    state.languages = [
      createTestLanguage(),
      createTestLanguage({ id: "solari", name: "Solari", typology: "isolating" })
    ];
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.notes = [createTestNote({ status: "escalated" })];
    state.reviewDispositions = [disposition];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each(["draft", "under_review", "approved"] as const)("rejects open review dispositions for %s notes", (status) => {
    const state = createEmptyState();
    state.languages = [createTestLanguage()];
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.notes = [createTestNote({ status })];
    state.reviewDispositions = [createTestDisposition()];

    expect(() => parseAppState(state)).toThrow(
      `Open review disposition note note-1 must have a disposition status, found ${status}`
    );
  });

  it("rejects duplicate open review disposition work for the same note and disposition", () => {
    const state = createEmptyState();
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.notes = [createTestNote()];
    state.reviewDispositions = [
      createTestDisposition({ id: "review-disposition-1" }),
      createTestDisposition({ id: "review-disposition-2", reason: "Duplicate open escalation." })
    ];

    expect(() => parseAppState(state)).toThrow(
      "Duplicate open review disposition for language/note/disposition: avenik/note-1/escalated"
    );
  });

  it.each([
    [
      "blank language id",
      createTestElderCorrection({ languageId: "   ", noteId: undefined, contextText: "Custom context only." }),
      "Elder correction languageId must not be blank"
    ],
    [
      "missing language",
      createTestElderCorrection({
        languageId: "missing-language",
        noteId: undefined,
        contextText: "Custom context only."
      }),
      "Elder correction references missing language: missing-language"
    ],
    ["blank note target", createTestElderCorrection({ noteId: "   " }), "Elder correction noteId must not be blank"],
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
    ["blank correction", createTestElderCorrection({ correction: "   " }), "Elder correction text must not be blank"],
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
    ["blank proposer", createTestElderCorrection({ proposedBy: "   " }), "Elder correction proposer must not be blank"],
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
    state.languages = [
      createTestLanguage(),
      createTestLanguage({ id: "solari", name: "Solari", typology: "isolating" })
    ];
    state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
    state.notes = [createTestNote()];
    state.corpus = [createTestCorpusPassage()];
    state.elderCorrections = [correction];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it("validates review disposition work records", () => {
    expect(
      reviewDispositionSchema.parse({
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
      })
    ).toMatchObject({
      disposition: "escalated",
      status: "open",
      assignedTo: "lead-1"
    });
  });
});
