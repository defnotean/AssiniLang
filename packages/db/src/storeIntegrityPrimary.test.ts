import { describe, expect, it } from "vitest";
import { createEmptyState } from "./store";
import {
  auditEventSchema,
  LOCAL_PROTOTYPE_USERS,
  parseAppState,
  reviewApprovalSchema,
  reviewPolicySchema
} from "./schema";
import type { Language, Note } from "./schema";
import {
  createTestLanguage,
  createTestNote,
  createTestCorpusPassage,
  createTestCorpusAnswerKey,
  createTestElderCorrection,
  createTestExercise,
  createTestSubmission,
  createTestGovernanceRecord,
  createTestAuditEvent,
  createTestAiSession,
  createTestEvaluationRun,
  createTestDisposition
} from "./storeTestFixtures";

describe("JsonStore core persisted integrity", () => {
  it("validates audit event records", () => {
    expect(
      auditEventSchema.parse({
        id: "audit-test-1",
        at: "2026-06-06T00:00:00.000Z",
        actorId: "lead-1",
        actorRole: "lead",
        action: "governance_record.created",
        entityType: "governance_record",
        entityId: "governance-1",
        languageId: "avenik",
        summary: "Created governance record.",
        metadata: { policyType: "generation" }
      })
    ).toMatchObject({
      actorId: "lead-1",
      actorRole: "lead",
      action: "governance_record.created",
      metadata: { policyType: "generation" }
    });
  });

  it("validates review policy and approval records", () => {
    expect(
      reviewPolicySchema.parse({
        id: "review-policy-avenik",
        languageId: "avenik",
        assignedReviewerIds: ["reviewer-1", "elder-1"],
        approvalThreshold: 2,
        requiresAssignedReviewer: true,
        updatedAt: "2026-06-06T00:00:00.000Z",
        updatedBy: "lead-1"
      })
    ).toMatchObject({
      languageId: "avenik",
      approvalThreshold: 2,
      requiresAssignedReviewer: true
    });

    expect(
      reviewApprovalSchema.parse({
        id: "review-approval-1",
        languageId: "avenik",
        noteId: "avn-rule-verb-chain-note",
        reviewerId: "reviewer-1",
        approvedAt: "2026-06-06T00:01:00.000Z"
      })
    ).toMatchObject({
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
        explanation: "Second note with a duplicated persistent ID."
      }
    ];

    expect(() => parseAppState(state)).toThrow("Duplicate persisted id in notes: note-1");
  });

  it.each([
    [
      "corpus",
      (state: ReturnType<typeof createEmptyState>) => {
        state.languages = [createTestLanguage()];
        state.corpus = [createTestCorpusPassage({ id: "   " })];
      },
      "Persisted id must not be blank in corpus"
    ],
    [
      "note answer keys",
      (state: ReturnType<typeof createEmptyState>) => {
        state.languages = [createTestLanguage()];
        state.noteAnswerKeys = [createTestNote({ id: "   ", status: "approved" })];
      },
      "Persisted id must not be blank in noteAnswerKeys"
    ],
    [
      "notes",
      (state: ReturnType<typeof createEmptyState>) => {
        state.languages = [createTestLanguage()];
        state.notes = [createTestNote({ id: "   " })];
      },
      "Persisted id must not be blank in notes"
    ],
    [
      "exercises",
      (state: ReturnType<typeof createEmptyState>) => {
        state.languages = [createTestLanguage()];
        state.corpus = [createTestCorpusPassage()];
        state.exercises = [createTestExercise({ id: "   " })];
      },
      "Persisted id must not be blank in exercises"
    ],
    [
      "exercise submissions",
      (state: ReturnType<typeof createEmptyState>) => {
        state.languages = [createTestLanguage()];
        state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
        state.corpus = [createTestCorpusPassage()];
        state.exercises = [createTestExercise()];
        state.exerciseSubmissions = [createTestSubmission({ id: "   " })];
      },
      "Persisted id must not be blank in exerciseSubmissions"
    ],
    [
      "evaluation runs",
      (state: ReturnType<typeof createEmptyState>) => {
        state.languages = [createTestLanguage()];
        state.evaluationRuns = [createTestEvaluationRun({ id: "   " })];
      },
      "Persisted id must not be blank in evaluationRuns"
    ],
    [
      "governance records",
      (state: ReturnType<typeof createEmptyState>) => {
        state.languages = [createTestLanguage()];
        state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
        state.governance = [createTestGovernanceRecord({ id: "   " })];
      },
      "Persisted id must not be blank in governance"
    ],
    [
      "AI sessions",
      (state: ReturnType<typeof createEmptyState>) => {
        state.languages = [createTestLanguage()];
        state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
        state.notes = [createTestNote()];
        state.corpus = [createTestCorpusPassage()];
        state.aiSessions = [createTestAiSession({ id: "   " })];
      },
      "Persisted id must not be blank in aiSessions"
    ],
    [
      "elder corrections",
      (state: ReturnType<typeof createEmptyState>) => {
        state.languages = [createTestLanguage()];
        state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
        state.notes = [createTestNote()];
        state.corpus = [createTestCorpusPassage()];
        state.elderCorrections = [createTestElderCorrection({ id: "   " })];
      },
      "Persisted id must not be blank in elderCorrections"
    ],
    [
      "audit events",
      (state: ReturnType<typeof createEmptyState>) => {
        state.languages = [createTestLanguage()];
        state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
        state.auditEvents = [createTestAuditEvent({ id: "   " })];
      },
      "Persisted id must not be blank in auditEvents"
    ],
    [
      "review policies",
      (state: ReturnType<typeof createEmptyState>) => {
        state.languages = [createTestLanguage()];
        state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
        state.reviewPolicies = [
          {
            id: "   ",
            languageId: "avenik",
            assignedReviewerIds: ["reviewer-1"],
            approvalThreshold: 1,
            requiresAssignedReviewer: true,
            updatedAt: "2026-06-06T00:00:00.000Z",
            updatedBy: "lead-1"
          }
        ];
      },
      "Persisted id must not be blank in reviewPolicies"
    ],
    [
      "review approvals",
      (state: ReturnType<typeof createEmptyState>) => {
        state.languages = [createTestLanguage()];
        state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
        state.notes = [createTestNote({ status: "under_review" })];
        state.reviewApprovals = [
          {
            id: "   ",
            languageId: "avenik",
            noteId: "note-1",
            reviewerId: "reviewer-1",
            approvedAt: "2026-06-06T00:01:00.000Z"
          }
        ];
      },
      "Persisted id must not be blank in reviewApprovals"
    ],
    [
      "review dispositions",
      (state: ReturnType<typeof createEmptyState>) => {
        state.languages = [createTestLanguage()];
        state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
        state.notes = [createTestNote({ status: "escalated" })];
        state.reviewDispositions = [createTestDisposition({ id: "   " })];
      },
      "Persisted id must not be blank in reviewDispositions"
    ]
  ])("rejects persisted %s with a blank top-level id", (_caseName, setupState, errorMessage) => {
    const state = createEmptyState();
    setupState(state);

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    ["blank id", { id: "   " }, "Language id must not be blank"],
    ["blank name", { name: "   " }, "Language name must not be blank: avenik"],
    ["blank description", { description: "   " }, "Language description must not be blank: avenik"],
    ["blank orthography", { orthography: "   " }, "Language orthography must not be blank: avenik"]
  ])("rejects persisted languages with %s", (_caseName, languagePatch, errorMessage) => {
    const state = createEmptyState();
    state.languages = [createTestLanguage(languagePatch)];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    ["blank id", { id: "   " }, "User id must not be blank"],
    ["blank name", { name: "   " }, "User name must not be blank: learner-1"],
    ["blank avatar", { avatarUrl: "   " }, "User avatarUrl must not be blank: learner-1"]
  ])("rejects persisted users with %s", (_caseName, userPatch, errorMessage) => {
    const state = createEmptyState();
    state.users = [{ ...LOCAL_PROTOTYPE_USERS[0], ...userPatch }];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    [
      "note with blank language",
      "notes",
      createTestNote({ languageId: "   " }),
      "Note languageId must not be blank: note-1"
    ],
    [
      "note with missing language",
      "notes",
      createTestNote({ languageId: "missing-language" }),
      "Note references missing language: missing-language"
    ],
    [
      "note answer key with blank language",
      "noteAnswerKeys",
      createTestNote({ id: "note-answer-key-1", languageId: "   ", status: "approved" }),
      "Note answer key languageId must not be blank: note-answer-key-1"
    ],
    [
      "note answer key with missing language",
      "noteAnswerKeys",
      createTestNote({ id: "note-answer-key-1", languageId: "missing-language", status: "approved" }),
      "Note answer key references missing language: missing-language"
    ],
    ["note with blank topic", "notes", createTestNote({ topic: "   " }), "Note topic must not be blank: note-1"],
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
      "note with blank reviewer actor",
      "notes",
      createTestNote({
        reviewer: {
          lastReviewedBy: "   ",
          lastReviewedAt: "2026-06-06T00:00:00.000Z",
          comments: ["Blank reviewers should not restore."]
        }
      }),
      "Note reviewer lastReviewedBy must not be blank"
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
      "note with blank edit-history actor",
      "notes",
      createTestNote({
        editHistory: [
          {
            at: "2026-06-06T00:00:00.000Z",
            by: "   ",
            action: "reviewed",
            summary: "Blank edit-history writers should not restore."
          }
        ]
      }),
      "Note editHistory by must not be blank"
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
            by: "test-generator",
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
            by: "test-generator",
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
      "blank evidence passage",
      "notes",
      createTestNote({ evidencePassageIds: ["   "], evidenceCount: 1 }),
      "Note evidencePassageId must not be blank"
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
      "blank example passage",
      "notes",
      createTestNote({
        examples: [{ passageId: "   ", target: "missing target", translation: "Missing translation." }]
      }),
      "Note example passageId must not be blank"
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
    state.languages = [
      createTestLanguage(),
      createTestLanguage({ id: "solari", name: "Solari", typology: "isolating" })
    ];
    state.corpus = [createTestCorpusPassage(), createTestCorpusPassage({ id: "other-passage", languageId: "solari" })];
    if (collection === "notes") {
      state.notes = [note];
    } else {
      state.noteAnswerKeys = [note];
    }

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each([
    [
      "blank language",
      createTestCorpusPassage({ languageId: "   " }),
      "Corpus passage languageId must not be blank: passage-1"
    ],
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
          use: "testing-only",
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
      "blank passage id",
      createTestCorpusAnswerKey({ passageId: "   " }),
      "Corpus answer key passageId must not be blank"
    ],
    [
      "missing passage",
      createTestCorpusAnswerKey({ passageId: "missing-passage" }),
      "Corpus answer key references missing passage: missing-passage"
    ],
    [
      "blank language id",
      createTestCorpusAnswerKey({ languageId: "   " }),
      "Corpus answer key languageId must not be blank"
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
    state.reviewApprovals = [
      {
        id: "review-approval-1",
        approvedAt: "2026-06-06T00:01:00.000Z",
        ...approvalPatch
      }
    ];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });

  it.each(["draft", "contested", "rejected", "deferred", "escalated"] as const)(
    "rejects persisted review approvals for %s notes",
    (status) => {
      const state = createEmptyState();
      state.languages = [createTestLanguage()];
      state.users = LOCAL_PROTOTYPE_USERS.map((user) => ({ ...user }));
      state.notes = [createTestNote({ status })];
      state.reviewApprovals = [
        {
          id: `review-approval-${status}`,
          languageId: "avenik",
          noteId: "note-1",
          reviewerId: "reviewer-1",
          approvedAt: "2026-06-06T00:01:00.000Z"
        }
      ];

      expect(() => parseAppState(state)).toThrow(
        `Review approval note note-1 must be under_review or approved, found ${status}`
      );
    }
  );

  it.each([
    [
      "blank language",
      {
        languageId: "   ",
        assignedReviewerIds: ["reviewer-1"],
        approvalThreshold: 1,
        requiresAssignedReviewer: true
      },
      "Review policy languageId must not be blank"
    ],
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
    state.reviewPolicies = [
      {
        id: "review-policy-avenik",
        languageId: "avenik",
        updatedAt: "2026-06-06T00:00:00.000Z",
        updatedBy: "lead-1",
        ...policyPatch
      }
    ];

    expect(() => parseAppState(state)).toThrow(errorMessage);
  });
});
